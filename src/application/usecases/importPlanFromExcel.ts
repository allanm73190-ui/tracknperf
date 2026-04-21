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

type TableRow = {
  rowNumber: number;
  values: Row;
};

type LegacyWeekdayKey = "lundi" | "mardi" | "mercredi" | "jeudi" | "vendredi" | "samedi" | "dimanche";

const LEGACY_WEEKDAYS: Array<{ key: LegacyWeekdayKey; jsDay: number; aliases: string[] }> = [
  { key: "lundi", jsDay: 1, aliases: ["lundi", "monday"] },
  { key: "mardi", jsDay: 2, aliases: ["mardi", "tuesday"] },
  { key: "mercredi", jsDay: 3, aliases: ["mercredi", "wednesday"] },
  { key: "jeudi", jsDay: 4, aliases: ["jeudi", "thursday"] },
  { key: "vendredi", jsDay: 5, aliases: ["vendredi", "friday"] },
  { key: "samedi", jsDay: 6, aliases: ["samedi", "saturday"] },
  { key: "dimanche", jsDay: 0, aliases: ["dimanche", "sunday"] },
];

function normalizeHeaderKey(key: string): string {
  return key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function normalizeSheetKey(name: string): string {
  return normalizeHeaderKey(name).replace(/_+/g, "_");
}

function toIsoDateFromExcelSerial(serial: number): string | null {
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

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const dd = String(Number(m1[1])).padStart(2, "0");
    const mm = String(Number(m1[2])).padStart(2, "0");
    const yyyy = m1[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m2) {
    const dd = String(Number(m2[1])).padStart(2, "0");
    const mm = String(Number(m2[2])).padStart(2, "0");
    const yyyy = m2[3];
    return `${yyyy}-${mm}-${dd}`;
  }

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

function toInteger(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const n = Number(v.trim().replace(",", "."));
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

function readSheetTable(sheet: XLSX.WorkSheet): { headers: string[]; rows: TableRow[] } {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  if (!Array.isArray(matrix) || matrix.length === 0) return { headers: [], rows: [] };

  const rawHeaders = Array.isArray(matrix[0]) ? matrix[0] : [];
  const headers = rawHeaders.map((cell) => (typeof cell === "string" ? normalizeHeaderKey(cell) : ""));

  const rows: TableRow[] = [];
  for (let i = 1; i < matrix.length; i += 1) {
    const rawRow = matrix[i];
    const raw: unknown[] = Array.isArray(rawRow) ? rawRow : [];
    const values: Row = {};
    let hasContent = false;

    for (let j = 0; j < headers.length; j += 1) {
      const h = headers[j];
      if (!h) continue;
      const value = raw[j] ?? null;
      values[h] = value;
      if (typeof value === "string") {
        if (value.trim().length > 0) hasContent = true;
      } else if (value !== null && value !== undefined) {
        hasContent = true;
      }
    }

    if (hasContent) {
      rows.push({ rowNumber: i + 1, values });
    }
  }

  return { headers, rows };
}

function findSheetByAliases(
  workbook: XLSX.WorkBook,
  aliases: string[],
): { sheetName: string; sheet: XLSX.WorkSheet } | null {
  const normalizedAliases = new Set(aliases.map((a) => normalizeSheetKey(a)));
  for (const sheetName of workbook.SheetNames) {
    const key = normalizeSheetKey(sheetName);
    if (!normalizedAliases.has(key)) continue;
    const sheet = workbook.Sheets[sheetName];
    if (sheet) return { sheetName, sheet };
  }
  return null;
}

function parseJsonObjectCell(value: unknown, context: string, errors: string[]): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") {
    errors.push(`${context}: payload_json doit être un objet JSON.`);
    return {};
  }
  const s = value.trim();
  if (!s) return {};
  try {
    const parsed = JSON.parse(s) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      errors.push(`${context}: payload_json doit être un objet JSON.`);
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    errors.push(`${context}: payload_json invalide.`);
    return {};
  }
}

function toIsoDateLocal(d: Date): string {
  const yyyy = String(d.getFullYear()).padStart(4, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function extractYearFromText(value: string): number | null {
  const matches = Array.from(value.matchAll(/\b(20\d{2})\b/g));
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]?.[1];
  if (!last) return null;
  const year = Number(last);
  return Number.isFinite(year) ? year : null;
}

function parseLegacyMonthToken(token: string): number | null {
  const k = normalizeHeaderKey(token).replace(/_/g, "");
  if (k.startsWith("jan")) return 1;
  if (k.startsWith("fev") || k.startsWith("feb")) return 2;
  if (k.startsWith("mar")) return 3;
  if (k.startsWith("avr") || k.startsWith("apr")) return 4;
  if (k.startsWith("mai") || k.startsWith("may")) return 5;
  if (k.startsWith("juin") || k.startsWith("jun")) return 6;
  if (k.startsWith("juil") || k.startsWith("jul")) return 7;
  if (k.startsWith("aou") || k.startsWith("aug")) return 8;
  if (k.startsWith("sep")) return 9;
  if (k.startsWith("oct")) return 10;
  if (k.startsWith("nov")) return 11;
  if (k.startsWith("dec")) return 12;
  return null;
}

function parseLegacyDateRange(rangeValue: string, fallbackYear: number | null): { start: Date; end: Date } | null {
  const tokens = Array.from(
    rangeValue.matchAll(/(\d{1,2})\s*([A-Za-zÀ-ÿ]{3,})(?:\s*(\d{4}))?/g),
  );
  if (tokens.length < 2) return null;

  const first = tokens[0];
  const second = tokens[1];
  if (!first || !second) return null;

  const day1 = Number(first[1]);
  const month1 = parseLegacyMonthToken(first[2] ?? "");
  const year1 = first[3] ? Number(first[3]) : fallbackYear;
  const day2 = Number(second[1]);
  const month2 = parseLegacyMonthToken(second[2] ?? "");
  let year2 = second[3] ? Number(second[3]) : year1;

  if (!month1 || !month2 || !year1 || !Number.isFinite(day1) || !Number.isFinite(day2)) return null;
  if (year2 && year2 < year1) year2 = year1;
  if (!second[3] && year2 === year1 && month2 < month1) {
    year2 = year1 + 1;
  }
  if (!year2) return null;

  const start = new Date(year1, month1 - 1, day1, 12, 0, 0, 0);
  const end = new Date(year2, month2 - 1, day2, 12, 0, 0, 0);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end.getTime() < start.getTime()) return null;
  return { start, end };
}

function buildLegacyWeekdayDateMap(start: Date, end: Date): Map<LegacyWeekdayKey, string> {
  const byWeekday = new Map<LegacyWeekdayKey, string>();
  const maxSpanDays = Math.max(0, Math.min(10, Math.round((end.getTime() - start.getTime()) / 86400000)));

  for (let offset = 0; offset <= maxSpanDays; offset += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + offset);
    const jsDay = d.getDay();
    const match = LEGACY_WEEKDAYS.find((w) => w.jsDay === jsDay);
    if (!match) continue;
    byWeekday.set(match.key, toIsoDateLocal(d));
  }

  return byWeekday;
}

