import type { HealthStatus } from "../api";
import { Badge } from "../ui";

export default function ModeBadge({ health }: { health: HealthStatus | null }) {
  if (!health) return <Badge tone="slate">Checking…</Badge>;
  if (health.provider === "http" && health.ok) {
    return <Badge tone="green">● Connected</Badge>;
  }
  return <Badge tone="red">● Offline</Badge>;
}

export function modeHint(health: HealthStatus | null): string {
  if (!health) return "Connecting to the backend…";
  if (health.provider === "http" && health.ok)
    return `Connected to N-ATLAS (${health.model}).`;
  return health.detail || "N-ATLAS is not reachable. Configure the endpoint above.";
}
