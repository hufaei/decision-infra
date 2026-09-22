# Laya Multilingual service

This is a thin HTTP sidecar around the official Laya runtime. It keeps the gateway contract stable while pinning both executable code and model identity:

- runtime: `laya==0.3.5`, corresponding to upstream commit `573e5b62696ba441230cd6be71d593331b5d23af`
- weights: `convaiinnovations/laya-multilingual@052592a15d198d9ad47da779604259b10b47b7aa`
- route ID: `laya-multilingual`

The launcher downloads only the pinned snapshot, then gives its local directory to the runtime. Importing the package does not load or download a model.

```sh
uv sync --python 3.12 --package laya-systemone-service --extra model
uv run --package laya-systemone-service --extra model laya-systemone --device cpu
curl http://127.0.0.1:8010/health
```

Use `--device mps` on Apple Silicon or `--device cuda` with a compatible NVIDIA host environment. The Compose profile intentionally defaults to CPU; macOS containers cannot access Metal/MPS.

Laya Multilingual natively implements `choice`, `score`, and `noul`. Missing or null instructions become the question ID. The model's published temperatures are not calibrated for an arbitrary application domain, so validate probability thresholds on domain data before automating high-risk actions.