function isLikelyRestCell(value: string): boolean {
  const k = normalizeHeaderKey(value);
  const hasTrainingSignal =
    k.includes("force") ||
    k.includes("hypertroph") ||
    k.includes("specifi") ||
    k.includes("trail") ||
    k.includes("course");
  if (hasTrainingSignal) return false;
  return k.includes("repos") || k.includes("decharge");
}

function pickLegacyTemplateNameForDay(
  day: LegacyWeekdayKey,
  cellValue: string,
  templateNames: string[],
): string | null {
  const templates = templateNames.map((name) => ({ name, key: normalizeHeaderKey(name) }));
  const cellKey = normalizeHeaderKey(cellValue);
  const daySpecificTemplate = templates.find((t) => t.key.includes(day))?.name ?? null;
  const trailDayTemplate = templates.find((t) => t.key.includes("trail") && t.key.includes(day))?.name ?? null;

  if (cellKey.includes("force")) {
    return templates.find((t) => t.key.includes("force"))?.name ?? null;
  }
  if (cellKey.includes("hypertroph")) {
    return templates.find((t) => t.key.includes("hypertroph"))?.name ?? null;
  }
  if (cellKey.includes("specifi")) {
    return templates.find((t) => t.key.includes("specifi"))?.name ?? null;
  }

  if (cellKey.includes("trail") || cellKey.includes("course")) {
    return trailDayTemplate ?? templates.find((t) => t.key.includes("trail"))?.name ?? daySpecificTemplate;
  }

  if (!isLikelyRestCell(cellValue) && daySpecificTemplate) {
    return daySpecificTemplate;
  }
  return null;
}

