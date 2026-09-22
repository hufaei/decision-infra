# Thin deployment layer derived from upstream docker/Dockerfile at the pinned commit.
# It launches upstream's existing POST /v1/systemone server; no server is copied here.
FROM python:3.12-bookworm

ARG REFLEX_COMMIT=19586a1374dca138eddf5d7b8889cae8dfa505f6
COPY --from=ghcr.io/astral-sh/uv:0.11.26 /uv /uvx /bin/
ENV UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_COMPILE_BYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/models/huggingface

RUN apt-get update \
    && apt-get install --yes --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN git init \
    && git remote add origin https://github.com/kshetrajna12/reflex.git \
    && git fetch --depth 1 origin "$REFLEX_COMMIT" \
    && git checkout --detach FETCH_HEAD \
    && rm -rf .git
RUN uv sync --frozen --no-dev --no-editable && rm -rf /root/.cache/uv

ENV PORT=8000
COPY entrypoint.sh /entrypoint.sh
VOLUME ["/models/huggingface"]
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30m --retries=3 \
    CMD ["uv", "run", "--no-sync", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]
CMD ["sh", "/entrypoint.sh"]
