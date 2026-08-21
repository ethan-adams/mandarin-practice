# mandarin-api — runs on the Lightsail box beside CCP Signal (docker-compose).
# faster-whisper (the `transcribe` extra) is installed here for the live service;
# the model is downloaded lazily at runtime and cached in a mounted volume.
FROM python:3.11-slim

WORKDIR /app

# ffmpeg is needed by faster-whisper to decode uploaded clips.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --no-cache-dir ".[transcribe]"

COPY app ./app
COPY scripts ./scripts

ENV WHISPER_MODEL=base
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
