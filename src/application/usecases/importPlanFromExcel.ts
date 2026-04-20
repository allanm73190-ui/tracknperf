import * as XLSX from "xlsx";
import type { PlanImport } from "../../domain/plan/planImport";
import { planImportSchema } from "../../domain/plan/planImport.schema";

type Row = Record<string, unknown>;

type ProgrammeRow = {
  exercise: string;
  series: string | null;
  reps: string | null;
  load: string | null;
  tempo: string | null;
  rest: string | null;
  rir: string | null;
  coachNotes: string | null;
};

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

function stripEmojiAndTrim(name: string): string {
  return name.replace(/[^\p{L}\p{N}\p{P}\p{Z}]/gu, "").trim();
}

function normalizeMaybeString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const s = v.trim();
    return s.length ? s : null;
  }
  return String(v);
}

function parseProgrammeTemplateWorkbook(workbook: XLSX.WorkBook): PlanImport | null {
  // Legacy template (`tracknperf_deploy/programme_template.xlsx`) has sheets like:
  // '🏋️ Force', '🎯 Hypertrophie', '🔧 Spécifique', '🏔️ Trail', '😌 Repos'
  // Each sheet is a simple table with header row:
  // Exercice | Séries | Reps | Charge | Tempo | Repos | RIR | Notes coach
  const templateSheets = workbook.SheetNames.filter((n) => !n.toLowerCase().includes("instruction"));
  const sessionTemplates: PlanImport["sessionTemplates"] = [];

  for (const sheetName of templateSheets) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
    if (rows.length < 2) continue;

    // Legacy sheets have a title row, then the header row.
    // Find the header row by scanning for a cell that normalizes to "exercice".
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const r = rows[i];
      if (!Array.isArray(r)) continue;
      const normalized = r.map((c) => (typeof c === "string" ? normalizeHeaderKey(c) : ""));
      if (normalized.some((h) => h === "exercice" || h === "exercise")) {
        headerRowIndex = i;
        break;
      }
    }
    if (headerRowIndex < 0) continue;

    const header =
      (rows[headerRowIndex] ?? []).map((c) => (typeof c === "string" ? normalizeHeaderKey(c) : "")) ?? [];
    const exIdx = header.findIndex((h) => h === "exercice" || h === "exercise");
    if (exIdx < 0) continue;

    const items: ProgrammeRow[] = [];
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!Array.isArray(r)) continue;
      const exercise = normalizeMaybeString(r[exIdx]);
      if (!exercise) continue;
      items.push({
        exercise,
        // Legacy template uses fixed column order A-H.
        series: normalizeMaybeString(r[1]),
        reps: normalizeMaybeString(r[2]),
        load: normalizeMaybeString(r[3]),
        tempo: normalizeMaybeString(r[4]),
        rest: normalizeMaybeString(r[5]),
        rir: normalizeMaybeString(r[6]),
        coachNotes: normalizeMaybeString(r[7]),
      });
    }

    if (!items.length) continue;

    sessionTemplates.push({
      name: stripEmojiAndTrim(sheetName) || sheetName,
      template: {
        source: "legacy_programme_template",
        sheetName,
        columns: header,
        items,
      },
    });
  }

  if (!sessionTemplates.length) return null;

  const planName = workbook.Props?.Title?.trim() || "Imported programme";

  return planImportSchema.parse({
    plan: { name: planName, description: "Imported from legacy programme_template.xlsx" },
    planVersion: { version: 1, payload: { source: "legacy_programme_template" } },
    sessionTemplates,
    plannedSessions: [],
  });
}

function toArrayBuffer(buf: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (buf instanceof ArrayBuffer) return buf;
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export function importProgrammeTemplateFromExcelArrayBuffer(
  buf: ArrayBuffer | Uint8Array,
): PlanImport | null {
  const workbook = XLSX.read(toArrayBuffer(buf), { type: "array", cellDates: true });
  if (!workbook.SheetNames.length) return null;
  return parseProgrammeTemplateWorkbook(workbook);
}

function detectLegacyProgrammeTemplate(workbook: XLSX.WorkBook): boolean {
  let matchingSheets = 0;
  for (const sheetName of workbook.SheetNames) {
    if (sheetName.toLowerCase().includes("instruction")) continue;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const r = rows[i];
      if (!Array.isArray(r)) continue;
      const normalized = r.map((c) => (typeof c === "string" ? normalizeHeaderKey(c) : ""));
      const hasExercise = normalized.includes("exercice") || normalized.includes("exercise");
      const hasNotesCoach = normalized.includes("notes_coach");
      if (hasExercise && hasNotesCoach) {
        matchingSheets++;
        break;
      }
    }
  }
  return matchingSheets >= 2;
}

export function importPlanFromExcelArrayBuffer(buf: ArrayBuffer | Uint8Array): PlanImport {
  const workbook = XLSX.read(toArrayBuffer(buf), { type: "array", cellDates: true });
  if (!workbook.SheetNames.length) throw new Error("Excel file has no sheets.");

  // Detect if the first non-empty sheet contains a date column → Format A takes priority.
  const DATE_COLUMN_KEYS = ["scheduled_for", "scheduledfor", "date", "day", "jour", "scheduled"];
  let firstSheetHasDateColumn = false;
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const probe = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null, raw: true });
    if (probe.length === 0) continue;
    const firstRow = probe[0];
    if (!firstRow) continue;
    const normalizedKeys = Object.keys(firstRow).map((k) => normalizeHeaderKey(k));
    firstSheetHasDateColumn = normalizedKeys.some((k) => DATE_COLUMN_KEYS.includes(k));
    break;
  }

  // Only check for legacy format when the first sheet does not have a date column.
  const legacyDetected = !firstSheetHasDateColumn && detectLegacyProgrammeTemplate(workbook);
  if (legacyDetected) {
    const legacy = parseProgrammeTemplateWorkbook(workbook);
    if (legacy) return legacy;
  }

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
  let totalRows = 0;
  let skippedRows = 0;
  const invalidDates: string[] = [];

  for (const row of normalizedRows) {
    totalRows++;
    const dateValue = pickFirstNonEmpty(row, [
      "scheduled_for",
      "scheduledfor",
      "date",
      "day",
      "jour",
      "scheduled",
    ]);
    const scheduledFor = toIsoDate(dateValue);
    if (!scheduledFor) {
      if (dateValue !== null && dateValue !== undefined) {
        const raw = String(dateValue);
        if (raw.trim().length > 0 && invalidDates.length < 5) {
          invalidDates.push(raw);
        }
      }
      skippedRows++;
      continue;
    }

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
    const legacy = parseProgrammeTemplateWorkbook(workbook);
    if (legacy) return legacy;

    if (legacyDetected) {
      throw new Error(
        `Legacy programme template detected (sheets: ${workbook.SheetNames.join(
          ", ",
        )}), but no templates could be parsed.`,
      );
    }
    const detectedColumns = normalizedRows[0] ? Object.keys(normalizedRows[0]) : [];
    const rowsInfo = `${totalRows} row${totalRows !== 1 ? "s" : ""} found, all skipped (no valid date).`;
    const colsInfo = `Detected columns: [${detectedColumns.join(", ")}]. Expected one of: date, scheduled_for, jour, day, scheduled.`;
    const invalidInfo =
      invalidDates.length > 0
        ? ` Invalid date values found: [${invalidDates.join(", ")}]. Accepted formats: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY.`
        : "";
    throw new Error(
      `Excel template not recognized: no valid date column found. ${rowsInfo} ${colsInfo}${invalidInfo}`,
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
