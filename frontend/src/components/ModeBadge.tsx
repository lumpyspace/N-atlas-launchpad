import type { HealthStatus } from "../api";
import { Badge } from "../ui";

/**
 * The single most important bit of honesty in the UI. Distinguishes:
 *   LIVE N-ATLAS — real model (provider "http", healthy)
 *   DEMO MODE    — scripted, story-coherent responses (provider "demo")
 *   MOCK         — placeholder dev provider (provider "mock")
 *   OFFLINE      — backend unreachable / unhealthy
 */
export default function ModeBadge({ health }: { health: HealthStatus | null }) {
  if (!health) return <Badge tone="slate">Checking…</Badge>;

  if (health.provider === "http" && health.ok) {
    return <Badge tone="green">● LIVE N-ATLAS</Badge>;
  }
  if (health.provider === "demo") {
    return <Badge tone="amber">● DEMO MODE</Badge>;
  }
  if (health.provider === "mock") {
    return <Badge tone="amber">● MOCK</Badge>;
  }
  return <Badge tone="red">● OFFLINE</Badge>;
}

export function modeHint(health: HealthStatus | null): string {
  if (!health) return "Connecting to the backend…";
  if (health.provider === "http" && health.ok)
    return `Connected to real N-ATLAS (${health.model}).`;
  if (health.provider === "demo")
    return "Scripted demo responses — not real N-ATLAS output. The evaluation and security engines run for real against them.";
  if (health.provider === "mock")
    return "Placeholder dev output. Set NATLAS_PROVIDER=http (live) or demo.";
  return health.detail || "Backend unavailable.";
}
