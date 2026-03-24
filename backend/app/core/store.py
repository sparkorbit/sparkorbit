from __future__ import annotations

import socket
from dataclasses import dataclass, field
from typing import Protocol
from urllib.parse import unquote, urlparse

from .constants import DEFAULT_REDIS_URL


class StoreError(RuntimeError):
    pass


class RedisLike(Protocol):
    def get(self, key: str) -> str | None: ...

    def set(self, key: str, value: str) -> None: ...

    def delete(self, *keys: str) -> int: ...

    def expire(self, key: str, seconds: int) -> None: ...

    def rpush(self, key: str, *values: str) -> int: ...

    def lrange(self, key: str, start: int, stop: int) -> list[str]: ...

    def lpop(self, key: str) -> str | None: ...


def _read_line(stream) -> bytes:
    line = stream.readline()
    if not line.endswith(b"\r\n"):
        raise StoreError("Malformed Redis response.")
    return line[:-2]


def _parse_response(stream):
    prefix = stream.read(1)
    if not prefix:
        raise StoreError("Redis connection closed unexpectedly.")
    if prefix == b"+":
        return _read_line(stream).decode("utf-8")
    if prefix == b"-":
        raise StoreError(_read_line(stream).decode("utf-8"))
    if prefix == b":":
        return int(_read_line(stream))
    if prefix == b"$":
        length = int(_read_line(stream))
        if length == -1:
            return None
        payload = stream.read(length)
        stream.read(2)
        return payload.decode("utf-8")
    if prefix == b"*":
        length = int(_read_line(stream))
        if length == -1:
            return None
        return [_parse_response(stream) for _ in range(length)]
    raise StoreError(f"Unsupported Redis response prefix: {prefix!r}")


def _encode_command(*parts: str) -> bytes:
    payload = [f"*{len(parts)}\r\n".encode("utf-8")]
    for part in parts:
        encoded = part.encode("utf-8")
        payload.append(f"${len(encoded)}\r\n".encode("utf-8"))
        payload.append(encoded)
        payload.append(b"\r\n")
    return b"".join(payload)


@dataclass(frozen=True)
class RedisUrl:
    host: str
    port: int
    db: int = 0
    password: str | None = None


def parse_redis_url(url: str = DEFAULT_REDIS_URL) -> RedisUrl:
    parsed = urlparse(url)
    if parsed.scheme not in {"redis", "rediss"}:
        raise StoreError(f"Unsupported Redis URL scheme: {parsed.scheme}")
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or 6379
    path = (parsed.path or "/0").lstrip("/")
    db = int(path or "0")
    password = parsed.password
    if password is not None:
        password = unquote(password)
    return RedisUrl(host=host, port=port, db=db, password=password)


class RedisStore(RedisLike):
    def __init__(self, url: str = DEFAULT_REDIS_URL, timeout: float = 5.0) -> None:
        self.config = parse_redis_url(url)
        self.timeout = timeout

    def _execute(self, *parts: str):
        with socket.create_connection(
            (self.config.host, self.config.port),
            timeout=self.timeout,
        ) as connection:
            reader = connection.makefile("rb")
            try:
                if self.config.password:
                    connection.sendall(_encode_command("AUTH", self.config.password))
                    _parse_response(reader)
                if self.config.db:
                    connection.sendall(_encode_command("SELECT", str(self.config.db)))
                    _parse_response(reader)
                connection.sendall(_encode_command(*parts))
                return _parse_response(reader)
            finally:
                reader.close()

    def get(self, key: str) -> str | None:
        value = self._execute("GET", key)
        return value if isinstance(value, str) or value is None else str(value)

    def set(self, key: str, value: str) -> None:
        self._execute("SET", key, value)

    def delete(self, *keys: str) -> int:
        if not keys:
            return 0
        deleted = self._execute("DEL", *keys)
        return int(deleted)

    def expire(self, key: str, seconds: int) -> None:
        self._execute("EXPIRE", key, str(seconds))

    def rpush(self, key: str, *values: str) -> int:
        if not values:
            return 0
        result = self._execute("RPUSH", key, *values)
        return int(result)

    def lrange(self, key: str, start: int, stop: int) -> list[str]:
        values = self._execute("LRANGE", key, str(start), str(stop))
        if values is None:
            return []
        return [str(value) for value in values]

    def lpop(self, key: str) -> str | None:
        value = self._execute("LPOP", key)
        return value if isinstance(value, str) or value is None else str(value)


@dataclass
class MemoryStore(RedisLike):
    values: dict[str, str] = field(default_factory=dict)
    lists: dict[str, list[str]] = field(default_factory=dict)
    expirations: dict[str, int] = field(default_factory=dict)

    def get(self, key: str) -> str | None:
        return self.values.get(key)

    def set(self, key: str, value: str) -> None:
        self.values[key] = value

    def delete(self, *keys: str) -> int:
        deleted = 0
        for key in keys:
            if key in self.values:
                del self.values[key]
                deleted += 1
            if key in self.lists:
                del self.lists[key]
                deleted += 1
            self.expirations.pop(key, None)
        return deleted

    def expire(self, key: str, seconds: int) -> None:
        self.expirations[key] = seconds

    def rpush(self, key: str, *values: str) -> int:
        bucket = self.lists.setdefault(key, [])
        bucket.extend(values)
        return len(bucket)

    def lrange(self, key: str, start: int, stop: int) -> list[str]:
        values = self.lists.get(key, [])
        if stop == -1:
            stop = len(values) - 1
        if not values or stop < start:
            return []
        return values[start : stop + 1]

    def lpop(self, key: str) -> str | None:
        values = self.lists.get(key)
        if not values:
            return None
        item = values.pop(0)
        if not values:
            self.lists.pop(key, None)
        return item

    def ttl_for(self, key: str) -> int | None:
        return self.expirations.get(key)
