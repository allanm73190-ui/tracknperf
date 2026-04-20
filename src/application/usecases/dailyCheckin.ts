import { supabase } from "../../infra/supabase/client";
import { enqueueSyncOp } from "../../infra/offline/db";
import { flushSyncQueue } from "../sync/syncClient";

export type DailyCheckin = {
  id: string;
  checkinDate: string;
  painScore: number | null;
  painRedFlag: boolean;
  fatigueScore: number | null;
  readinessScore: number | null;
  sleepHours: number | null;
  sleepQualityScore: number | null;
  sorenessScore: number | null;
  stressScore: number | null;
  moodScore: number | null;
  availableTimeTodayMin: number | null;
  degradedModeDays: number | null;
  hrvBelowBaselineDays: number | null;
  rhrDeltaBpm: number | null;
  illnessFlag: boolean;
  neurologicalSymptomsFlag: boolean;
  limpFlag: boolean;
  notes: string | null;
  payload: Record<string, unknown>;
  pendingSync: boolean;
};

export type UpsertDailyCheckinInput = {
  checkinDate?: string;
  painScore?: number | null;
  painRedFlag?: boolean;
  fatigueScore?: number | null;
  readinessScore?: number | null;
  sleepHours?: number | null;
  sleepQualityScore?: number | null;
  sorenessScore?: number | null;
  stressScore?: number | null;
  moodScore?: number | null;
  availableTimeTodayMin?: number | null;
  degradedModeDays?: number | null;
  hrvBelowBaselineDays?: number | null;
  rhrDeltaBpm?: number | null;
  illnessFlag?: boolean;
  neurologicalSymptomsFlag?: boolean;
  limpFlag?: boolean;
  notes?: string | null;
  payload?: Record<string, unknown>;
};

const DAILY_CHECKIN_FALLBACK_SOURCE = "daily_checkin_fallback_v1";

function toIsoDate(d: Date): string {
  const yyyy = String(d.getFullYear()).padStart(4, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeCheckinDate(input?: string): string {
  if (!input) return toIsoDate(new Date());
  const s = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error("La date du check-in doit être au format YYYY-MM-DD.");
  }
  return s;
}

function toNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim().replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toNullableInteger(v: unknown): number | null {
  const n = toNullableNumber(v);
  if (n === null) return null;
  return Math.round(n);
}

function toBoolean(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "oui"].includes(s)) return true;
    if (["false", "0", "no", "non"].includes(s)) return false;
  }
  return fallback;
}

function ensureRange(name: string, value: number | null, min: number, max: number): number | null {
  if (value === null) return null;
  if (value < min || value > max) {
    throw new Error(`${name} doit être compris entre ${min} et ${max}.`);
  }
  return value;
}

function ensureMin(name: string, value: number | null, min: number): number | null {
  if (value === null) return null;
  if (value < min) {
    throw new Error(`${name} doit être supérieur ou égal à ${min}.`);
  }
  return value;
}

function toNullableString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return String(v);
  const s = v.trim();
  return s.length ? s : null;
}

function isLikelyNetworkError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const msg = "message" in err && typeof (err as { message?: unknown }).message === "string"
    ? ((err as { message: string }).message ?? "")
    : "";
  const m = msg.toLowerCase();
  return m.includes("failed to fetch") || m.includes("network") || m.includes("fetch");
}

function isMissingTableError(err: unknown, tableName: string): boolean {
  if (!err || typeof err !== "object") return false;
  const message = "message" in err && typeof (err as { message?: unknown }).message === "string"
    ? (err as { message: string }).message
    : "";
  const m = message.toLowerCase();
  const table = tableName.toLowerCase();
  return (
    m.includes(table) &&
    (m.includes("could not find") || m.includes("does not exist") || m.includes("schema cache"))
  );
}

function mapFallbackMetricsToRow(
  id: string,
  metrics: Record<string, unknown>,
  checkinDateFallback: string,
): Record<string, unknown> {
  const payload =
    metrics.payload && typeof metrics.payload === "object"
      ? (metrics.payload as Record<string, unknown>)
      : {};
  return {
    id,
    checkin_date: toNullableString(metrics.checkin_date) ?? checkinDateFallback,
    pain_score: toNullableNumber(metrics.pain_score ?? metrics.painScore),
    pain_red_flag: toBoolean(metrics.pain_red_flag ?? metrics.painRedFlag, false),
    fatigue_score: toNullableNumber(metrics.fatigue_score ?? metrics.fatigueScore),
    readiness_score: toNullableNumber(metrics.readiness_score ?? metrics.readinessScore),
    sleep_hours: toNullableNumber(metrics.sleep_hours ?? metrics.sleepHours),
    sleep_quality_score: toNullableNumber(metrics.sleep_quality_score ?? metrics.sleepQualityScore),
    soreness_score: toNullableNumber(metrics.soreness_score ?? metrics.sorenessScore),
    stress_score: toNullableNumber(metrics.stress_score ?? metrics.stressScore),
    mood_score: toNullableNumber(metrics.mood_score ?? metrics.moodScore),
    available_time_today_min: toNullableInteger(metrics.available_time_today_min ?? metrics.availableTimeTodayMin),
    degraded_mode_days: toNullableInteger(metrics.degraded_mode_days ?? metrics.degradedModeDays),
    hrv_below_baseline_days: toNullableInteger(metrics.hrv_below_baseline_days ?? metrics.hrvBelowBaselineDays),
    rhr_delta_bpm: toNullableNumber(metrics.rhr_delta_bpm ?? metrics.rhrDeltaBpm),
    illness_flag: toBoolean(metrics.illness_flag ?? metrics.illnessFlag, false),
    neurological_symptoms_flag: toBoolean(metrics.neurological_symptoms_flag ?? metrics.neurologicalSymptomsFlag, false),
    limp_flag: toBoolean(metrics.limp_flag ?? metrics.limpFlag, false),
    notes: toNullableString(metrics.notes),
    payload,
  };
}

