export type SessionMode = "strength" | "endurance" | "mixed" | "recovery" | "rest";

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function inferFromText(value: string | null): SessionMode | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v.includes("strength") || v.includes("force") || v.includes("hypert")) return "strength";
  if (v.includes("endurance") || v.includes("run") || v.includes("course") || v.includes("trail")) return "endurance";
  if (v.includes("mixed") || v.includes("hybrid")) return "mixed";
  if (v.includes("recovery") || v.includes("recup") || v.includes("récup")) return "recovery";
  if (v.includes("rest") || v.includes("repos")) return "rest";
  return null;
}

export function inferSessionMode(args: {
  plannedPayload?: Record<string, unknown> | null;
  templatePayload?: Record<string, unknown> | null;
  templateName?: string | null;
}): SessionMode {
  const explicit =
    inferFromText(asString(args.plannedPayload?.sessionMode)) ??
    inferFromText(asString(args.plannedPayload?.session_mode)) ??
    inferFromText(asString(args.plannedPayload?.sessionType)) ??
    inferFromText(asString(args.plannedPayload?.session_type)) ??
    inferFromText(asString(args.templatePayload?.sessionMode)) ??
    inferFromText(asString(args.templatePayload?.session_mode)) ??
    inferFromText(asString(args.templatePayload?.sessionType)) ??
    inferFromText(asString(args.templatePayload?.session_type)) ??
    inferFromText(asString(args.templatePayload?.type));
  if (explicit) return explicit;

  const byName = inferFromText(args.templateName ?? null);
  if (byName) return byName;

  return "mixed";
}

export function sessionModeLabel(mode: SessionMode): string {
  if (mode === "strength") return "FORCE";
  if (mode === "endurance") return "ENDURANCE";
  if (mode === "mixed") return "HYBRIDE";
  if (mode === "recovery") return "RÉCUP";
  return "REPOS";
}
