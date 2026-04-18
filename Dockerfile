FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

WORKDIR /app

# System deps (pypdf wheels cover most of what we need; keep base small).
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/backend/requirements.txt

# App source
COPY backend /app/backend
COPY corpus /app/corpus

ENV CORPUS_DIR=/data/corpus

# Non-root user
RUN useradd --system --create-home --shell /usr/sbin/nologin app \
    && mkdir -p /data/corpus \
    && chown -R app:app /app /data
USER app

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://localhost:${PORT}/api/health || exit 1

CMD ["sh", "-c", "uvicorn backend.server:app --host 0.0.0.0 --port ${PORT:-8080}"]
