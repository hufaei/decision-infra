# SemIf adapter

SemIf accepts one categorical decision row at a time; it is not natively compatible
with Jev's `/v1/systemone` body. This service is an explicit mapping layer. It supports
Jev `choice` questions with 2–16 options and returns the familiar choice answer shape.
`score` and `noul` return a typed `501` instead of pretending their semantics are
available from the categorical upstream interface.

The adapter code is pinned to SemIf commit
`1f2dea3e25379f9dfc98cb83c324f00ab5deda37`. The default checkpoint is
`Qwen/Qwen3.5-4B` revision `851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a`.
Neither source nor weights are vendored.

```sh
export HF_HOME=/path/on/a/large/disk/huggingface
uv sync --extra model
uv run semif-systemone                 # 127.0.0.1:8009
```

Use `--device cuda` or `--device mps` explicitly when desired. The importable ASGI
`app` has an unavailable backend by design, so importing it cannot download or load a
model; the launcher constructs the upstream backend once before serving.

SemIf's option probabilities are conditional, uncalibrated scores. The returned
`confidence` is a local max-probability-over-uniform concentration heuristic; it is not
Jev's private implementation and does not make SemIf's probabilities calibrated.
