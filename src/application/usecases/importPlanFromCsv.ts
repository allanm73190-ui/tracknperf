import type { PlanImport } from "../../domain/plan/planImport";
import { planImportSchema } from "../../domain/plan/planImport.schema";

type CsvRow = Record<string, string>;

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  function pushField() {
    cur.push(field);
    field = "";
  }
  function pushRow() {
    rows.push(cur);
    cur = [];
  }

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === ",") {
      pushField();
      i += 1;
      continue;
    }

    if (ch === "\n") {
      pushField();
      pushRow();
      i += 1;
      continue;
    }

    if (ch === "\r") {
      // Ignore CR; handle CRLF via \n
      i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  pushField();
  // Avoid trailing empty line
  const nonEmpty = cur.some((v) => v.trim().length > 0);
  if (nonEmpty) pushRow();

  if (rows.length === 0) return [];

  const headerRow = rows[0];
  if (!headerRow) return [];
  const header = headerRow.map((h) => h.trim());
  const out: CsvRow[] = [];
  for (const r of rows.slice(1)) {
    const obj: CsvRow = {};
    for (let idx = 0; idx < header.length; idx += 1) {
      const key = header[idx] ?? "";
      if (!key) continue;
      obj[key] = (r[idx] ?? "").trim();
    }
    const any = Object.values(obj).some((v) => v.length > 0);
    if (any) out.push(obj);
  }
  return out;
}

function pick(row: CsvRow, keys: string[]): string | null {
  for (const k of keys) {
    if (k in row && row[k]?.trim()) return row[k].trim();
  }
  return null;
}

export function importPlanFromCsvText(csvText: string): PlanImport {
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    throw new Error("CSV is empty.");
  }

  // Supported minimal CSV format: one row = one planned session.
  // Required: scheduled_for (or date) + plan_name.
  // Optional: template_name, plan_description, version, payload_json.
  const plannedSessions: PlanImport["plannedSessions"] = [];
  let planName: string | null = null;
  let planDescription: string | null = null;
  let version: number | null = null;

  const templateNames = new Set<string>();

  for (const row of rows) {
    planName ??=
      pick(row, ["plan_name", "plan", "programme", "name"]) ??
      null;
    planDescription ??=
      pick(row, ["plan_description", "description"]) ??
      null;

    const v = pick(row, ["version", "plan_version"]);
    if (v && !version) {
      const parsed = Number(v);
      if (Number.isInteger(parsed) && parsed >= 1) version = parsed;
    }

    const scheduledFor =
      pick(row, ["scheduled_for", "scheduledFor", "date", "day"]) ??
      null;
    if (!scheduledFor) continue;

    const templateName =
      pick(row, ["template_name", "template", "session_template", "session"]) ??
      null;
    if (templateName) templateNames.add(templateName);

    const payloadJson = pick(row, ["payload", "payload_json", "meta", "json"]);
    let payload: Record<string, unknown> = {};
    if (payloadJson) {
      try {
        const obj = JSON.parse(payloadJson);
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
          payload = obj as Record<string, unknown>;
        }
      } catch {
        throw new Error(`Invalid payload JSON for date ${scheduledFor}.`);
      }
    }

    plannedSessions.push({
      scheduledFor,
      templateName,
      payload,
    });
  }

  if (!planName) {
    throw new Error("CSV missing plan name (expected column plan_name).");
  }

  const importObj: PlanImport = {
    plan: { name: planName, description: planDescription ?? null },
    planVersion: { version: version ?? 1, payload: {} },
    sessionTemplates: Array.from(templateNames).map((name) => ({ name, template: {} })),
    plannedSessions,
  };

  return planImportSchema.parse(importObj);
}

