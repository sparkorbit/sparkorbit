from __future__ import annotations

from fastapi import Request

from ..core.store import RedisLike


def get_store(request: Request) -> RedisLike:
    return request.app.state.store
