FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ffmpeg \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements/gateway.txt /tmp/gateway.txt
RUN pip install --no-cache-dir -r /tmp/gateway.txt

COPY gateway /app/gateway

ENV TTS_DATA_ROOT=/data

RUN mkdir -p /data/voices

EXPOSE 8000

CMD ["uvicorn", "gateway.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
