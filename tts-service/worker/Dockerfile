ARG PYTHON_VERSION=3.11
FROM python:${PYTHON_VERSION}-slim-bookworm

ARG ENGINE
ARG REQUIREMENTS

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       build-essential \
       ffmpeg \
       git \
       libsndfile1 \
       espeak-ng \
    && rm -rf /var/lib/apt/lists/*

COPY requirements/common.txt /tmp/common.txt
RUN pip install --no-cache-dir -r /tmp/common.txt

RUN pip install --no-cache-dir torch==2.6.0 torchaudio==2.6.0 \
    --index-url https://download.pytorch.org/whl/cpu

COPY requirements/${REQUIREMENTS} /tmp/model.txt
RUN pip install --no-cache-dir -r /tmp/model.txt

COPY worker /app/worker

ENV ENGINE=${ENGINE}
ENV TTS_DATA_ROOT=/data
ENV HF_HOME=/root/.cache/huggingface

EXPOSE 8100

CMD ["sh", "-c", "uvicorn worker.app:app --host 0.0.0.0 --port ${PORT:-8100} --workers 1"]
