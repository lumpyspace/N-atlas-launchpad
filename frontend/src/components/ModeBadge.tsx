import type { HealthStatus } from "../api";
import { useT, type T } from "../i18n";
import { Badge } from "../ui";

export default function ModeBadge({ health }: { health: HealthStatus | null }) {
  const t = useT();
  if (!health) return <Badge tone="slate">{t("Checking…")}</Badge>;
  if (health.provider === "http" && health.ok) {
    return <Badge tone="green">● {t("Connected")}</Badge>;
  }
  return <Badge tone="red">● {t("Offline")}</Badge>;
}

export function modeHint(health: HealthStatus | null, t: T): string {
  if (!health) return t("Connecting to the backend…");
  if (health.provider === "http" && health.ok) return t("Connected to N-ATLAS ({model}).", { model: health.model });
  // The backend's own diagnosis stays in English: it's technical detail.
  return health.detail || t("N-ATLAS is not reachable. Configure the endpoint above.");
}
