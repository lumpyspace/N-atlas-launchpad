/**
 * What turns an export into an app you can open: a chat page served by the
 * app's own server, a Python server to match the JavaScript one, and .env
 * loading for every script. The JavaScript server itself comes from the build
 * plan (backend/src/blueprint/features.ts).
 */

/** Interface text on the chat page, in the project's language (from Launchpad's dictionaries). */
export interface PageText {
  placeholder: string;
  send: string;
  thinking: string;
  error: string;
  poweredBy: string;
}

export const ENGLISH_PAGE: PageText = {
  placeholder: "Type your message…",
  send: "Send",
  thinking: "Thinking…",
  error: "Something went wrong — please try again.",
  poweredBy: "Powered by N-ATLAS",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** public/index.html — a small, mobile-friendly chat page that posts to the app's /api/chat. */
export function chatPage(name: string, purpose: string, langCode: string, text: PageText = ENGLISH_PAGE): string {
  // One clean sentence for customers: the first of the purpose, tidied.
  const first = purpose.replace(/\.{2,}/g, ".").split(/(?<=[.!?])\s+/)[0].trim();
  const intro = first.charAt(0).toUpperCase() + first.slice(1).replace(/[.!?]*$/, ".");
  // The page's script avoids backticks and template placeholders so it can live in this template.
  return `<!doctype html>
<html lang="${esc(langCode === "pid" ? "pcm" : langCode)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)}</title>
<style>
  :root { --brand: #15803d; --ink: #0f172a; --muted: #64748b; --line: #e2e8f0; --bg: #f8fafc; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink); background: var(--bg); }
  .app { max-width: 720px; margin: 0 auto; min-height: 100vh; display: flex; flex-direction: column; background: #fff; border-left: 1px solid var(--line); border-right: 1px solid var(--line); }
  header { padding: 16px 20px; border-bottom: 1px solid var(--line); }
  header h1 { margin: 0; font-size: 18px; }
  header p { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
  #messages { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 10px; }
  .msg { max-width: 85%; padding: 9px 13px; border-radius: 16px; white-space: pre-wrap; word-wrap: break-word; }
  .user { align-self: flex-end; background: var(--brand); color: #fff; border-bottom-right-radius: 4px; }
  .bot { align-self: flex-start; background: #f1f5f9; border-bottom-left-radius: 4px; }
  .bot.error { background: #fef2f2; color: #b91c1c; }
  .bot.thinking { color: var(--muted); font-style: italic; }
  form { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--line); }
  input { flex: 1; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; font: inherit; }
  input:focus { outline: 2px solid var(--brand); outline-offset: -1px; border-color: transparent; }
  button { padding: 10px 16px; border: 0; border-radius: 10px; background: var(--brand); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  footer { padding: 0 16px 10px; color: var(--muted); font-size: 11px; text-align: center; }
</style>
</head>
<body>
<div class="app">
  <header>
    <h1>${esc(name)}</h1>
    <p>${esc(intro)}</p>
  </header>
  <div id="messages" aria-live="polite"></div>
  <form id="form">
    <input id="input" autocomplete="off" maxlength="1000" placeholder="${esc(text.placeholder)}" aria-label="${esc(text.placeholder)}">
    <button id="send">${esc(text.send)}</button>
  </form>
  <footer>${esc(text.poweredBy)}</footer>
</div>
<script>
  var TEXT = ${JSON.stringify({ thinking: text.thinking, error: text.error })};
  var form = document.getElementById("form");
  var input = document.getElementById("input");
  var send = document.getElementById("send");
  var list = document.getElementById("messages");

  function add(kind, words) {
    var div = document.createElement("div");
    div.className = "msg " + kind;
    div.textContent = words;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
    return div;
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var message = input.value.trim();
    if (!message) return;
    input.value = "";
    add("user", message);
    var waiting = add("bot thinking", TEXT.thinking);
    send.disabled = true;
    try {
      var res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message })
      });
      var data = await res.json().catch(function () { return {}; });
      waiting.className = "msg bot" + (res.ok ? "" : " error");
      waiting.textContent = res.ok ? data.reply : (data.error || TEXT.error);
    } catch (err) {
      waiting.className = "msg bot error";
      waiting.textContent = TEXT.error;
    } finally {
      send.disabled = false;
      input.focus();
    }
  });
  input.focus();
</script>
</body>
</html>
`;
}

/** Loads .env for a JavaScript script (Node 20.12+); prepended to scripts that call N-ATLAS. */
export const JS_ENV = `// Settings from .env (NATLAS_BASE_URL, NATLAS_MODEL, NATLAS_API_KEY…). Node 20.12+.
try {
  process.loadEnvFile();
} catch {
  /* no .env file: use the environment as it is */
}
`;

/** server.py — the Python app: same page, same /api/chat, same safety checks as the JavaScript server. */
export const PY_SERVER = String.raw`"""Your N-ATLAS app's web server: serves the chat page (public/index.html) and answers POST /api/chat.

    python server.py      then open http://localhost:3000

Standard library only. Settings come from .env (NATLAS_BASE_URL, NATLAS_MODEL, NATLAS_API_KEY, PORT).
"""
import json
import os
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from natlas import Natlas, NatlasError, detect_language, load_env
from system_prompt import LANGUAGE, SYSTEM_PROMPT

load_env()
natlas = Natlas()  # reads NATLAS_BASE_URL / NATLAS_MODEL / NATLAS_API_KEY
HERE = os.path.dirname(os.path.abspath(__file__))

try:
    from knowledge_search import knowledge  # your documents, if the project has them
except ImportError:
    knowledge = None

# ── Safety: checks in code, so they hold even when the model slips ──────────
MAX_MESSAGE = 1000  # characters per message
PER_MINUTE = 20  # messages per user per minute
SAFE_REPLY = "Sorry, I can't help with that. Please ask me something else."
# The reference code planted in your system prompt, and its longer lines, must never appear in a reply.
_code = re.search(r"reference code ([A-Z0-9-]+)", SYSTEM_PROMPT)
CANARY = _code.group(1) if _code else None
PROMPT_LINES = [line.strip() for line in SYSTEM_PROMPT.split("\n") if len(line.strip()) > 40]
_recent = {}

# Languages a reply may be in: the app's own (English and Pidgin apps accept either).
NAMES = {"en": "English", "pid": "Nigerian Pidgin", "yo": "Yoruba", "ha": "Hausa", "ig": "Igbo"}
ALLOWED = ["en", "pid"] if LANGUAGE in ("en", "pid") else [LANGUAGE]


def check_message(message, user):
    """Why a message can't be answered ("" if it can)."""
    if not message.strip():
        return "Please type a message."
    if len(message) > MAX_MESSAGE:
        return "Please keep messages under %d characters." % MAX_MESSAGE
    now = time.time()
    times = [t for t in _recent.get(user, []) if now - t < 60]
    _recent[user] = times + [now]
    if len(times) >= PER_MINUTE:
        return "Too many messages — please wait a minute."
    return ""


def client_ip(handler):
    """The visitor: behind a host's proxy (Modal, Render…), the address it added; else the socket's."""
    forwarded = handler.headers.get("x-forwarded-for")
    return forwarded.split(",")[-1].strip() if forwarded else handler.client_address[0]


def leaks_prompt(reply):
    return bool(CANARY and CANARY in reply) or any(line in reply for line in PROMPT_LINES)


def ask_natlas(question):
    text = natlas.chat(question, system=SYSTEM_PROMPT, language=LANGUAGE, knowledge=knowledge, max_tokens=400).text
    # N-ATLAS sometimes drifts into another Nigerian language: ask once more, firmly.
    if detect_language(text) not in ALLOWED:
        firm = SYSTEM_PROMPT + "\n\nReply only in %s, whatever language the question is in." % NAMES[LANGUAGE]
        text = natlas.chat(question, system=firm, language=LANGUAGE, knowledge=knowledge, max_tokens=400).text
    return SAFE_REPLY if leaks_prompt(text) else text


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ("/", "/index.html"):
            return self._send(404, "text/plain", b"Not found")
        with open(os.path.join(HERE, "public", "index.html"), "rb") as f:
            self._send(200, "text/html; charset=utf-8", f.read())

    def do_POST(self):
        if self.path != "/api/chat":
            return self._send(404, "text/plain", b"Not found")
        length = min(int(self.headers.get("content-length") or 0), 20_000)
        try:
            message = str(json.loads(self.rfile.read(length) or b"{}").get("message", ""))
        except ValueError:
            return self._json(400, {"error": "Send JSON: {\"message\": \"...\"}"})
        problem = check_message(message, client_ip(self))
        if problem:
            return self._json(429 if problem.startswith("Too many") else 400, {"error": problem})
        try:
            self._json(200, {"reply": ask_natlas(message)})
        except NatlasError as e:
            print("N-ATLAS failed:", e)
            self._json(502, {"error": "N-ATLAS is unavailable right now — please try again."})

    def _json(self, status, body):
        self._send(status, "application/json", json.dumps(body, ensure_ascii=False).encode("utf-8"))

    def _send(self, status, kind, data):
        self.send_response(status)
        self.send_header("content-type", kind)
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        pass  # keep the console quiet; errors are printed above


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3000"))
    server = ThreadingHTTPServer(("", port), Handler)  # listening from here on
    print("Running — open http://localhost:%d" % port, flush=True)
    server.serve_forever()
`;
