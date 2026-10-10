"""Tests for natlas.py against a fake OpenAI-compatible server. Run: python -m unittest -v test_natlas"""
import json
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from natlas import Knowledge, Natlas, NatlasError, detect_language, estimate_tokens, fit_context

REPLY = "Ẹ káàárọ̀! How I fit help you today?"
SEEN = []
STATE = {"fail_next": 0}


class FakeNatlas(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        raw = self.rfile.read(int(self.headers["content-length"]))
        if self.path == "/missing/v1/chat/completions":
            return self._send(404, json.dumps({"error": {"message": 'model "n-atlas" not found'}}))
        if self.path == "/slow/v1/chat/completions":
            time.sleep(2)
            return self._send(200, "{}")
        if STATE["fail_next"]:
            STATE["fail_next"] -= 1
            return self._send(503, "busy")
        body = json.loads(raw)
        SEEN.append({"body": body, "auth": self.headers.get("authorization")})
        usage = {"prompt_tokens": 20, "completion_tokens": 9, "total_tokens": 29}
        if not body["stream"]:
            return self._send(200, json.dumps({
                "model": body["model"],
                "choices": [{"message": {"role": "assistant", "content": REPLY}, "finish_reason": "stop"}],
                "usage": usage,
            }))
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.end_headers()
        for word in REPLY.split(" "):
            self.wfile.write(("data: %s\n\n" % json.dumps({"choices": [{"delta": {"content": word + " "}}]})).encode())
        self.wfile.write(("data: %s\n\n" % json.dumps({"choices": [{"delta": {}, "finish_reason": "stop"}]})).encode())
        self.wfile.write(("data: %s\n\n" % json.dumps({"choices": [], "usage": usage})).encode())
        self.wfile.write(b"data: [DONE]\n\n")

    def _send(self, status, text):
        data = text.encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


class NatlasTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeNatlas)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = "http://127.0.0.1:%d" % cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def test_chat_defaults_language_and_key(self):
        r = Natlas(base_url=self.base + "/v1/", api_key="test-key").chat(
            "How I fit register my business?", system="You help small traders.", language="pid"
        )
        body = SEEN[-1]["body"]
        self.assertEqual(body["temperature"], 0.1)
        self.assertEqual(body["repetition_penalty"], 1.12)
        self.assertEqual(body["messages"][0]["content"], "You help small traders. Respond in Nigerian Pidgin.")
        self.assertEqual(SEEN[-1]["auth"], "Bearer test-key")
        self.assertIn("káàárọ̀", r.text)
        self.assertEqual(r.usage.completion_tokens, 9)

    def test_knowledge_sources(self):
        kb = Knowledge()
        kb.add("prices.txt", "Mile 12 market prices\n\nRice, local, 50kg bag: N78,000")
        kb.add("notes.md", "Enzymes are biological catalysts.")
        natlas = Natlas(base_url=self.base + "/v1")
        r = natlas.chat("How much is a bag of rice?", knowledge=kb, k=1)
        self.assertEqual([s.source for s in r.sources], ["prices.txt"])
        system = SEEN[-1]["body"]["messages"][0]["content"]
        self.assertIn("Answer only from these facts", system)
        self.assertNotIn("Enzymes", system)
        self.assertEqual(natlas.chat("Who won the match?", knowledge=kb).sources, [])

    def test_from_json_matches_js(self):
        kb = Knowledge.from_json(json.dumps([{"source": "a.txt", "index": 2, "text": "Ọjà Ọba sells àdìrẹ"}]))
        self.assertEqual(kb.search("oja oba adire")[0].index, 2)
        project = Knowledge.from_json([{"name": "b.txt", "chunks": [{"text": "first"}, {"text": "inhibition of enzymes"}]}])
        self.assertEqual([(h.source, h.index) for h in project.search("inhibitors")], [("b.txt", 2)])

    def test_stream(self):
        s = Natlas(base_url=self.base + "/v1").stream([{"role": "user", "content": "Hello"}])
        text = "".join(s)
        self.assertEqual(text.strip(), REPLY)
        self.assertEqual(s.result.text, text)
        self.assertEqual(s.result.usage.total_tokens, 29)
        self.assertEqual(s.result.finish_reason, "stop")

    def test_errors(self):
        STATE["fail_next"] = 1
        self.assertIn("káàárọ̀", Natlas(base_url=self.base + "/v1").chat("hi").text)
        with self.assertRaises(NatlasError) as e:
            Natlas(base_url=self.base + "/missing/v1").chat("hi")
        self.assertEqual(e.exception.code, "model_missing")
        with self.assertRaises(NatlasError) as e:
            Natlas(base_url="http://127.0.0.1:9/v1", retries=0).chat("hi")
        self.assertEqual(e.exception.code, "unreachable")
        with self.assertRaises(NatlasError) as e:
            Natlas(base_url=self.base + "/slow/v1", timeout=0.5).chat("hi")
        self.assertEqual(e.exception.code, "timeout")
        with self.assertRaises(NatlasError) as e:
            Natlas(base_url=self.base + "/v1").chat("hi", language="fr")
        self.assertEqual(e.exception.code, "invalid")

    def test_fit_context(self):
        turn = "word " * 400
        messages = [{"role": "system", "content": "sys"}] + [
            {"role": "assistant" if i % 2 else "user", "content": "%d %s" % (i, turn)} for i in range(20)
        ]
        kept, dropped = fit_context(messages, 512)
        self.assertGreater(dropped, 0)
        self.assertEqual(kept[0]["role"], "system")
        self.assertIs(kept[-1], messages[-1])
        self.assertLessEqual(sum(estimate_tokens(m["content"]) + 4 for m in kept), 8092 - 512)

    def test_detect_language(self):
        self.assertEqual(detect_language("Abeg, wetin dey happen for market today? Oga no dey."), "pid")
        self.assertEqual(detect_language("Ẹ káàárọ̀, ṣé àlàáfíà ni? Mo fẹ́ ra ọjà."), "yo")
        self.assertEqual(detect_language("Ina kwana? Ina so in sayi shinkafa amma kuɗi ya ƙare."), "ha")
        self.assertEqual(detect_language("The rice price went up again this week in Lagos."), "en")


class LoadEnvTest(unittest.TestCase):
    def test_load_env(self):
        import os
        import tempfile

        from natlas import load_env

        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, ".env")
            with open(path, "w", encoding="utf-8") as f:
                f.write('# comment\nNATLAS_TEST_A=one\nNATLAS_TEST_B="two words"\nNATLAS_TEST_KEEP=from-file\n')
            os.environ["NATLAS_TEST_KEEP"] = "from-env"
            load_env(path)
            self.assertEqual(os.environ["NATLAS_TEST_A"], "one")
            self.assertEqual(os.environ["NATLAS_TEST_B"], "two words")
            self.assertEqual(os.environ["NATLAS_TEST_KEEP"], "from-env", "existing variables win")
            load_env(os.path.join(d, "missing.env"))  # no error


if __name__ == "__main__":
    unittest.main()
