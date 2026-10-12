/**
 * Go live: the hosting files in every export, the guide that explains them in
 * the developer's language (commands never translated), and the live-link check.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import * as front from "../frontend/src/export/deployKit.ts";
import * as back from "../backend/src/deploy/kit.ts";
import { buildProject } from "../frontend/src/export/templates.ts";
import { generateBlueprint } from "../backend/src/blueprint/generate.ts";
import { checkableUrl, checkLiveApp, isPrivateAddress } from "../backend/src/deploy/check.ts";
import { guideSystem, reachableFromInternet } from "../backend/src/deploy/guide.ts";
import { protectCode, relay } from "../backend/src/brain/relay.ts";
import { Brain } from "../backend/src/brain/brain.ts";

test("deploy kit: the guide's copy matches what the export ships", () => {
  for (const lang of ["js", "python"] as const) {
    assert.deepEqual(back.deployFiles("price-checker", lang), front.deployFiles("price-checker", lang));
  }
  assert.equal(back.exportSlug("Kano Price Checker!"), front.exportSlug("Kano Price Checker!"));
  assert.equal(front.modalAppName("Kano--Price"), "natlas-kano-price");
});

function project(lang: "js" | "python", description: string) {
  const bp = generateBlueprint(description) as any;
  return buildProject(
    { blueprint: bp, systemPrompt: bp.systemPrompt, evalResult: null, securityResult: null, savedTestCases: [], knowledge: [], language: "en" } as any,
    lang,
  ).files;
}

test("every exported app can go online: Modal, Vercel, Render, Docker, and .env stays out of git and images", () => {
  for (const lang of ["js", "python"] as const) {
    const files = project(lang, "A chat assistant that answers customer questions for my shop in Lagos");
    for (const f of ["deploy/modal_app.py", "vercel.json", "render.yaml", "Dockerfile", ".dockerignore", ".gitignore"]) assert.ok(files[f], `${lang}: ${f}`);
    assert.ok(files[lang === "js" ? "api/index.js" : "api/index.py"]);
    assert.match(files[".gitignore"], /^\.env$/m);
    assert.match(files[".dockerignore"], /^\.env$/m);
    assert.match(files["deploy/modal_app.py"], /IGNORE = \[".env"/);
    assert.match(files["deploy/modal_app.py"], /Secret\.from_dotenv\(ROOT\)/);
    assert.match(files["README.md"], /## Put it online/);
    JSON.parse(files["vercel.json"]);
  }
  const js = project("js", "A chat assistant that answers customer questions for my shop in Lagos");
  assert.match(js["src/server.js"], /if \(!process\.env\.VERCEL\) app\.listen/);
  assert.match(js["src/server.js"], /export default app;/);
  assert.match(js["src/server.js"], /app\.set\("trust proxy", 1\)/);
  assert.match(project("python", "A chat assistant for my shop")["server.py"], /check_message\(message, client_ip\(self\)\)/);
});

test("the hosting files are valid Python", () => {
  const dir = mkdtempSync(join(tmpdir(), "natlas-deploy-"));
  try {
    for (const lang of ["js", "python"] as const) {
      const files = front.deployFiles("price-checker", lang);
      for (const f of ["deploy/modal_app.py", ...(lang === "python" ? ["api/index.py"] : [])]) {
        const path = join(dir, `${lang}-${f.replace(/\//g, "_")}`);
        writeFileSync(path, files[f]);
        const r = spawnSync("python", ["-m", "py_compile", path], { encoding: "utf8" });
        if (r.error) return; // no Python on this machine
        assert.equal(r.status, 0, r.stderr);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("code survives translation: markers in, commands out untouched", () => {
  const m = protectCode("Run this:\n```bash\nmodal deploy deploy/modal_app.py\n```\nThen open `https://x.modal.run`.");
  assert.equal(m.text, "Run this:\n[[C1]]\nThen open [[C2]].");
  assert.equal(m.complete("Gudu wannan:\n[[C1]]\nSai ka bude [[C2]]."), true);
  assert.equal(m.complete("Gudu wannan: [[C1]]"), false);
  assert.match(m.restore("Gudu wannan:\n[[C1]]\nSai ka bude [[C2]]."), /```bash\nmodal deploy deploy\/modal_app\.py\n```/);
});

test("guide relay: N-ATLAS says it in Hausa, the commands stay exactly as written", async () => {
  const english = "1. Install Modal:\n```bash\npip install modal\n```\n2. Deploy with `modal deploy deploy/modal_app.py` and paste the link below.";
  const fetchImpl = (async () => new Response(JSON.stringify({ choices: [{ message: { content: english } }] }))) as typeof fetch;
  const brain = new Brain([{ name: "Gemini", baseURL: "https://g.test", model: "m", apiKey: "k" }], 50, fetchImpl);
  const natlas = {
    name: "fake",
    isMock: true,
    async generate() {
      throw new Error("unused");
    },
    async generateStream(prompt: string, _o: unknown, onChunk: (c: any) => void) {
      const out = prompt.startsWith("Translate into English")
        ? "How do I put my app online?"
        : "1. Shigar da Modal:\n[[C1]]\n2. Tura shi da [[C2]] kuma ka manna hanyar haɗin a ƙasa domin a duba shi sosai.";
      onChunk({ type: "delta", delta: out });
    },
    async health() {
      return { ok: true } as any;
    },
  };
  const events: any[] = [];
  const r = await relay({
    brain,
    natlas: natlas as any,
    language: "ha",
    messages: [{ role: "system", content: "guide" }, { role: "user", content: "Yaya zan saka manhajata a intanet?" }],
    words: "Yaya zan saka manhajata a intanet?",
    protectCode: true,
    onEvent: (e) => events.push(e),
  });
  assert.equal(r.voice, "N-ATLAS");
  assert.match(r.text, /```bash\npip install modal\n```/);
  assert.match(r.text, /`modal deploy deploy\/modal_app\.py`/);
  assert.equal(events.filter((e) => e.type === "delta").length, 1, "arrives in one piece");
});

test("guide facts: the project's own folder and commands; localhost N-ATLAS must be hosted first", () => {
  const p = { name: "Kano Price Checker", lang: "js" as const, channel: "web", knowledge: true };
  const hosted = guideSystem(p, { endpoint: "https://me--natlas-serve.modal.run/v1", model: "NCAIR1/N-ATLaS", apiKey: "sk-Zq81TopKey" });
  assert.match(hosted, /`kano-price-checker-js`/);
  assert.match(hosted, /modal app stop natlas-kano-price-checker/);
  assert.match(hosted, /knowledge\/passages\.json/);
  assert.ok(!hosted.includes("sk-Zq81TopKey"), "never the key");
  assert.match(guideSystem(p, { endpoint: "http://localhost:11434/v1", model: "n-atlas", apiKey: "" }), /CANNOT reach localhost/);
  assert.equal(reachableFromInternet("http://192.168.1.4:11434/v1"), false);
  assert.equal(reachableFromInternet("https://api.example.com/v1"), true);
});

test("live check: page, a real answer, and the safety checks — on a running app", async () => {
  const app = createServer((req, res) => {
    if (req.method === "GET") return res.end("<!doctype html><html><head><title>Kano Prices</title></head></html>");
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { message } = JSON.parse(body);
      res.statusCode = message.length > 1000 ? 400 : 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(message.length > 1000 ? { error: "too long" } : { reply: "Rice is N82,000 a bag." }));
    });
  }).listen(0);
  try {
    const url = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
    const r = await checkLiveApp(url, "How much is rice?", { allowPrivate: true });
    assert.deepEqual([r.page.ok, r.page.title, r.chat.ok, r.chat.reply, r.guards.ok], [true, "Kano Prices", true, "Rice is N82,000 a bag.", true]);
    // A public Launchpad won't fetch addresses inside its own network.
    await assert.rejects(checkableUrl(url, false), /private network/);
  } finally {
    app.close();
  }
  assert.equal(isPrivateAddress("10.0.0.5"), true);
  assert.equal(isPrivateAddress("::ffff:127.0.0.1"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  await assert.rejects(checkableUrl("ftp://x.com", true), /http/);
});
