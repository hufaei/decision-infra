# Reflex launch layer

Reflex already implements `POST /v1/systemone`; this directory deliberately contains no
second server. The Dockerfile follows upstream's official image recipe, pins upstream
`stable` commit `19586a1374dca138eddf5d7b8889cae8dfa505f6`, and resolves the base model at
Hugging Face revision `851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a` before startup.

```sh
docker build -t reflex-local services/reflex
docker run --rm --gpus all -p 127.0.0.1:8008:8000 \
  -v "$HOME/.cache/huggingface:/models/huggingface" \
  reflex-local
curl http://127.0.0.1:8008/health
```

The Hugging Face cache is a declared volume, so checkpoints are downloaded at runtime
and persist on the host rather than in image layers. Keep this service on loopback or a
private container network; the gateway does not currently forward an upstream Reflex
API key. The first request compiles upstream's Triton kernels and will be slower than
warm requests.

The pinned upstream accepts 2–26 options in a `choice` and 2–10 levels in a `score`;
official Jev accepts a broader shape. The gateway fills omitted instructions with the
question ID, but does not invent missing options or fall back to another model.

No image is published by this repository.
