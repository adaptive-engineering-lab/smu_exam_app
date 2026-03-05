#!/bin/bash
set -e

echo "==> Running database migrations..."
alembic upgrade head

echo "==> Starting application..."
exec gunicorn app.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers "${GUNICORN_WORKERS:-2}" \
  --bind "0.0.0.0:${PORT:-8000}" \
  --timeout 120 \
  --access-logfile - \
  --error-logfile -
