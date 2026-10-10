/**
 * Append a rule line to a system prompt — mirror of backend applyFix
 * (backend/src/prompt/doctor.ts): the line goes before the security
 * reference note, and isn't added twice.
 */
export function applyFix(systemPrompt: string, line: string): string {
  if (systemPrompt.includes(line)) return systemPrompt;
  const lines = systemPrompt.split("\n");
  const noteAt = lines.findIndex((l) => /^\(Internal note:/.test(l.trim()));
  if (noteAt > 0) {
    const before = lines.slice(0, noteAt);
    while (before.length && !before[before.length - 1].trim()) before.pop();
    return [...before, line, "", ...lines.slice(noteAt)].join("\n");
  }
  return `${systemPrompt.replace(/\s+$/, "")}\n${line}`;
}
