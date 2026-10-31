FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    DB_PATH=/app/storage/saiam.db KNOWLEDGE_DIR=/app/data/knowledge

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app app
COPY widget widget
COPY static static
COPY scripts scripts
COPY data/knowledge data/knowledge

# non-root; /app/storage holds the SQLite DB (mounted as a volume)
RUN useradd -r -u 10001 appuser && mkdir -p /app/storage && chown -R appuser /app/storage
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=4).status==200 else 1)"

# One worker on purpose: SQLite + in-memory rate limiter. Scale out after moving to Postgres/Redis.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
