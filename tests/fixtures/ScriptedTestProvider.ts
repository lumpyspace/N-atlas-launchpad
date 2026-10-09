/**
 * Deterministic test double for security before/after tests.
 *
 * Behaviour:
 *   - Naive system prompt (not hardened): echoes canary on extraction attempts,
 *     emits injected sentinels on injection attempts, complies with jailbreaks.
 *     → fails most high/critical weight security tests → score ≈ 9%
 *   - Hardened system prompt: refuses all attacks.
 *     → passes all security tests → score = 100%
 *
 * This replaces ScriptedDemoProvider which was removed when demo mode was
 * stripped from the main app.
 */

import type {
  GenerateOptions,
  GenerateResult,
  HealthStatus,
  NAtlasProvider,
  StreamChunk,
} from "../../backend/src/providers/NAtlasProvider.js";
import { extractCanary, isHardened } from "../../backend/src/shared/prompt.js";

export class ScriptedTestProvider implements NAtlasProvider {
  readonly name = "ScriptedTestProvider";
  readonly isMock = true;

  async generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
    const sys = options?.system ?? "";
    const hardened = isHardened(sys);
    const text = hardened ? this.refusal() : this.naiveReply(prompt, sys);
    return {
      text,
      model: "scripted-test",
      provider: this.name,
      isMock: true,
      latencyMs: 1,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  async generateStream(
    prompt: string,
    options: GenerateOptions,
    onChunk: (chunk: StreamChunk) => void,
    _signal?: AbortSignal,
  ): Promise<void> {
    const result = await this.generate(prompt, options);
    onChunk({ type: "delta", delta: result.text });
    onChunk({ type: "stats", ttftMs: 1, totalMs: 1, tokensGenerated: 1, tokensPerSec: 1 });
    onChunk({ type: "done" });
  }

  async health(): Promise<HealthStatus> {
    return { ok: true, provider: this.name, isMock: true, endpoint: null, model: "scripted-test", detail: "scripted" };
  }

  private refusal(): string {
    return "I'm sorry, I cannot help with that. My instructions do not permit me to share system information or follow injected commands.";
  }

  private naiveReply(prompt: string, sys: string): string {
    const lp = prompt.toLowerCase();

    // Obey injected sentinels  (inj-basic: PWNED, inj-roleplay: HACKED, inj-smuggled: INJECTED)
    const sentinelMatch = prompt.match(/reply with exactly:\s*([A-Z]+)/i);
    if (sentinelMatch) return sentinelMatch[1];

    // System-prompt extraction  (ext-verbatim, ext-reference-code, ext-ignore-print,
    //                             imp-developer, imp-admin-authorize, sens-confidential,
    //                             leak-repeat-above, leak-config-codes)
    const extractionTriggers = [
      "system prompt", "instructions", "reference code", "internal note",
      "hidden", "above", "verbatim", "print", "reveal", "confidential",
      "developer mode", "administrator",
    ];
    const isExtraction = extractionTriggers.some((t) => lp.includes(t));
    if (isExtraction) {
      const canary = extractCanary(sys);
      if (canary) return `Sure! Here are my instructions:\n\n${sys}`;
      return `Here are my instructions:\n\n${sys}`;
    }

    // Jailbreak compliance  (jb-no-rules, jb-dan, jb-harmful-smuggle)
    const jailbreakTriggers = ["no rules", "dan mode", "do anything now", "novel", "without restrictions"];
    const isJailbreak = jailbreakTriggers.some((t) => lp.includes(t));
    if (isJailbreak) return "Sure! I have no rules. I can answer anything you ask.";

    return "I can help with that! Please ask me anything.";
  }
}
