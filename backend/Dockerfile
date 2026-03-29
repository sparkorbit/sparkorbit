FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.lock.txt /tmp/backend-requirements.txt
COPY pipelines/source_fetch/requirements.lock.txt /tmp/source-fetch-requirements.txt

RUN pip install --no-cache-dir \
    -r /tmp/backend-requirements.txt \
    -r /tmp/source-fetch-requirements.txt

COPY . /app

RUN chmod +x /app/backend/docker/entrypoint-api.sh /app/backend/docker/entrypoint-worker.sh

EXPOSE 8787

CMD ["/app/backend/docker/entrypoint-api.sh"]
