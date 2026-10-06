/**
 * MockNAtlasProvider — FOR FRONTEND DEVELOPMENT ONLY.
 *
 * ⚠️  THIS IS NOT N-ATLAS. It never contacts any model. It returns canned,
 *     clearly-labelled text so UI work can proceed before a real N-ATLAS
 *     endpoint is configured.
 *
 * Every response:
 *   - is prefixed with a loud "[MOCK — NOT REAL N-ATLAS OUTPUT]" banner, and
 *   - carries isMock: true in the structured result.
 *
 * The API layer refuses to hide this flag, so mock text can never be presented
 * as a genuine N-ATLAS answer.
 */

import type {
  GenerateOptions,
  GenerateResult,
  HealthStatus,
  NAtlasProvider,
} from "./NAtlasProvider.js";

export const MOCK_BANNER = "[MOCK — NOT REAL N-ATLAS OUTPUT]";

export class MockNAtlasProvider implements NAtlasProvider {
  readonly name = "mock";
  readonly isMock = true;

  async generate(
    prompt: string,
    options: GenerateOptions = {},
  ): Promise<GenerateResult> {
    const started = Date.now();
    // Simulate a little latency so the UI loading states are exercised.
    await new Promise((r) => setTimeout(r, 150));

    const lang = options.language ?? "en";
    const preview = prompt.length > 80 ? `${prompt.slice(0, 80)}…` : prompt;
    const text =
      `${MOCK_BANNER}\n` +
      `This is placeholder text generated locally for UI development.\n` +
      `It did not come from the N-ATLAS model.\n` +
      `(requested language: ${lang}; echoed prompt: "${preview}")`;

    return {
      text,
      model: "mock-provider",
      provider: this.name,
      isMock: true,
      latencyMs: Date.now() - started,
    };
  }

  async health(): Promise<HealthStatus> {
    return {
      ok: true,
      provider: this.name,
      isMock: true,
      endpoint: null,
      model: "mock-provider",
      detail:
        "MOCK provider is active. No real N-ATLAS integration is in use. " +
        "Set NATLAS_PROVIDER=http and configure NATLAS_ENDPOINT for real output.",
      checkedAt: new Date().toISOString(),
    };
  }
}
