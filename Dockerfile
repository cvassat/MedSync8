# Multi-stage: prefetch the local embedding model so the image ships with
# weights baked in and the first /api/chat doesn't block on a 150MB download.
# Stage 1: install deps + warm the sentence-transformers cache.
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/hfcache

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /build/requirements.txt

# Install CPU-only torch wheel to avoid pulling CUDA (saves ~2GB).
RUN pip install --upgrade pip \
 && pip install --extra-index-url https://download.pytorch.org/whl/cpu \
      -r /build/requirements.txt

# Warm the HF cache: downloads bge-small-en-v1.5 (~130MB) once, at build time.
ARG LOCAL_EMBED_MODEL=sentence-transformers/bge-small-en-v1.5
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${LOCAL_EMBED_MODEL}')"


# Stage 2: minimal runtime.
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/hfcache \
    PORT=8080 \
    EMBED_BACKEND=local \
    CORPUS_DIR=/data/corpus

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy installed site-packages + prewarmed model cache from builder.
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --from=builder /opt/hfcache /opt/hfcache

COPY backend /app/backend
COPY corpus /app/corpus

RUN useradd --system --create-home --shell /usr/sbin/nologin app \
    && mkdir -p /data/corpus \
    && chown -R app:app /app /data /opt/hfcache
USER app

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://localhost:${PORT}/api/health || exit 1

CMD ["sh", "-c", "uvicorn backend.server:app --host 0.0.0.0 --port ${PORT:-8080}"]
