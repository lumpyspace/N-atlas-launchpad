/**
 * What puts an exported app online: a Modal app (public HTTPS link, scales to
 * zero), Vercel files, a Dockerfile for any host, and a Render blueprint. Pure text, no
 * imports. Mirror of frontend/src/export/deployKit.ts: the Go live guide
 * quotes these exact files and commands (tests/deploy.test.ts keeps the two identical).
 */

export type DeployLang = "js" | "python";

/** The project's folder and service name: lowercase words joined by dashes. */
export function exportSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "natlas-app"
  );
}

/** Keeps .env (your keys) out of git, for hosts that deploy from GitHub. */
export const GITIGNORE = `.env
node_modules/
__pycache__/
.venv/
`;

/** Modal app names: lowercase letters, digits and dashes, at most 64 characters. */
export function modalAppName(slug: string): string {
  const clean = slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `natlas-${clean || "app"}`.slice(0, 60).replace(/-+$/, "");
}

/** deploy/modal_app.py — `modal deploy deploy/modal_app.py` prints the app's public link. */
export function modalApp(slug: string, lang: DeployLang): string {
  const js = lang === "js";
  const image = js
    ? `# Node 22 for the server; Modal needs Python in the image to run it.
image = (
    modal.Image.from_registry("node:22-slim", add_python="3.12")
    .add_local_dir(ROOT, "/app", copy=True, ignore=IGNORE)
    .run_commands("cd /app && npm install --omit=dev")
)`
    : `image = modal.Image.debian_slim(python_version="3.12").add_local_dir(ROOT, "/app", ignore=IGNORE)`;
  const start = js ? `["node", "src/server.js"]` : `["python", "server.py"]`;
  return `"""Put this app online on Modal: a public HTTPS link that sleeps when nobody uses it.

    pip install modal && modal setup      # once: connects this computer to your Modal account
    modal deploy deploy/modal_app.py      # prints your app's link

Settings come from .env in the project folder (NATLAS_BASE_URL, NATLAS_MODEL,
NATLAS_API_KEY) and are sent to Modal as a secret, never baked into the image.
N-ATLAS must be reachable from the internet — for example N-ATLAS on a Modal
GPU — not localhost on your computer.
"""
import os
import subprocess
from pathlib import Path

import modal

ROOT = Path(__file__).resolve().parent.parent
PORT = 3000
# Never upload secrets or local clutter: .env travels as a Modal secret instead.
IGNORE = [".env", ".git", "node_modules", "__pycache__", ".venv"]

${image}

app = modal.App("${modalAppName(slug)}")


@app.function(
    image=image,
    secrets=[modal.Secret.from_dotenv(ROOT)],
    scaledown_window=5 * 60,  # sleep after 5 idle minutes; the next visitor waits a few seconds
    timeout=10 * 60,
)
@modal.concurrent(max_inputs=50)
@modal.web_server(port=PORT, startup_timeout=120)
def web():
    subprocess.Popen(${start}, cwd="/app", env={**os.environ, "PORT": str(PORT)})
`;
}

export function dockerfile(lang: DeployLang): string {
  return lang === "js"
    ? `# Runs anywhere that runs containers (Render, Railway, Fly.io, Google Cloud Run, a VPS…).
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=3000
EXPOSE 3000
CMD ["node", "src/server.js"]
`
    : `# Runs anywhere that runs containers (Render, Railway, Fly.io, Google Cloud Run, a VPS…).
FROM python:3.12-slim
WORKDIR /app
COPY . .
ENV PORT=3000 PYTHONUNBUFFERED=1
EXPOSE 3000
CMD ["python", "server.py"]
`;
}

export const DOCKERIGNORE = `.env
.git
node_modules
__pycache__
.venv
`;

/** render.yaml — Render's free web service, created from this file in your GitHub repo. */
export function renderYaml(slug: string, lang: DeployLang): string {
  const js = lang === "js";
  return `# Render: push this project to GitHub, then New → Blueprint and pick the repo.
# Render asks for the three settings below (from your .env) and gives you a public link.
services:
  - type: web
    name: ${slug}
    runtime: ${js ? "node" : "python"}
    plan: free
    buildCommand: ${js ? "npm install --omit=dev" : "pip install -r requirements.txt"}
    startCommand: ${js ? "npm start" : "python server.py"}
    envVars:
      - key: NATLAS_BASE_URL
        sync: false
      - key: NATLAS_MODEL
        sync: false
      - key: NATLAS_API_KEY
        sync: false
`;
}

/** vercel.json — the chat page from public/, the server as one function behind /api. */
export function vercelJson(lang: DeployLang): string {
  const fn = lang === "js" ? "api/index.js" : "api/index.py";
  return JSON.stringify(
    {
      framework: null,
      buildCommand: "",
      outputDirectory: "public",
      functions: { [fn]: { maxDuration: 60, includeFiles: "{.env,knowledge/**,public/**,*.py,src/**}" } },
      rewrites: [{ source: "/api/(.*)", destination: "/" + fn }],
    },
    null,
    2,
  ) + "\n";
}

/** api/index.* — Vercel's entry: the same server, run by the platform instead of listening. */
export function vercelEntry(lang: DeployLang): string {
  return lang === "js"
    ? `// Vercel runs your server as a function: src/server.js skips app.listen() when VERCEL is set.
import app from "../src/server.js";

export default app;
`
    : `"""Vercel runs your server as a function: the same request handler as server.py."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import Handler as handler  # noqa: E402,F401 — Vercel looks for "handler"
`;
}

/** Every deploy file, by path in the project. */
export function deployFiles(slug: string, lang: DeployLang): Record<string, string> {
  return {
    "deploy/modal_app.py": modalApp(slug, lang),
    Dockerfile: dockerfile(lang),
    ".dockerignore": DOCKERIGNORE,
    ".gitignore": GITIGNORE,
    "render.yaml": renderYaml(slug, lang),
    "vercel.json": vercelJson(lang),
    [lang === "js" ? "api/index.js" : "api/index.py"]: vercelEntry(lang),
  };
}
