FROM python:3.12-bookworm

COPY --from=ghcr.io/astral-sh/uv:0.11.26 /uv /uvx /bin/
ENV UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_COMPILE_BYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/models/huggingface

WORKDIR /app
COPY pyproject.toml uv.lock ./
COPY services/semif/pyproject.toml services/semif/README.md services/semif/
COPY services/semif/src services/semif/src
RUN uv sync --frozen --package semif-systemone-service --extra model --no-dev \
    && rm -rf /root/.cache/uv

VOLUME ["/models/huggingface"]
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30m --retries=3 \
    CMD ["uv", "run", "--no-sync", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]
CMD ["uv", "run", "--no-sync", "semif-systemone", "--host", "0.0.0.0", "--port", "8000", "--device", "cuda"]