function buildFallbackMetricsFromRowPayload(
  rowPayload: Record<string, unknown>,
  checkinDate: string,
): Record<string, unknown> {
  return {
    source: DAILY_CHECKIN_FALLBACK_SOURCE,
    checkin_date: checkinDate,
    pain_score: toNullableNumber(rowPayload.pain_score),
    pain_red_flag: toBoolean(rowPayload.pain_red_flag, false),
    fatigue_score: toNullableNumber(rowPayload.fatigue_score),
    readiness_score: toNullableNumber(rowPayload.readiness_score),
    sleep_hours: toNullableNumber(rowPayload.sleep_hours),
    sleep_quality_score: toNullableNumber(rowPayload.sleep_quality_score),
    soreness_score: toNullableNumber(rowPayload.soreness_score),
    stress_score: toNullableNumber(rowPayload.stress_score),
    mood_score: toNullableNumber(rowPayload.mood_score),
    available_time_today_min: toNullableInteger(rowPayload.available_time_today_min),
    degraded_mode_days: toNullableInteger(rowPayload.degraded_mode_days),
    hrv_below_baseline_days: toNullableInteger(rowPayload.hrv_below_baseline_days),
    rhr_delta_bpm: toNullableNumber(rowPayload.rhr_delta_bpm),
    illness_flag: toBoolean(rowPayload.illness_flag, false),
    neurological_symptoms_flag: toBoolean(rowPayload.neurological_symptoms_flag, false),
    limp_flag: toBoolean(rowPayload.limp_flag, false),
    notes: toNullableString(rowPayload.notes),
    payload: rowPayload.payload && typeof rowPayload.payload === "object" ? rowPayload.payload : {},
  };
}

async function loadFallbackCheckinByDate(checkinDate: string): Promise<DailyCheckin | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("internal_metrics")
    .select("id, metrics")
    .contains("metrics", { source: DAILY_CHECKIN_FALLBACK_SOURCE, checkin_date: checkinDate })
    .order("captured_at", { ascending: false })
    .limit(1);
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const row = data[0];
  if (!row || typeof row !== "object") return null;
  const metrics = row.metrics && typeof row.metrics === "object" ? (row.metrics as Record<string, unknown>) : null;
  if (!metrics) return null;
  const mapped = mapFallbackMetricsToRow(String(row.id ?? crypto.randomUUID()), metrics, checkinDate);
  return mapCheckinRow(mapped, false);
}

function mapCheckinRow(row: Record<string, unknown>, pendingSync: boolean): DailyCheckin {
  return {
    id: String(row.id ?? crypto.randomUUID()),
    checkinDate: String(row.checkin_date ?? toIsoDate(new Date())),
    painScore: toNullableNumber(row.pain_score),
    painRedFlag: toBoolean(row.pain_red_flag, false),
    fatigueScore: toNullableNumber(row.fatigue_score),
    readinessScore: toNullableNumber(row.readiness_score),
    sleepHours: toNullableNumber(row.sleep_hours),
    sleepQualityScore: toNullableNumber(row.sleep_quality_score),
    sorenessScore: toNullableNumber(row.soreness_score),
    stressScore: toNullableNumber(row.stress_score),
    moodScore: toNullableNumber(row.mood_score),
    availableTimeTodayMin: toNullableInteger(row.available_time_today_min),
    degradedModeDays: toNullableInteger(row.degraded_mode_days),
    hrvBelowBaselineDays: toNullableInteger(row.hrv_below_baseline_days),
    rhrDeltaBpm: toNullableNumber(row.rhr_delta_bpm),
    illnessFlag: toBoolean(row.illness_flag, false),
    neurologicalSymptomsFlag: toBoolean(row.neurological_symptoms_flag, false),
    limpFlag: toBoolean(row.limp_flag, false),
    notes: toNullableString(row.notes),
    payload: row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {},
    pendingSync,
  };
}

