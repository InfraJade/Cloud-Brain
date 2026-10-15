# CLOUD BRAIN backend — the FastAPI proxy between the website and the AWS Cloud Brain API.
# Secrets (AWS read keys, JWT secret, users) are NOT baked in: they come from backend/.env
# at runtime via docker-compose `env_file`.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# The code imports itself as the `backend` package (uvicorn backend.main:app).
COPY requirements.txt /app/backend/requirements.txt
RUN pip install -r /app/backend/requirements.txt

COPY . /app/backend

RUN useradd --create-home --uid 10001 cloudbrain
USER cloudbrain

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/api/healthz', timeout=4).status == 200 else 1)"

# Only nginx can reach this container, so its X-Forwarded-For header is trusted: rate limits
# then apply per real visitor instead of to everyone behind the proxy.
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--forwarded-allow-ips", "*"]
