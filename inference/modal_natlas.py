"""
Serve N-ATLAS (NCAIR1/N-ATLaS, unmodified weights) on a Modal GPU with vLLM.

The result is an OpenAI-compatible endpoint, protected by a bearer key, that the
LocalizeKit backend calls server-side:

    POST https://<workspace>--localizekit-natlas-serve.modal.run/v1/chat/completions
    Authorization: Bearer <NATLAS_API_KEY>

One-time setup (see inference/README.md):
    modal secret create natlas-hf HF_TOKEN=<token that accepted the N-ATLaS licence>
    modal secret create localizekit-natlas NATLAS_API_KEY=<random key>
    modal deploy inference/modal_natlas.py

The container scales to zero when idle, so the first request after a pause waits
for a cold start (download is cached in a Volume; loading takes a few minutes).
Set MIN_CONTAINERS=1 at deploy time to keep one GPU warm during judging.
"""

import os
import subprocess

import modal

MODEL = "NCAIR1/N-ATLaS"
PORT = 8000
MIN_CONTAINERS = int(os.environ.get("MIN_CONTAINERS", "0"))

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("vllm==0.9.2", "huggingface_hub[hf_transfer]==0.33.4")
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
)

hf_cache = modal.Volume.from_name("localizekit-hf-cache", create_if_missing=True)
vllm_cache = modal.Volume.from_name("localizekit-vllm-cache", create_if_missing=True)

app = modal.App("localizekit-natlas")


@app.function(
    image=image,
    gpu="L4",  # 24 GB: fits the 8B model in BF16 with an 8k context
    secrets=[
        modal.Secret.from_name("natlas-hf"),
        modal.Secret.from_name("localizekit-natlas"),
    ],
    volumes={"/root/.cache/huggingface": hf_cache, "/root/.cache/vllm": vllm_cache},
    scaledown_window=10 * 60,
    min_containers=MIN_CONTAINERS,
    timeout=60 * 60,
)
@modal.concurrent(max_inputs=16)
@modal.web_server(port=PORT, startup_timeout=20 * 60)
def serve():
    cmd = [
        "vllm", "serve", MODEL,
        "--served-model-name", MODEL,
        "--host", "0.0.0.0",
        "--port", str(PORT),
        "--dtype", "bfloat16",
        "--max-model-len", "8192",
        "--gpu-memory-utilization", "0.90",
    ]
    # Pass the key by environment, not on the command line: vLLM logs its CLI
    # arguments at startup, which would put the key in the logs.
    env = {**os.environ, "VLLM_API_KEY": os.environ["NATLAS_API_KEY"]}
    subprocess.Popen(cmd, env=env)
