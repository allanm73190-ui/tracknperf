import * as XLSX from "xlsx";
import type { PlanImport } from "../../domain/plan/planImport";
import { planImportSchema } from "../../domain/plan/planImport.schema";

type Row = Record<string, unknown>;

function normalizeHeaderKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function toIsoDateFromExcelSerial(serial: number): string | null {
  // Excel "serial date" days since 1899-12-30 (with Excel's 1900 leap year bug baked in).
  // xlsx follows this convention for most files.
  const d = XLSX.SSF.parse_date_code(serial);
  if (!d || typeof d.y !== "number" || typeof d.m !== "number" || typeof d.d !== "number") return null;
  const yyyy = String(d.y).padStart(4, "0");
  const mm = String(d.m).padStart(2, "0");
  const dd = String(d.d).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toIsoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return toIsoDateFromExcelSerial(value);
  }
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY or D/M/YYYY
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const dd = String(Number(m1[1])).padStart(2, "0");
    const mm = String(Number(m1[2])).padStart(2, "0");
    const yyyy = m1[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // DD-MM-YYYY
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m2) {
    const dd = String(Number(m2[1])).padStart(2, "0");
    const mm = String(Number(m2[2])).padStart(2, "0");
    const yyyy = m2[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // Attempt Date.parse fallback (best-effort)
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

function pickFirstNonEmpty(row: Row, keys: string[]): unknown {
  for (const k of keys) {
    if (k in row) {
      const v = row[k];
      if (typeof v === "string") {
        if (v.trim().length > 0) return v.trim();
      } else if (v !== null && v !== undefined) {
        return v;
      }
    }
  }
  return null;
}

function guessPlanName(workbook: XLSX.WorkBook): string {
  const title = workbook.Props?.Title;
  if (title && title.trim()) return title.trim();
  const sheet = workbook.SheetNames[0];
  if (sheet && sheet.trim()) return sheet.trim();
  return "Imported plan";
}

export function importPlanFromExcelArrayBuffer(buf: ArrayBuffer): PlanImport {
  const workbook = XLSX.read(buf, { type: "array", cellDates: true });
  if (!workbook.SheetNames.length) throw new Error("Excel file has no sheets.");

  // Template-compat strategy: read first non-empty sheet as a table
  // and try to find columns for date + template/session.
  let rows: Row[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const table = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null, raw: true });
    if (table.length > 0) {
      rows = table;
      break;
    }
  }
  if (rows.length === 0) throw new Error("Excel file has no rows.");

  // Normalize keys so we can handle template headers that vary slightly.
  const normalizedRows: Row[] = rows.map((r) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(r)) {
      out[normalizeHeaderKey(k)] = v;
    }
    return out;
  });

  const plannedSessions: PlanImport["plannedSessions"] = [];
  const templateNames = new Set<string>();

  for (const row of normalizedRows) {
    const dateValue = pickFirstNonEmpty(row, [
      "scheduled_for",
      "scheduledfor",
      "date",
      "day",
      "jour",
      "scheduled",
    ]);
    const scheduledFor = toIsoDate(dateValue);
    if (!scheduledFor) continue;

    const templateValue = pickFirstNonEmpty(row, [
      "template_name",
      "templatename",
      "template",
      "session_template",
      "session",
      "seance",
      "workout",
      "name",
    ]);
    const templateName =
      typeof templateValue === "string" && templateValue.trim().length > 0 ? templateValue.trim() : null;
    if (templateName) templateNames.add(templateName);

    // Everything else becomes payload, except known columns.
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (
        k === "scheduled_for" ||
        k === "scheduledfor" ||
        k === "date" ||
        k === "day" ||
        k === "jour" ||
        k === "template_name" ||
        k === "templatename" ||
        k === "template" ||
        k === "session_template" ||
        k === "session" ||
        k === "seance" ||
        k === "workout" ||
        k === "name"
      ) {
        continue;
      }
      if (v === null || v === undefined) continue;
      payload[k] = v;
    }

    plannedSessions.push({
      scheduledFor,
      templateName,
      payload,
    });
  }

  if (plannedSessions.length === 0) {
    throw new Error(
      "Excel template not recognized: expected rows with a date column (e.g. 'date' or 'scheduled_for').",
    );
  }

  const planName = guessPlanName(workbook);
  const importObj: PlanImport = {
    plan: { name: planName, description: null },
    planVersion: { version: 1, payload: {} },
    sessionTemplates: Array.from(templateNames).map((name) => ({ name, template: {} })),
    plannedSessions,
  };

  return planImportSchema.parse(importObj);
}

