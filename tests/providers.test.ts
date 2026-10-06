/**
 * Phase-1 tests: the provider CONTRACT and the mock safety guarantees.
 *
 * These use Node's built-in test runner (node:test) so we add no test
 * framework dependency yet. Run from the backend folder: `npm test`.
 *
 * The evaluation-engine tests (Nigerian-context cases, scoring, security
 * checks) will be added here in a later phase.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { MockNAtlasProvider, MOCK_BANNER } from "../backend/src/providers/MockNAtlasProvider.js";

test("mock provider is flagged as mock everywhere", async () => {
  const p = new MockNAtlasProvider();
  assert.equal(p.isMock, true);
  assert.equal(p.name, "mock");

  const result = await p.generate("hello");
  assert.equal(result.isMock, true, "result must carry isMock=true");
  assert.ok(result.text.includes(MOCK_BANNER), "mock text must carry the loud banner");
});

test("mock health reports it is not real N-ATLAS", async () => {
  const health = await new MockNAtlasProvider().health();
  assert.equal(health.ok, true);
  assert.equal(health.isMock, true);
  assert.match(health.detail, /MOCK/);
});

test("mock provider never claims to be the http provider", async () => {
  const result = await new MockNAtlasProvider().generate("test", { language: "yo" });
  assert.notEqual(result.provider, "http");
  assert.equal(result.model, "mock-provider");
});
