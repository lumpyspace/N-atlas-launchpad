# Serving N-ATLAS locally with Ollama (chosen route)

N-ATLAS (`NCAIR1/N-ATLaS`) is a **gated** Hugging Face model. You must accept its
license on the model page before any download works. Background:
[`../docs/N-ATLAS-INTEGRATION.md`](../docs/N-ATLAS-INTEGRATION.md).

> ⚠️ Nothing here downloads or ships the model. These are commands **you** run
> after accepting the license. N-ATLAS weights are never committed to this repo.

**Good news:** Ollama ≥ 0.34 imports Hugging Face **safetensors directly** and
quantizes them itself — **no llama.cpp build, no Python conversion needed.**

---

## 0. Disk space (read first)

The BF16 8B weights are ~16GB; the final Q4 model is ~5GB. Make sure you have
**~30GB+ free** before you start. Once `ollama create` succeeds you can delete
the raw weights folder to reclaim ~16GB.

## 1. Accept the license + install the downloader

1. Sign in and accept the license at <https://huggingface.co/NCAIR1/N-ATLaS>.
2. Create a read token: <https://huggingface.co/settings/tokens>.
3. Install the HF CLI and log in:
   ```powershell
   pip install -U huggingface_hub
   hf auth login       # paste your token (run in a real terminal; the prompt is interactive)
   ```
   > NOTE: `huggingface_hub` v1.x renamed the CLI from `huggingface-cli` to
   > **`hf`**. Login is `hf auth login`; download is `hf download`.

## 2. Download the weights

On Windows **without symlink support** (the default), `hf download --local-dir`
copies files AND keeps a second copy in the HF cache (~2x disk). To stay at one
copy, download into the **cache** and point the Modelfile at the cache snapshot
folder (see step 3). Name the safetensors shards explicitly — in v1.x the
`--include` glob is unreliable and may silently skip the weight shards:

```powershell
hf download NCAIR1/N-ATLaS config.json generation_config.json `
  model.safetensors.index.json tokenizer.json tokenizer_config.json `
  special_tokens_map.json `
  model-00001-of-00004.safetensors model-00002-of-00004.safetensors `
  model-00003-of-00004.safetensors model-00004-of-00004.safetensors
```
`hf download` prints the resolved snapshot path on the last line, e.g.
`C:\Users\<you>\.cache\huggingface\hub\models--NCAIR1--N-ATLaS\snapshots\<hash>`.
Use that path as the `FROM` in a local Modelfile. (Shard count/names come from
`model.safetensors.index.json` — this model is 4 shards, ~16GB total.)

## 3. Convert + quantize + register with Ollama

The tracked `Modelfile` uses `FROM ./natlas-weights`. If you downloaded to the
cache instead (step 2), make a local, git-ignored copy pointing at the snapshot
path so the tracked Modelfile stays machine-agnostic:

```powershell
(Get-Content .\Modelfile) -replace '^FROM .*', 'FROM C:\Users\<you>\.cache\huggingface\hub\models--NCAIR1--N-ATLaS\snapshots\<hash>' |
  Set-Content .\Modelfile.local
ollama create n-atlas --quantize q4_K_M -f .\Modelfile.local
```
Ollama reads the safetensors, converts to GGUF, quantizes to Q4_K_M (~5GB), and
registers it as `n-atlas`.

Quick sanity check:
```powershell
ollama run n-atlas "Say hello in Hausa."
```

(Optional) reclaim ~16GB once the model is registered by clearing the HF cache:
```powershell
hf cache delete   # interactive; or remove the models--NCAIR1--N-ATLaS cache dir
```

## 4. Point N-ATLAS Forge at it

Ollama serves an OpenAI-compatible API at `http://localhost:11434/v1`. In
`../backend/.env`:
```
NATLAS_PROVIDER=http
NATLAS_ENDPOINT=http://localhost:11434/v1
NATLAS_MODEL=n-atlas
```
Then verify the real chain:
```powershell
cd ..\backend
npm run healthcheck
```
It should now report **real N-ATLAS** (not mock).

---

## GPU alternative (not this machine)
On a box with ~16GB+ VRAM you can skip quantization and serve full quality with
vLLM: `pip install vllm && vllm serve NCAIR1/N-ATLaS --port 8000`, then set
`NATLAS_ENDPOINT=http://localhost:8000/v1` and `NATLAS_MODEL=NCAIR1/N-ATLaS`.