function extractLegacyFallbackYear(workbook: XLSX.WorkBook): number | null {
  const fromTitle =
    typeof workbook.Props?.Title === "string" && workbook.Props.Title.trim()
      ? extractYearFromText(workbook.Props.Title)
      : null;
  if (fromTitle) return fromTitle;

  for (const sheetName of workbook.SheetNames) {
    if (!normalizeHeaderKey(sheetName).includes("instruction")) continue;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
    for (let i = 0; i < Math.min(rows.length, 12); i += 1) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        if (typeof cell !== "string" || !cell.trim()) continue;
        const year = extractYearFromText(cell);
        if (year) return year;
      }
    }
  }
  return null;
}

function parseLegacyOverviewPlannedSessions(
  workbook: XLSX.WorkBook,
  templateNames: string[],
): PlanImport["plannedSessions"] {
  const fallbackYear = extractLegacyFallbackYear(workbook);
  const planned: PlanImport["plannedSessions"] = [];
  const dedupe = new Set<string>();

  for (const sheetName of workbook.SheetNames) {
    const key = normalizeHeaderKey(sheetName);
    if (!key.includes("instruction")) continue;
    if (!(key.includes("vue") || key.includes("overview") || key.includes("ensemble"))) continue;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
    if (!Array.isArray(rows) || rows.length === 0) continue;

    let headerRowIndex = -1;
    let semIdx = -1;
    let datesIdx = -1;
    let phaseIdx = -1;
    const weekdayIndexByKey = new Map<LegacyWeekdayKey, number>();

    for (let i = 0; i < Math.min(rows.length, 25); i += 1) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const normalized = row.map((cell) => (typeof cell === "string" ? normalizeHeaderKey(cell) : ""));

      const nextSemIdx = normalized.findIndex((h) => h === "sem" || h === "semaine" || h === "week");
      const nextDatesIdx = normalized.findIndex((h) => h === "dates" || h === "date");
      if (nextSemIdx < 0 || nextDatesIdx < 0) continue;

      const nextWeekdayIndexByKey = new Map<LegacyWeekdayKey, number>();
      for (const day of LEGACY_WEEKDAYS) {
        const idx = normalized.findIndex((h) => day.aliases.includes(h));
        if (idx >= 0) nextWeekdayIndexByKey.set(day.key, idx);
      }
      if (nextWeekdayIndexByKey.size < 3) continue;

      headerRowIndex = i;
      semIdx = nextSemIdx;
      datesIdx = nextDatesIdx;
      phaseIdx = normalized.findIndex((h) => h === "phase");
      for (const [dayKey, idx] of nextWeekdayIndexByKey.entries()) {
        weekdayIndexByKey.set(dayKey, idx);
      }
      break;
    }

    if (headerRowIndex < 0) continue;

    for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const weekLabel = normalizeMaybeString(row[semIdx]);
      if (!weekLabel || !/^s\d+/i.test(weekLabel)) continue;

      const dateRangeRaw = normalizeMaybeString(row[datesIdx]);
      if (!dateRangeRaw) continue;
      const dateRange = parseLegacyDateRange(dateRangeRaw, fallbackYear);
      if (!dateRange) continue;

      const dateMap = buildLegacyWeekdayDateMap(dateRange.start, dateRange.end);
      if (dateMap.size < 5) continue;
      const phaseValue = phaseIdx >= 0 ? normalizeMaybeString(row[phaseIdx]) : null;

      for (const day of LEGACY_WEEKDAYS) {
        const columnIndex = weekdayIndexByKey.get(day.key);
        if (columnIndex === undefined) continue;
        const rawCell = normalizeMaybeString(row[columnIndex]);
        if (!rawCell || isLikelyRestCell(rawCell)) continue;

        const templateName = pickLegacyTemplateNameForDay(day.key, rawCell, templateNames);
        if (!templateName) continue;
        const scheduledFor = dateMap.get(day.key);
        if (!scheduledFor) continue;

        const dedupeKey = `${scheduledFor}::${templateName.toLowerCase()}::${weekLabel.toLowerCase()}`;
        if (dedupe.has(dedupeKey)) continue;
        dedupe.add(dedupeKey);

        planned.push({
          scheduledFor,
          templateName,
          payload: {
            source: "legacy_programme_template_schedule",
            sheetName,
            weekLabel,
            phase: phaseValue,
            day: day.key,
            text: rawCell,
          },
        });
      }
    }
  }

  planned.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  return planned;
}

