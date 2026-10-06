# Serving N-ATLAS locally (inference notes)

N-ATLAS (`NCAIR1/N-ATLaS`) is a **gated** Hugging Face model. You must accept its
license on the model page before any download will work. See
[`../docs/N-ATLAS-INTEGRATION.md`](../docs/N-ATLAS-INTEGRATION.md) for the full
background. This folder documents how to turn those weights into a local,
OpenAI-compatible endpoint the backend can call.

> ⚠️ Nothing here downloads or ships the model. These are commands **you** run
> after accepting the license. We never bundle N-ATLAS weights in this repo.

---

## Prerequisites

1. A Hugging Face account that has **accepted the N-ATLaS license**.
2. A HF access token: <https://huggingface.co/settings/tokens>.
3. `pip install -U "huggingface_hub[cli]"` and `huggingface-cli login`.

## Route A — Ollama on CPU (works on a no-GPU laptop)

An 8B model in fp16 is ~16GB — too big to run comfortably on 16GB RAM. Quantize
to **GGUF Q4_K_M** (~5GB) first. There is **no official N-ATLaS GGUF**, so you
build it from the safetensors:

```bash
# 1. Download the gated weights (after accepting the license)
huggingface-cli download NCAIR1/N-ATLaS --local-dir ./natlas-weights

# 2. Convert safetensors -> GGUF, then quantize (uses llama.cpp tooling)
#    git clone https://github.com/ggerganov/llama.cpp && cd llama.cpp && pip install -r requirements.txt
python convert_hf_to_gguf.py ../natlas-weights --outfile natlas-f16.gguf --outtype f16
./llama-quantize natlas-f16.gguf natlas-Q4_K_M.gguf Q4_K_M

# 3. Register it with Ollama using the Modelfile in this folder
ollama create n-atlas -f ./Modelfile
ollama run n-atlas "Bawo ni?"   # quick sanity check
```

Ollama then serves an OpenAI-compatible API at `http://localhost:11434/v1`.
Point the backend at it:

```
NATLAS_PROVIDER=http
NATLAS_ENDPOINT=http://localhost:11434/v1
NATLAS_MODEL=n-atlas
```

## Route B — GPU with vLLM (full quality)

On a machine/instance with ~16GB+ VRAM:

```bash
pip install vllm
vllm serve NCAIR1/N-ATLaS --port 8000
# OpenAI-compatible server now at http://localhost:8000/v1
```

```
NATLAS_PROVIDER=http
NATLAS_ENDPOINT=http://localhost:8000/v1
NATLAS_MODEL=NCAIR1/N-ATLaS
```

## Verifying

From `../backend`: `npm run healthcheck`. It reports whether the app reached
**real N-ATLAS** or is still on the mock provider.
