/**
 * Standalone health-check command: `npm run healthcheck`
 *
 * Verifies the full chain — application -> N-ATLAS -> response — from the
 * command line, without starting the HTTP server. Exits 0 on success, 1 on
 * failure, so it can be used in CI or a pre-demo smoke test.
 *
 * It tells you plainly whether you are hitting REAL N-ATLAS or the MOCK.
 */

import { loadConfig } from "./config.js";
import { createProvider } from "./providers/index.js";

async function main() {
  const config = loadConfig();
  const provider = createProvider(config);

  console.log("— N-ATLAS Launchpad health check —");
  console.log(`provider : ${provider.name}${provider.isMock ? "  (MOCK — not real N-ATLAS)" : ""}`);

  const status = await provider.health();
  console.log(`endpoint : ${status.endpoint ?? "(none / mock)"}`);
  console.log(`model    : ${status.model}`);
  console.log(`ok       : ${status.ok}`);
  console.log(`detail   : ${status.detail}`);

  if (!status.ok) {
    console.error("\nResult: FAIL — could not reach N-ATLAS.");
    process.exit(1);
  }
  if (provider.isMock) {
    console.warn(
      "\nResult: OK, but MOCK provider is active. This did NOT verify real " +
        "N-ATLAS. Set NATLAS_PROVIDER=http to test the real integration.",
    );
    process.exit(0);
  }
  console.log("\nResult: OK — reached real N-ATLAS successfully.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Health check crashed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