function parseProgrammeTemplateWorkbook(workbook: XLSX.WorkBook): PlanImport | null {
  const templateSheets = workbook.SheetNames.filter((n) => !n.toLowerCase().includes("instruction"));
  const sessionTemplates: PlanImport["sessionTemplates"] = [];

  function findHeaderIndex(header: string[], aliases: string[]): number {
    return header.findIndex((h) => aliases.some((alias) => h === alias || h.startsWith(alias)));
  }

  function isSectionSeparatorRow(value: string): boolean {
    const compact = value.trim();
    if (!compact) return true;
    if (/^[\-\u2500\u2013\u2014_ ]+$/.test(compact)) return true;
    return /^[\-\u2500\u2013\u2014_ ]+.+[\-\u2500\u2013\u2014_ ]+$/.test(compact);
  }

  for (const sheetName of templateSheets) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
    if (rows.length < 2) continue;

    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const r = rows[i];
      if (!Array.isArray(r)) continue;
      const normalized = r.map((c) => (typeof c === "string" ? normalizeHeaderKey(c) : ""));
      if (normalized.some((h) => h === "exercice" || h === "exercise" || h === "exercices" || h === "exercises")) {
        headerRowIndex = i;
        break;
      }
    }
    if (headerRowIndex < 0) continue;

    const header =
      (rows[headerRowIndex] ?? []).map((c) => (typeof c === "string" ? normalizeHeaderKey(c) : "")) ?? [];
    const exIdx = findHeaderIndex(header, ["exercice", "exercise", "exercices", "exercises", "mouvement"]);
    if (exIdx < 0) continue;
    const seriesIdx = findHeaderIndex(header, ["series", "serie", "set", "sets"]);
    const repsIdx = findHeaderIndex(header, ["reps", "rep", "repetition", "repetitions"]);
    const loadIdx = findHeaderIndex(header, ["charge", "load", "poids"]);
    const tempoIdx = findHeaderIndex(header, ["tempo", "cadence"]);
    const restIdx = findHeaderIndex(header, ["repos", "rest", "recuperation"]);
    const rirIdx = findHeaderIndex(header, ["rir"]);
    const notesIdx = findHeaderIndex(header, ["notes_coach", "notes", "commentaire", "consigne"]);

    const items: ProgrammeRow[] = [];
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!Array.isArray(r)) continue;
      const exercise = normalizeMaybeString(r[exIdx]);
      if (!exercise) continue;
      if (isSectionSeparatorRow(exercise)) continue;
      items.push({
        exercise,
        series: seriesIdx >= 0 ? normalizeMaybeString(r[seriesIdx]) : null,
        reps: repsIdx >= 0 ? normalizeMaybeString(r[repsIdx]) : null,
        load: loadIdx >= 0 ? normalizeMaybeString(r[loadIdx]) : null,
        tempo: tempoIdx >= 0 ? normalizeMaybeString(r[tempoIdx]) : null,
        rest: restIdx >= 0 ? normalizeMaybeString(r[restIdx]) : null,
        rir: rirIdx >= 0 ? normalizeMaybeString(r[rirIdx]) : null,
        coachNotes: notesIdx >= 0 ? normalizeMaybeString(r[notesIdx]) : null,
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
  const plannedSessions = parseLegacyOverviewPlannedSessions(
    workbook,
    sessionTemplates.map((t) => t.name),
  );

  return planImportSchema.parse({
    plan: { name: planName, description: "Imported from legacy programme_template.xlsx" },
    planVersion: {
      version: 1,
      payload: {
        source: "legacy_programme_template",
        legacyPlannedSessionsCount: plannedSessions.length,
      },
    },
    sessionTemplates,
    plannedSessions,
  });
}

function parseV2Workbook(workbook: XLSX.WorkBook): PlanImport | null {
  const planSheet = findSheetByAliases(workbook, ["plan", "meta", "metadata"]);
  const templatesSheet = findSheetByAliases(workbook, ["templates", "session_templates"]);
  const itemsSheet = findSheetByAliases(workbook, ["items", "template_items", "session_template_items", "exercises", "exercices"]);
  const plannedSheet = findSheetByAliases(workbook, ["planned_sessions", "planning", "planned", "sessions"]);

  const hasV2Clues = !!planSheet || !!templatesSheet || !!itemsSheet || !!plannedSheet;
  if (!hasV2Clues) return null;

  const errors: string[] = [];
  const templateMap = new Map<string, { name: string; template: Record<string, unknown> }>();

  let planName = guessPlanName(workbook);
  let planDescription: string | null = null;
  let planVersion = 1;
  let planPayload: Record<string, unknown> = {};

  if (planSheet) {
    const { rows } = readSheetTable(planSheet.sheet);
    const first = rows[0]?.values ?? {};

    const planNameRaw = pickFirstNonEmpty(first, ["plan_name", "name", "title"]);
    if (typeof planNameRaw === "string" && planNameRaw.trim()) {
      planName = planNameRaw.trim();
    }

    const descriptionRaw = pickFirstNonEmpty(first, ["plan_description", "description"]);
    if (typeof descriptionRaw === "string" && descriptionRaw.trim()) {
      planDescription = descriptionRaw.trim();
    }

    const versionRaw = pickFirstNonEmpty(first, ["version", "plan_version"]);
    const v = toInteger(versionRaw);
    if (v !== null && v >= 1) {
      planVersion = v;
    } else if (versionRaw !== null && versionRaw !== undefined) {
      errors.push(`Feuille ${planSheet.sheetName}: version invalide (${String(versionRaw)}).`);
    }

    const payloadFromCell = parseJsonObjectCell(first.payload_json, `Feuille ${planSheet.sheetName} ligne 2`, errors);
    const reserved = new Set(["plan_name", "name", "title", "plan_description", "description", "version", "plan_version", "payload_json"]);
    const extra: Record<string, unknown> = {};
    for (const [k, v2] of Object.entries(first)) {
      if (reserved.has(k)) continue;
      if (v2 === null || v2 === undefined || (typeof v2 === "string" && !v2.trim())) continue;
      extra[k] = v2;
    }
    planPayload = { ...payloadFromCell, ...extra };
  }

  if (templatesSheet) {
    const { headers, rows } = readSheetTable(templatesSheet.sheet);
    if (!headers.includes("template_name") && !headers.includes("name")) {
      errors.push(`Feuille ${templatesSheet.sheetName}: colonne requise manquante (template_name).`);
    }

    for (const row of rows) {
      const rawName = pickFirstNonEmpty(row.values, ["template_name", "name"]);
      const templateName = typeof rawName === "string" ? rawName.trim() : null;
      if (!templateName) {
        errors.push(`Feuille ${templatesSheet.sheetName} ligne ${row.rowNumber}: template_name manquant.`);
        continue;
      }
      const key = templateName.toLowerCase();
      if (templateMap.has(key)) {
        errors.push(`Feuille ${templatesSheet.sheetName} ligne ${row.rowNumber}: template dupliqué (${templateName}).`);
        continue;
      }

      const payloadFromCell = parseJsonObjectCell(
        row.values.payload_json,
        `Feuille ${templatesSheet.sheetName} ligne ${row.rowNumber}`,
        errors,
      );

      const templateObj: Record<string, unknown> = {
        source: "excel_v2",
        sheetName: templatesSheet.sheetName,
        description: normalizeMaybeString(row.values.description),
        sessionType: normalizeMaybeString(pickFirstNonEmpty(row.values, ["session_type", "type"])),
        priority: normalizeMaybeString(row.values.priority),
        lockStatus: normalizeMaybeString(pickFirstNonEmpty(row.values, ["lock_status", "lock"])),
        blockPrimaryGoal: normalizeMaybeString(pickFirstNonEmpty(row.values, ["block_primary_goal", "primary_goal"])),
        items: [],
        ...payloadFromCell,
      };

      templateMap.set(key, { name: templateName, template: templateObj });
    }
  }

  if (itemsSheet) {
    const { headers, rows } = readSheetTable(itemsSheet.sheet);
    const hasTemplateCol = headers.includes("template_name") || headers.includes("template");
    const hasExerciseCol =
      headers.includes("exercise_name") || headers.includes("exercise") || headers.includes("exercice") || headers.includes("name");
    if (!hasTemplateCol) errors.push(`Feuille ${itemsSheet.sheetName}: colonne requise manquante (template_name).`);
    if (!hasExerciseCol) errors.push(`Feuille ${itemsSheet.sheetName}: colonne requise manquante (exercise_name).`);

    const counters = new Map<string, number>();

    for (const row of rows) {
      const templateNameRaw = pickFirstNonEmpty(row.values, ["template_name", "template"]);
      const templateName = typeof templateNameRaw === "string" ? templateNameRaw.trim() : null;
      if (!templateName) {
        errors.push(`Feuille ${itemsSheet.sheetName} ligne ${row.rowNumber}: template_name manquant.`);
        continue;
      }

      const exerciseNameRaw = pickFirstNonEmpty(row.values, ["exercise_name", "exercise", "exercice", "name", "title"]);
      const exerciseName = typeof exerciseNameRaw === "string" ? exerciseNameRaw.trim() : null;
      if (!exerciseName) {
        errors.push(`Feuille ${itemsSheet.sheetName} ligne ${row.rowNumber}: exercise_name manquant.`);
        continue;
      }

      const key = templateName.toLowerCase();
      if (!templateMap.has(key)) {
        templateMap.set(key, {
          name: templateName,
          template: { source: "excel_v2", sheetName: itemsSheet.sheetName, items: [] },
        });
      }

      const tpl = templateMap.get(key)!;
      const itemList = Array.isArray(tpl.template.items) ? (tpl.template.items as Array<Record<string, unknown>>) : [];

      const explicitPosition = toInteger(row.values.position);
      const nextPos = (counters.get(key) ?? 0) + 1;
      counters.set(key, nextPos);
      const itemPayloadFromCell = parseJsonObjectCell(
        row.values.payload_json,
        `Feuille ${itemsSheet.sheetName} ligne ${row.rowNumber}`,
        errors,
      );

      const reserved = new Set([
        "template_name",
        "template",
        "position",
        "exercise_name",
        "exercise",
        "exercice",
        "name",
        "title",
        "series",
        "sets",
        "reps",
        "repetitions",
        "load",
        "load_kg",
        "charge",
        "tempo",
        "rest",
        "rest_seconds",
        "repos",
        "recuperation",
        "rir",
        "coach_notes",
        "notes_coach",
        "notes",
        "payload_json",
      ]);
      const extra: Record<string, unknown> = {};
      for (const [k, v3] of Object.entries(row.values)) {
        if (reserved.has(k)) continue;
        if (v3 === null || v3 === undefined || (typeof v3 === "string" && !v3.trim())) continue;
        extra[k] = v3;
      }

      itemList.push({
        position: explicitPosition !== null && explicitPosition >= 1 ? explicitPosition : nextPos,
        exercise: exerciseName,
        series: normalizeMaybeString(pickFirstNonEmpty(row.values, ["series", "sets"])),
        reps: normalizeMaybeString(pickFirstNonEmpty(row.values, ["reps", "repetitions"])),
        load: normalizeMaybeString(pickFirstNonEmpty(row.values, ["load", "load_kg", "charge"])),
        tempo: normalizeMaybeString(row.values.tempo),
        rest: normalizeMaybeString(pickFirstNonEmpty(row.values, ["rest", "rest_seconds", "repos", "recuperation"])),
        rir: normalizeMaybeString(row.values.rir),
        coachNotes: normalizeMaybeString(pickFirstNonEmpty(row.values, ["coach_notes", "notes_coach", "notes"])),
        ...itemPayloadFromCell,
        ...extra,
      });

      tpl.template.items = itemList
        .slice()
        .sort((a, b) => (toInteger(a.position) ?? 0) - (toInteger(b.position) ?? 0))
        .map(({ position: _ignored, ...rest }) => rest);
    }
  }

  const plannedSessions: PlanImport["plannedSessions"] = [];
  if (plannedSheet) {
    const { headers, rows } = readSheetTable(plannedSheet.sheet);
    const hasDateCol =
      headers.includes("scheduled_for") ||
      headers.includes("date") ||
      headers.includes("jour") ||
      headers.includes("day") ||
      headers.includes("scheduled");
    if (!hasDateCol) {
      errors.push(`Feuille ${plannedSheet.sheetName}: colonne requise manquante (scheduled_for/date).`);
    }

    for (const row of rows) {
      const dateValue = pickFirstNonEmpty(row.values, ["scheduled_for", "date", "jour", "day", "scheduled"]);
      const scheduledFor = toIsoDate(dateValue);
      if (!scheduledFor) {
        errors.push(
          `Feuille ${plannedSheet.sheetName} ligne ${row.rowNumber}: date invalide (${String(dateValue ?? "vide")}). Formats acceptés: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY.`,
        );
        continue;
      }

      const templateRaw = pickFirstNonEmpty(row.values, ["template_name", "template", "session_template", "session", "seance", "workout", "name"]);
      const templateName = typeof templateRaw === "string" && templateRaw.trim() ? templateRaw.trim() : null;
      if (templateName) {
        const key = templateName.toLowerCase();
        if (!templateMap.has(key)) {
          templateMap.set(key, {
            name: templateName,
            template: { source: "excel_v2", sheetName: plannedSheet.sheetName, items: [] },
          });
        }
      }

      const payloadFromCell = parseJsonObjectCell(
        row.values.payload_json,
        `Feuille ${plannedSheet.sheetName} ligne ${row.rowNumber}`,
        errors,
      );

      const payload: Record<string, unknown> = {};
      for (const [k, v4] of Object.entries(row.values)) {
        if (
          k === "scheduled_for" ||
          k === "date" ||
          k === "jour" ||
          k === "day" ||
          k === "scheduled" ||
          k === "template_name" ||
          k === "template" ||
          k === "session_template" ||
          k === "session" ||
          k === "seance" ||
          k === "workout" ||
          k === "name" ||
          k === "payload_json"
        ) {
          continue;
        }
        if (v4 === null || v4 === undefined || (typeof v4 === "string" && !v4.trim())) continue;
        payload[k] = v4;
      }

      plannedSessions.push({
        scheduledFor,
        templateName,
        payload: { ...payloadFromCell, ...payload },
      });
    }
  }

  if (errors.length > 0) {
    throw new Error(`Excel V2 invalide:\n- ${errors.slice(0, 20).join("\n- ")}`);
  }

  const sessionTemplates = Array.from(templateMap.values()).map((entry) => ({
    name: entry.name,
    template: entry.template,
  }));

  if (sessionTemplates.length === 0 && plannedSessions.length === 0) {
    throw new Error("Excel V2 invalide: aucune donnée exploitable (templates/items/planned_sessions). ");
  }

  return planImportSchema.parse({
    plan: { name: planName, description: planDescription },
    planVersion: {
      version: planVersion,
      payload: {
        source: "excel_v2",
        ...planPayload,
      },
    },
    sessionTemplates,
    plannedSessions,
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

function parseSimpleDateTemplateWorkbook(workbook: XLSX.WorkBook, legacyDetected: boolean): PlanImport {
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
  return planImportSchema.parse({
    plan: { name: planName, description: null },
    planVersion: { version: 1, payload: {} },
    sessionTemplates: Array.from(templateNames).map((name) => ({ name, template: {} })),
    plannedSessions,
  });
}

export function importPlanFromExcelArrayBuffer(buf: ArrayBuffer | Uint8Array): PlanImport {
  const workbook = XLSX.read(toArrayBuffer(buf), { type: "array", cellDates: true });
  if (!workbook.SheetNames.length) throw new Error("Excel file has no sheets.");

  // Legacy template remains priority.
  const legacy = parseProgrammeTemplateWorkbook(workbook);
  if (legacy) return legacy;
  const legacyDetected = detectLegacyProgrammeTemplate(workbook);

  // If a V2 workbook structure is detected, parse it explicitly.
  const v2 = parseV2Workbook(workbook);
  if (v2) return v2;

  // Final fallback: simple date + template flat sheet.
  return parseSimpleDateTemplateWorkbook(workbook, legacyDetected);
}