async function loadCheckinByDate(checkinDate: string): Promise<DailyCheckin | null> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("daily_checkins")
    .select(`
      id,
      checkin_date,
      pain_score,
      pain_red_flag,
      fatigue_score,
      readiness_score,
      sleep_hours,
      sleep_quality_score,
      soreness_score,
      stress_score,
      mood_score,
      available_time_today_min,
      degraded_mode_days,
      hrv_below_baseline_days,
      rhr_delta_bpm,
      illness_flag,
      neurological_symptoms_flag,
      limp_flag,
      notes,
      payload
    `)
    .eq("checkin_date", checkinDate)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error, "daily_checkins")) {
      return loadFallbackCheckinByDate(checkinDate);
    }
    throw new Error(`Impossible de charger le check-in. (${error.message})`);
  }
  if (!data || typeof data !== "object") return null;
  return mapCheckinRow(data as Record<string, unknown>, false);
}

export async function getDailyCheckinByDate(checkinDate?: string): Promise<DailyCheckin | null> {
  return loadCheckinByDate(normalizeCheckinDate(checkinDate));
}

export async function upsertDailyCheckin(input: UpsertDailyCheckinInput): Promise<DailyCheckin> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const checkinDate = normalizeCheckinDate(input.checkinDate);
  const rowPayload: Record<string, unknown> = {
    id: crypto.randomUUID(),
    checkin_date: checkinDate,
    pain_score: ensureRange("Pain", toNullableNumber(input.painScore), 1, 10),
    pain_red_flag: input.painRedFlag === true,
    fatigue_score: ensureRange("Fatigue", toNullableNumber(input.fatigueScore), 1, 10),
    readiness_score: ensureRange("Readiness", toNullableNumber(input.readinessScore), 1, 10),
    sleep_hours: ensureRange("Sommeil", toNullableNumber(input.sleepHours), 0, 24),
    sleep_quality_score: ensureRange("Qualité sommeil", toNullableNumber(input.sleepQualityScore), 1, 10),
    soreness_score: ensureRange("Courbatures", toNullableNumber(input.sorenessScore), 1, 10),
    stress_score: ensureRange("Stress", toNullableNumber(input.stressScore), 1, 10),
    mood_score: ensureRange("Humeur", toNullableNumber(input.moodScore), 1, 10),
    available_time_today_min: ensureMin(
      "Temps disponible",
      toNullableInteger(input.availableTimeTodayMin),
      0,
    ),
    degraded_mode_days: ensureMin(
      "Mode dégradé (jours)",
      toNullableInteger(input.degradedModeDays),
      0,
    ),
    hrv_below_baseline_days: ensureMin(
      "HRV sous baseline",
      toNullableInteger(input.hrvBelowBaselineDays),
      0,
    ),
    rhr_delta_bpm: toNullableNumber(input.rhrDeltaBpm),
    illness_flag: input.illnessFlag === true,
    neurological_symptoms_flag: input.neurologicalSymptomsFlag === true,
    limp_flag: input.limpFlag === true,
    notes: toNullableString(input.notes),
    payload: input.payload ?? {},
  };

  const { data, error } = await supabase
    .from("daily_checkins")
    .upsert(rowPayload, { onConflict: "user_id,checkin_date" })
    .select(`
      id,
      checkin_date,
      pain_score,
      pain_red_flag,
      fatigue_score,
      readiness_score,
      sleep_hours,
      sleep_quality_score,
      soreness_score,
      stress_score,
      mood_score,
      available_time_today_min,
      degraded_mode_days,
      hrv_below_baseline_days,
      rhr_delta_bpm,
      illness_flag,
      neurological_symptoms_flag,
      limp_flag,
      notes,
      payload
    `)
    .single();

  if (!error && data && typeof data === "object") {
    return mapCheckinRow(data as Record<string, unknown>, false);
  }

  if (isMissingTableError(error, "daily_checkins")) {
    const fallbackMetrics = buildFallbackMetricsFromRowPayload(rowPayload, checkinDate);
    const { data: fallbackData, error: fallbackErr } = await supabase
      .from("internal_metrics")
      .insert({
        captured_at: `${checkinDate}T12:00:00.000Z`,
        metrics: fallbackMetrics,
      })
      .select("id, metrics")
      .single();
    if (!fallbackErr && fallbackData?.metrics && typeof fallbackData.metrics === "object") {
      const mapped = mapFallbackMetricsToRow(
        String(fallbackData.id ?? crypto.randomUUID()),
        fallbackData.metrics as Record<string, unknown>,
        checkinDate,
      );
      return mapCheckinRow(mapped, false);
    }
    throw new Error(`Impossible d'enregistrer le check-in. (${fallbackErr?.message ?? "Table daily_checkins absente."})`);
  }

  const offlineFallback = (typeof navigator !== "undefined" && navigator.onLine === false) || isLikelyNetworkError(error);
  if (!offlineFallback) {
    throw new Error(`Impossible d'enregistrer le check-in. (${error?.message ?? "Unknown error"})`);
  }

  const opId = crypto.randomUUID();
  await enqueueSyncOp({
    opId,
    idempotencyKey: opId,
    opType: "insert",
    entity: "daily_checkins",
    payload: rowPayload,
  });

  try {
    await flushSyncQueue();
  } catch {
    // Offline path: keep local queue and return optimistic value.
  }

  const maybeSynced = await loadCheckinByDate(checkinDate).catch(() => null);
  if (maybeSynced) return maybeSynced;
  return mapCheckinRow(rowPayload, true);
}
