import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAuthClient } from "../_shared/supabase.ts";

type SyncOpIn = {
  opId: string;
  idempotencyKey: string;
  opType: string;
  entity: string;
  payload: Record<string, unknown>;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function badRequest(msg: string) {
  return json(400, { error: msg });
}

function asString(x: unknown): string | null {
  return typeof x === "string" && x.trim().length ? x : null;
}

function asNumber(x: unknown): number | null {
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  return x;
}

function asInteger(x: unknown): number | null {
  const n = asNumber(x);
  if (n === null || !Number.isInteger(n)) return null;
  return n;
}

function asBoolean(x: unknown): boolean | null {
  return typeof x === "boolean" ? x : null;
}

function asRecord(x: unknown): Record<string, unknown> | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  return x as Record<string, unknown>;
}

function asNumberish(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = Number(x.trim().replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asText(x: unknown): string | null {
  return typeof x === "string" && x.trim().length > 0 ? x.trim() : null;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function clamp(x: number, min: number, max: number): number {
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

type EngineConfigSync = {
  version: string;
  policies: {
    conservativeByDefault: boolean;
    maxDegradedDays: number;
    requireHumanValidationForStrongChanges: boolean;
  };
  thresholds: {
    loadGuardLast7dMaxCount: number;
    fatigueHighThreshold: number;
    readinessLowThreshold: number;
    painOrangeThreshold: number;
    painRedThreshold: number;
    fatigueSelfReduceThreshold: number;
    fatigueSelfRestThreshold: number;
    readinessSelfReduceThreshold: number;
    readinessSelfRestThreshold: number;
    sleepHardMinHours: number;
    sleepDebt2dHours: number;
    sleepCriticalHours: number;
    hrvLowDaysThreshold: number;
    rhrHighDeltaBpm: number;
    maxWeeklyLoadVariationPct: number;
    lowerBodyHighStressMaxBeginner: number;
    lowerBodyHighStressMaxIntermediate: number;
    lowerBodyHighStressMaxAdvanced: number;
  };
  optimization: {
    maxVolumeReductionPct: number;
    maxVolumeIncreasePct: number;
    maxIntensityReductionPct: number;
    maxIntensityIncreasePct: number;
    painOrangeVolumeReductionMinPct: number;
    painOrangeVolumeReductionMaxPct: number;
  };
};

type EngineSignalState = {
  painScore: number | null;
  painRedFlag: boolean;
  fatigueSelfScore: number | null;
  readinessSelfScore: number | null;
  sleepHoursLastNight: number | null;
  sleepHours2dAvg: number | null;
  hrvBelowBaselineDays: number | null;
  rhrDeltaBpm: number | null;
  illnessFlag: boolean;
  neurologicalSymptomsFlag: boolean;
  limpFlag: boolean;
  availableTimeTodayMin: number | null;
  degradedModeDays: number | null;
};

type InterferenceState = {
  lastLowerBodyHeavyHoursAgo: number | null;
  lastIntenseRunHoursAgo: number | null;
  lastLongRunHoursAgo: number | null;
  lowerBodyHighStressCount7d: number;
  sameDayForbiddenComboDetected: boolean;
};

function readConfig(raw: unknown): EngineConfigSync {
  const top = asRecord(raw) ?? {};
  const policies = asRecord(top.policies) ?? {};
  const thresholds = asRecord(top.thresholds) ?? {};
  const optimization = asRecord(top.optimization) ?? {};

  const num = (v: unknown, d: number) => {
    const n = asNumberish(v);
    return n === null ? d : n;
  };
  const bool = (v: unknown, d: boolean) => {
    const b = asBoolean(v);
    return b === null ? d : b;
  };

  return {
    version: asText(top.version) ?? "v1.1-default",
    policies: {
      conservativeByDefault: bool(policies.conservativeByDefault, true),
      maxDegradedDays: Math.max(0, Math.floor(num(policies.maxDegradedDays, 7))),
      requireHumanValidationForStrongChanges: bool(
        policies.requireHumanValidationForStrongChanges,
        true,
      ),
    },
    thresholds: {
      loadGuardLast7dMaxCount: Math.max(0, Math.floor(num(thresholds.loadGuardLast7dMaxCount, 6))),
      fatigueHighThreshold: clamp(num(thresholds.fatigueHighThreshold, 0.75), 0, 1),
      readinessLowThreshold: clamp(num(thresholds.readinessLowThreshold, 0.4), 0, 1),
      painOrangeThreshold: clamp(num(thresholds.painOrangeThreshold, 3), 0, 10),
      painRedThreshold: clamp(num(thresholds.painRedThreshold, 6), 0, 10),
      fatigueSelfReduceThreshold: clamp(num(thresholds.fatigueSelfReduceThreshold, 7), 0, 10),
      fatigueSelfRestThreshold: clamp(num(thresholds.fatigueSelfRestThreshold, 9), 0, 10),
      readinessSelfReduceThreshold: clamp(num(thresholds.readinessSelfReduceThreshold, 4), 0, 10),
      readinessSelfRestThreshold: clamp(num(thresholds.readinessSelfRestThreshold, 2), 0, 10),
      sleepHardMinHours: clamp(num(thresholds.sleepHardMinHours, 6), 0, 24),
      sleepDebt2dHours: clamp(num(thresholds.sleepDebt2dHours, 7), 0, 24),
      sleepCriticalHours: clamp(num(thresholds.sleepCriticalHours, 5), 0, 24),
      hrvLowDaysThreshold: Math.max(0, Math.floor(num(thresholds.hrvLowDaysThreshold, 2))),
      rhrHighDeltaBpm: Math.max(0, num(thresholds.rhrHighDeltaBpm, 5)),
      maxWeeklyLoadVariationPct: clamp(num(thresholds.maxWeeklyLoadVariationPct, 0.15), 0, 1),
      lowerBodyHighStressMaxBeginner: Math.max(1, Math.floor(num(thresholds.lowerBodyHighStressMaxBeginner, 2))),
      lowerBodyHighStressMaxIntermediate: Math.max(1, Math.floor(num(thresholds.lowerBodyHighStressMaxIntermediate, 3))),
      lowerBodyHighStressMaxAdvanced: Math.max(1, Math.floor(num(thresholds.lowerBodyHighStressMaxAdvanced, 3))),
    },
    optimization: {
      maxVolumeReductionPct: clamp(num(optimization.maxVolumeReductionPct, 0.3), 0, 1),
      maxVolumeIncreasePct: clamp(num(optimization.maxVolumeIncreasePct, 0.1), 0, 1),
      maxIntensityReductionPct: clamp(num(optimization.maxIntensityReductionPct, 0.15), 0, 1),
      maxIntensityIncreasePct: clamp(num(optimization.maxIntensityIncreasePct, 0.05), 0, 1),
      painOrangeVolumeReductionMinPct: clamp(num(optimization.painOrangeVolumeReductionMinPct, 0.3), 0, 1),
      painOrangeVolumeReductionMaxPct: clamp(num(optimization.painOrangeVolumeReductionMaxPct, 0.5), 0, 1),
    },
  };
}

function inferSessionType(payload: Record<string, unknown>, templateName: string | null): "strength" | "endurance" | "mixed" | "recovery" | "rest" {
  const explicit =
    asText(payload.sessionType) ??
    asText(payload.session_type) ??
    asText(payload.type);
  if (explicit) {
    const t = explicit.toLowerCase();
    if (t.includes("strength") || t.includes("force") || t.includes("hypert")) return "strength";
    if (t.includes("endurance") || t.includes("course") || t.includes("run") || t.includes("trail")) return "endurance";
    if (t.includes("recovery") || t.includes("recup")) return "recovery";
    if (t.includes("rest") || t.includes("repos")) return "rest";
    if (t.includes("mixed") || t.includes("hybrid")) return "mixed";
  }
  const n = (templateName ?? "").toLowerCase();
  const hasStrength = /force|hypert|squat|deadlift|jambes|muscu/.test(n);
  const hasEndurance = /endurance|course|run|trail|fraction|tempo|long/.test(n);
  const hasRecovery = /recovery|recup|repos|easy/.test(n);
  if (hasRecovery) return "recovery";
  if (hasStrength && hasEndurance) return "mixed";
  if (hasStrength) return "strength";
  if (hasEndurance) return "endurance";
  return "mixed";
}

function inferPriority(payload: Record<string, unknown>, templateName: string | null): "low" | "normal" | "high" | "key" {
  const keyFlag = asBoolean(payload.isKeySession) ?? asBoolean(payload.is_key_session);
  if (keyFlag === true) return "key";
  const explicit = asText(payload.priority) ?? asText(payload.session_priority);
  if (explicit) {
    const p = explicit.toLowerCase();
    if (["low", "faible"].includes(p)) return "low";
    if (["high", "haute", "elevated"].includes(p)) return "high";
    if (["key", "cle", "clé", "strategic"].includes(p)) return "key";
  }
  const n = (templateName ?? "").toLowerCase();
  if (/cle|clé|key|competition|race|test/.test(n)) return "key";
  if (/long run|fraction|heavy|lourd/.test(n)) return "high";
  return "normal";
}

function inferLockStatus(payload: Record<string, unknown>): "free" | "adaptable" | "locked" | "locked_unless_safety" {
  const explicit = asText(payload.lockStatus) ?? asText(payload.lock_status);
  if (!explicit) return "adaptable";
  const s = explicit.toLowerCase();
  if (s === "free" || s === "libre") return "free";
  if (s === "adaptable") return "adaptable";
  if (s === "locked" || s === "verrouillee" || s === "verrouillée") return "locked";
  if (s === "locked_unless_safety" || s === "verrouillee_sauf_securite" || s === "verrouillée_sauf_sécurité") {
    return "locked_unless_safety";
  }
  return "adaptable";
}

function reasonText(code: string): string {
  const map: Record<string, string> = {
    NO_PLAN_TODAY: "Aucune séance prévue aujourd'hui.",
    FOLLOW_PLAN: "Le plan actuel reste le meilleur choix.",
    DATA_MISSING: "Des données critiques sont manquantes.",
    DATA_DEGRADED_MODE: "Mode dégradé conservateur actif.",
    PAIN_ORANGE_MODIFY: "Douleur modérée: adaptation de séance appliquée.",
    PAIN_RED_FLAG: "Drapeau rouge douleur/sécurité détecté.",
    FATIGUE_HIGH: "Fatigue élevée: réduction de charge recommandée.",
    READINESS_LOW: "Readiness basse: allègement recommandé.",
    SLEEP_DEBT_48H: "Dette de sommeil sur 48h.",
    SLEEP_CRITICAL: "Sommeil critique avec autres signaux de risque.",
    HRV_RHR_DIVERGENCE: "Dérive HRV/RHR concordante.",
    LOAD_GUARD: "Charge des 7 derniers jours élevée.",
    WEEKLY_LOAD_CAP: "Plafond de charge hebdo appliqué.",
    LOWER_BODY_CONFLICT: "Interférence course/salle détectée.",
    KEY_SESSION_PROTECTED: "Séance clé protégée.",
    LOCKED_SESSION: "Séance verrouillée.",
    FORCED_DELOAD: "Deload forcé déclenché.",
    FORBIDDEN_ACTION_BLOCKED: "Une action interdite a été bloquée.",
    HUMAN_VALIDATION_REQUIRED: "Validation humaine requise.",
    OPTIMIZE_VOLUME_DOWN: "Volume réduit pour préserver la récupération.",
    OPTIMIZE_INTENSITY_DOWN: "Intensité réduite pour limiter le risque.",
  };
  return map[code] ?? code;
}

function isLowerBodyHeavy(payload: Record<string, unknown>, sessionType: string): boolean {
  const explicit = asBoolean(payload.isLowerBodyHeavy) ?? asBoolean(payload.is_lower_body_heavy);
  if (explicit !== null) return explicit;
  const tags = Array.isArray(payload.stressTags)
    ? payload.stressTags
    : Array.isArray(payload.stress_tags)
      ? payload.stress_tags
      : [];
  if (tags.some((x) => typeof x === "string" && /lower|legs|jambes|squat|deadlift|plyo|sprint|hill/.test(x.toLowerCase()))) {
    return true;
  }
  return sessionType === "strength";
}

function isIntenseRun(payload: Record<string, unknown>, sessionType: string): boolean {
  const explicit = asBoolean(payload.isIntenseRun) ?? asBoolean(payload.is_intense_run);
  if (explicit !== null) return explicit;
  if (sessionType !== "endurance") return false;
  const zone = asNumberish(payload.zone) ?? asNumberish(payload.hrZone) ?? asNumberish(payload.hr_zone);
  const rpe = asNumberish(payload.rpe);
  if (zone !== null && zone >= 4) return true;
  return rpe !== null && rpe >= 8;
}

function isLongRun(payload: Record<string, unknown>, sessionType: string): boolean {
  const explicit = asBoolean(payload.isLongRun) ?? asBoolean(payload.is_long_run);
  if (explicit !== null) return explicit;
  if (sessionType !== "endurance") return false;
  const duration = asNumberish(payload.durationMinutes) ?? asNumberish(payload.duration_minutes);
  return duration !== null && duration >= 75;
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function extractDailySignalsFromMetrics(
  latestInternalMetrics: Record<string, unknown> | null,
  latestExternalMetrics: Record<string, unknown> | null,
  latestDailyCheckin: Record<string, unknown> | null,
  fatigueScore: number | null,
  readinessScore: number | null,
): EngineSignalState {
  const checkinPayload =
    latestDailyCheckin && typeof latestDailyCheckin.payload === "object" && latestDailyCheckin.payload
      ? (latestDailyCheckin.payload as Record<string, unknown>)
      : {};
  const merged = {
    ...(latestExternalMetrics ?? {}),
    ...(latestInternalMetrics ?? {}),
    ...checkinPayload,
    ...(latestDailyCheckin ?? {}),
  } as Record<string, unknown>;

  const fatigueSelfScore =
    asNumberish(merged.fatigue_score) ??
    asNumberish(merged.fatigue) ??
    (fatigueScore !== null ? Math.round(clamp01(fatigueScore) * 10) : null);
  const readinessSelfScore =
    asNumberish(merged.readiness_score) ??
    asNumberish(merged.readiness) ??
    (readinessScore !== null ? Math.round(clamp01(readinessScore) * 10) : null);

  return {
    painScore:
      asNumberish(merged.pain_score) ??
      asNumberish(merged.pain) ??
      asNumberish(merged.douleur),
    painRedFlag:
      (asBoolean(merged.pain_red_flag) ??
        asBoolean(merged.painRedFlag)) === true,
    fatigueSelfScore,
    readinessSelfScore,
    sleepHoursLastNight:
      asNumberish(merged.sleep_last_night_h) ??
      asNumberish(merged.sleep_hours_last_night) ??
      asNumberish(merged.sleep_hours) ??
      asNumberish(merged.sleepHoursLastNight),
    sleepHours2dAvg:
      asNumberish(merged.sleep_2d_avg_h) ??
      asNumberish(merged.sleep_2d_avg) ??
      asNumberish(merged.sleepHours2dAvg),
    hrvBelowBaselineDays:
      asNumberish(merged.hrv_below_baseline_days) ??
      asNumberish(merged.hrvBelowBaselineDays),
    rhrDeltaBpm:
      asNumberish(merged.rhr_delta_bpm) ??
      asNumberish(merged.rhrDeltaBpm),
    illnessFlag:
      (asBoolean(merged.illness_flag) ??
        asBoolean(merged.illness)) === true,
    neurologicalSymptomsFlag:
      (asBoolean(merged.neurological_symptoms_flag) ??
        asBoolean(merged.neurologicalSymptomsFlag)) === true,
    limpFlag:
      (asBoolean(merged.limp_flag) ??
        asBoolean(merged.limp)) === true,
    availableTimeTodayMin:
      asNumberish(merged.available_time_today_min) ??
      asNumberish(merged.availableTimeTodayMin),
    degradedModeDays:
      asNumberish(merged.degraded_mode_days) ??
      asNumberish(merged.degradedModeDays),
  };
}

type SyncV1BuildArgs = {
  nowIsoDate: string;
  planId: string;
  planVersionId: string | null;
  plannedSessionId: string;
  sessionTemplateId: string | null;
  templateName: string | null;
  plannedPayload: Record<string, unknown>;
  recentExecutedRows: Array<{ started_at: string; payload: Record<string, unknown> }>;
  latestFatigueScore: number | null;
  latestFatigueQuality: number | null;
  latestReadinessScore: number | null;
  dailySignals: EngineSignalState;
  config: EngineConfigSync;
  algorithmVersion: string;
  athleteLevel: "beginner" | "intermediate" | "advanced";
};

function buildSyncV1Recommendation(args: SyncV1BuildArgs): {
  output: Record<string, unknown>;
  explanation: Record<string, unknown>;
  snapshots: {
    fatigueScore: number;
    fatigueDataQualityScore: number;
    readinessScore: number;
    readinessLimitingFactor: "none" | "fatigue" | "data";
    inputQuality: {
      completenessScore: number;
      missingFields: string[];
      freshnessHours: number | null;
    };
  };
} {
  const sessionType = inferSessionType(args.plannedPayload, args.templateName);
  const priority = inferPriority(args.plannedPayload, args.templateName);
  const lockStatus = inferLockStatus(args.plannedPayload);
  const blockPrimaryGoal =
    asText(args.plannedPayload.blockPrimaryGoal) ??
    asText(args.plannedPayload.block_primary_goal) ??
    asText(args.plannedPayload.primaryGoal) ??
    asText(args.plannedPayload.primary_goal);

  const nowMs = new Date(`${args.nowIsoDate}T12:00:00Z`).getTime();
  const since7Ms = nowMs - 7 * 24 * 60 * 60 * 1000;
  const since14Ms = nowMs - 14 * 24 * 60 * 60 * 1000;

  let last7dCount = 0;
  let lowerBodyHighStressCount7d = 0;
  let lastLowerBodyHeavyHoursAgo: number | null = null;
  let lastIntenseRunHoursAgo: number | null = null;
  let lastLongRunHoursAgo: number | null = null;
  const lowerHeavyByDay = new Set<string>();
  const intenseRunByDay = new Set<string>();
  const recentRpe: number[] = [];

  for (const row of args.recentExecutedRows) {
    const startedMs = new Date(row.started_at).getTime();
    if (!Number.isFinite(startedMs)) continue;
    const payload = row.payload ?? {};

    const rpe = asNumberish(payload.rpe);
    if (rpe !== null && startedMs >= since14Ms) recentRpe.push(clamp(rpe, 1, 10));

    if (startedMs < since7Ms) continue;
    last7dCount += 1;

    const rowType = inferSessionType(payload, asText(payload.templateName));
    const lowerHeavy = isLowerBodyHeavy(payload, rowType);
    const intenseRun = isIntenseRun(payload, rowType);
    const longRun = isLongRun(payload, rowType);
    if (lowerHeavy || intenseRun || longRun) lowerBodyHighStressCount7d += 1;

    const hoursAgo = Math.max(0, (nowMs - startedMs) / 3_600_000);
    if (lowerHeavy && (lastLowerBodyHeavyHoursAgo === null || hoursAgo < lastLowerBodyHeavyHoursAgo)) {
      lastLowerBodyHeavyHoursAgo = hoursAgo;
    }
    if (intenseRun && (lastIntenseRunHoursAgo === null || hoursAgo < lastIntenseRunHoursAgo)) {
      lastIntenseRunHoursAgo = hoursAgo;
    }
    if (longRun && (lastLongRunHoursAgo === null || hoursAgo < lastLongRunHoursAgo)) {
      lastLongRunHoursAgo = hoursAgo;
    }

    const day = row.started_at.slice(0, 10);
    if (lowerHeavy) lowerHeavyByDay.add(day);
    if (intenseRun) intenseRunByDay.add(day);
  }

  const interference: InterferenceState = {
    lastLowerBodyHeavyHoursAgo,
    lastIntenseRunHoursAgo,
    lastLongRunHoursAgo,
    lowerBodyHighStressCount7d,
    sameDayForbiddenComboDetected: [...lowerHeavyByDay].some((d) => intenseRunByDay.has(d)),
  };

  const fatigueScoreFromHistory =
    recentRpe.length > 0
      ? clamp01((recentRpe.reduce((a, b) => a + b, 0) / recentRpe.length) / 10)
      : 0.5;
  const fatigueScore =
    args.latestFatigueScore !== null ? clamp01(args.latestFatigueScore) : fatigueScoreFromHistory;
  const readinessScore =
    args.latestReadinessScore !== null ? clamp01(args.latestReadinessScore) : clamp01(1 - fatigueScore);

  const fatigueSelfScore =
    args.dailySignals.fatigueSelfScore !== null
      ? args.dailySignals.fatigueSelfScore
      : Math.round(fatigueScore * 10);
  const readinessSelfScore =
    args.dailySignals.readinessSelfScore !== null
      ? args.dailySignals.readinessSelfScore
      : Math.round(readinessScore * 10);

  const criticalData = {
    hasBlockGoal: !!blockPrimaryGoal,
    hasSessionType: !!sessionType,
    hasPainState: args.dailySignals.painScore !== null || args.dailySignals.painRedFlag,
    hasRecentLoad: last7dCount > 0,
    hasCalendarAvailability: args.dailySignals.availableTimeTodayMin !== null || true,
  };
  const criticalCompleteness =
    Object.values(criticalData).filter(Boolean).length / Object.keys(criticalData).length;
  const completenessScore = clamp01(0.2 + criticalCompleteness * 0.8);
  const missingFields: string[] = [];
  if (!criticalData.hasBlockGoal) missingFields.push("blockGoal");
  if (!criticalData.hasSessionType) missingFields.push("sessionType");
  if (!criticalData.hasPainState) missingFields.push("painState");
  if (!criticalData.hasRecentLoad) missingFields.push("recentLoad");
  if (!criticalData.hasCalendarAvailability) missingFields.push("calendarAvailability");

  const fallbackMode =
    completenessScore < 0.8 ||
    (args.dailySignals.degradedModeDays !== null && args.dailySignals.degradedModeDays > 0);

  const reasonCodes: string[] = [];
  const rulesTriggered: string[] = [];
  const forbiddenActionBlocked: string[] = [];
  const rulesFired: Array<{ ruleId: string; ruleVersion: string; reasonCodes: string[]; detail?: string }> = [];
  const addRule = (ruleId: string, codes: string[], detail?: string) => {
    rulesTriggered.push(ruleId);
    rulesFired.push({ ruleId, ruleVersion: "1", reasonCodes: codes, detail });
    reasonCodes.push(...codes);
  };

  let decision: "keep" | "reduce" | "replace" | "move" | "delete" | "rest" | "deload" = "keep";
  let decisionState: "maintain" | "reduce" | "replace" | "move" | "delete" | "rest" | "deload" = "maintain";
  let action: "execute_planned" | "rest" | "replace" | "move" | "delete" | "deload" = "execute_planned";
  let riskLevel: "green" | "orange" | "red" = "green";
  let volumeMultiplier = 1;
  let intensityMultiplier = 1;
  let newSessionType: "strength" | "endurance" | "mixed" | "recovery" | "rest" | null = null;
  let newDate: string | null = null;
  let humanValidationRequired = false;

  if (fallbackMode) {
    addRule("degraded_mode", ["DATA_DEGRADED_MODE", "DATA_MISSING"], `completeness=${completenessScore.toFixed(2)}`);
  }

  const painScore = args.dailySignals.painScore ?? 0;
  const painRed =
    args.dailySignals.painRedFlag ||
    painScore >= args.config.thresholds.painRedThreshold ||
    args.dailySignals.illnessFlag ||
    args.dailySignals.neurologicalSymptomsFlag ||
    args.dailySignals.limpFlag;
  const painOrange =
    !painRed &&
    args.dailySignals.painScore !== null &&
    args.dailySignals.painScore >= args.config.thresholds.painOrangeThreshold &&
    args.dailySignals.painScore < args.config.thresholds.painRedThreshold;

  const fatigueHighBySelf = fatigueSelfScore >= args.config.thresholds.fatigueSelfReduceThreshold;
  const fatigueRestBySelf = fatigueSelfScore >= args.config.thresholds.fatigueSelfRestThreshold;
  const fatigueHighByEngine = fatigueScore >= args.config.thresholds.fatigueHighThreshold;

  const readinessLowBySelf = readinessSelfScore <= args.config.thresholds.readinessSelfReduceThreshold;
  const readinessRestBySelf = readinessSelfScore <= args.config.thresholds.readinessSelfRestThreshold;
  const readinessLowByEngine = readinessScore <= args.config.thresholds.readinessLowThreshold;

  const sleepHard =
    args.dailySignals.sleepHoursLastNight !== null &&
    args.dailySignals.sleepHoursLastNight < args.config.thresholds.sleepHardMinHours;
  const sleepDebt =
    args.dailySignals.sleepHours2dAvg !== null &&
    args.dailySignals.sleepHours2dAvg < args.config.thresholds.sleepDebt2dHours;
  const sleepCritical =
    args.dailySignals.sleepHoursLastNight !== null &&
    args.dailySignals.sleepHoursLastNight < args.config.thresholds.sleepCriticalHours &&
    (fatigueHighByEngine || fatigueHighBySelf || readinessLowByEngine || readinessLowBySelf);

  const hrvRhrDivergence =
    (
      (args.dailySignals.hrvBelowBaselineDays ?? 0) >= args.config.thresholds.hrvLowDaysThreshold ||
      (args.dailySignals.rhrDeltaBpm ?? 0) >= args.config.thresholds.rhrHighDeltaBpm
    ) &&
    (fatigueHighByEngine || fatigueHighBySelf || sleepHard || readinessLowByEngine || readinessLowBySelf);

  const loadGuard = last7dCount > args.config.thresholds.loadGuardLast7dMaxCount;
  const weeklyCap = last7dCount > args.config.thresholds.loadGuardLast7dMaxCount + 1;

  const persistentSignalsCount = [
    fatigueHighByEngine || fatigueHighBySelf,
    readinessLowByEngine || readinessLowBySelf,
    sleepDebt,
    hrvRhrDivergence,
    loadGuard,
    painOrange,
  ].filter(Boolean).length;
  const forcedDeload = persistentSignalsCount >= 3;

  if (painRed) {
    decision = "rest";
    decisionState = "rest";
    action = "rest";
    riskLevel = "red";
    volumeMultiplier = 0;
    intensityMultiplier = 0;
    addRule("pain_red_or_medical_red_flag", ["PAIN_RED_FLAG"]);
  } else if (fatigueRestBySelf || readinessRestBySelf || sleepCritical) {
    decision = "rest";
    decisionState = "rest";
    action = "rest";
    riskLevel = "red";
    volumeMultiplier = 0;
    intensityMultiplier = 0;
    addRule("critical_recovery_gate", ["SLEEP_CRITICAL"]);
  } else if (forcedDeload) {
    decision = "deload";
    decisionState = "deload";
    action = "deload";
    riskLevel = "orange";
    volumeMultiplier = Math.min(volumeMultiplier, 1 - args.config.optimization.maxVolumeReductionPct);
    intensityMultiplier = Math.min(intensityMultiplier, 1 - args.config.optimization.maxIntensityReductionPct);
    addRule("forced_deload", ["FORCED_DELOAD"], `signals=${persistentSignalsCount}`);
  }

  if (painOrange && decision !== "rest") {
    decision = decision === "deload" ? "deload" : "reduce";
    decisionState = decision === "deload" ? "deload" : "reduce";
    action = "execute_planned";
    riskLevel = riskLevel === "red" ? "red" : "orange";
    volumeMultiplier = Math.min(volumeMultiplier, 1 - args.config.optimization.painOrangeVolumeReductionMaxPct);
    intensityMultiplier = Math.min(intensityMultiplier, 1 - args.config.optimization.maxIntensityReductionPct);
    addRule("pain_orange_modify", ["PAIN_ORANGE_MODIFY"], `pain=${painScore.toFixed(1)}`);
  }

  if ((fatigueHighByEngine || fatigueHighBySelf) && decision !== "rest") {
    decision = decision === "deload" ? "deload" : "reduce";
    decisionState = decision === "deload" ? "deload" : "reduce";
    action = "execute_planned";
    riskLevel = riskLevel === "red" ? "red" : "orange";
    volumeMultiplier = Math.min(volumeMultiplier, 1 - args.config.optimization.maxVolumeReductionPct);
    intensityMultiplier = Math.min(intensityMultiplier, 1 - args.config.optimization.maxIntensityReductionPct);
    addRule("fatigue_gate", ["FATIGUE_HIGH"], `fatigue=${fatigueScore.toFixed(2)}`);
  }

  if ((readinessLowByEngine || readinessLowBySelf) && decision !== "rest") {
    decision = decision === "deload" ? "deload" : "reduce";
    decisionState = decision === "deload" ? "deload" : "reduce";
    action = "execute_planned";
    riskLevel = riskLevel === "red" ? "red" : "orange";
    volumeMultiplier = Math.min(volumeMultiplier, 1 - args.config.optimization.maxVolumeReductionPct);
    intensityMultiplier = Math.min(intensityMultiplier, 1 - args.config.optimization.maxIntensityReductionPct);
    addRule("readiness_gate", ["READINESS_LOW"], `readiness=${readinessScore.toFixed(2)}`);
  }

  if ((sleepHard || sleepDebt) && decision !== "rest") {
    decision = decision === "deload" ? "deload" : "reduce";
    decisionState = decision === "deload" ? "deload" : "reduce";
    action = "execute_planned";
    riskLevel = riskLevel === "red" ? "red" : "orange";
    intensityMultiplier = Math.min(intensityMultiplier, 0.9);
    if (sleepDebt) addRule("sleep_debt_48h", ["SLEEP_DEBT_48H"]);
  }

  if (hrvRhrDivergence && decision !== "rest") {
    decision = decision === "deload" ? "deload" : "reduce";
    decisionState = decision === "deload" ? "deload" : "reduce";
    action = "execute_planned";
    riskLevel = riskLevel === "red" ? "red" : "orange";
    intensityMultiplier = Math.min(intensityMultiplier, 0.9);
    addRule("hrv_rhr_divergence", ["HRV_RHR_DIVERGENCE"]);
  }

  if (loadGuard && decision !== "rest") {
    decision = decision === "deload" ? "deload" : "reduce";
    decisionState = decision === "deload" ? "deload" : "reduce";
    action = "execute_planned";
    volumeMultiplier = Math.min(volumeMultiplier, 1 - args.config.optimization.maxVolumeReductionPct);
    addRule("load_guard", ["LOAD_GUARD"], `last7d=${last7dCount}`);
  }

  if (weeklyCap && decision !== "rest") {
    decision = decision === "deload" ? "deload" : "reduce";
    decisionState = decision === "deload" ? "deload" : "reduce";
    action = "execute_planned";
    volumeMultiplier = Math.min(volumeMultiplier, 1 - args.config.thresholds.maxWeeklyLoadVariationPct);
    addRule("weekly_load_cap", ["WEEKLY_LOAD_CAP"], `maxVar=${args.config.thresholds.maxWeeklyLoadVariationPct}`);
  }

  const lowerBodyCap =
    args.athleteLevel === "beginner"
      ? args.config.thresholds.lowerBodyHighStressMaxBeginner
      : args.athleteLevel === "advanced"
        ? args.config.thresholds.lowerBodyHighStressMaxAdvanced
        : args.config.thresholds.lowerBodyHighStressMaxIntermediate;

  const interferenceDetected =
    interference.sameDayForbiddenComboDetected ||
    (interference.lastLowerBodyHeavyHoursAgo !== null && interference.lastLowerBodyHeavyHoursAgo < 24) ||
    (interference.lastIntenseRunHoursAgo !== null && interference.lastIntenseRunHoursAgo < 24) ||
    (interference.lastLongRunHoursAgo !== null && interference.lastLongRunHoursAgo < 24) ||
    interference.lowerBodyHighStressCount7d > lowerBodyCap;

  if (interferenceDetected && decision !== "rest") {
    if (priority === "key") {
      decision = decision === "deload" ? "deload" : decision === "reduce" ? "reduce" : "keep";
      decisionState = decision === "keep" ? "maintain" : decision;
      action = decision === "keep" ? "execute_planned" : action;
      riskLevel = riskLevel === "red" ? "red" : "orange";
      volumeMultiplier = Math.min(volumeMultiplier, 0.9);
      addRule("lower_body_interference", ["LOWER_BODY_CONFLICT", "KEY_SESSION_PROTECTED"]);
    } else if (interference.sameDayForbiddenComboDetected) {
      decision = "move";
      decisionState = "move";
      action = "move";
      riskLevel = "orange";
      newDate = addDaysIso(args.nowIsoDate, 1);
      humanValidationRequired = true;
      addRule("lower_body_interference_move", ["LOWER_BODY_CONFLICT"]);
    } else {
      decision = "replace";
      decisionState = "replace";
      action = "replace";
      riskLevel = "orange";
      newSessionType = sessionType === "strength" ? "recovery" : "mixed";
      humanValidationRequired = true;
      addRule("lower_body_interference_replace", ["LOWER_BODY_CONFLICT"]);
    }
  }

  const safetyEmergency = painRed || sleepCritical || fatigueRestBySelf || readinessRestBySelf;
  if ((lockStatus === "locked" || lockStatus === "locked_unless_safety") && !safetyEmergency) {
    if (!["keep", "reduce"].includes(decision)) {
      forbiddenActionBlocked.push("LOCKED_SESSION_CHANGE_BLOCKED");
      decision = "keep";
      decisionState = "maintain";
      action = "execute_planned";
      newDate = null;
      newSessionType = null;
      addRule("forbidden_locked_session_change", ["LOCKED_SESSION", "FORBIDDEN_ACTION_BLOCKED"]);
    }
  }

  if (args.config.policies.requireHumanValidationForStrongChanges) {
    if (["replace", "move", "delete", "rest", "deload"].includes(decision)) {
      humanValidationRequired = true;
      addRule("human_validation_required", ["HUMAN_VALIDATION_REQUIRED"], `decision=${decision}`);
    }
  }

  volumeMultiplier = clamp(
    volumeMultiplier,
    1 - args.config.optimization.maxVolumeReductionPct,
    1 + args.config.optimization.maxVolumeIncreasePct,
  );
  intensityMultiplier = clamp(
    intensityMultiplier,
    1 - args.config.optimization.maxIntensityReductionPct,
    1 + args.config.optimization.maxIntensityIncreasePct,
  );

  if (decision !== "rest" && reasonCodes.length === 0) {
    addRule("follow_plan", ["FOLLOW_PLAN"]);
  }
  if (volumeMultiplier < 1) reasonCodes.push("OPTIMIZE_VOLUME_DOWN");
  if (intensityMultiplier < 1) reasonCodes.push("OPTIMIZE_INTENSITY_DOWN");
  if (fallbackMode) reasonCodes.push("DATA_DEGRADED_MODE");
  const reasonCodesFinal = dedupe(reasonCodes);

  const confidenceBase = clamp01(completenessScore) * 100;
  const consistency = hrvRhrDivergence ? 58 : 76;
  const stability = last7dCount >= 4 ? 78 : last7dCount >= 2 ? 66 : 52;
  const freshnessPenalty =
    args.dailySignals.degradedModeDays !== null && args.dailySignals.degradedModeDays > 3
      ? Math.min(20, (args.dailySignals.degradedModeDays - 3) * 2)
      : 0;
  let confidence = Math.round(
    confidenceBase * 0.55 + consistency * 0.25 + stability * 0.2 - freshnessPenalty,
  );
  if (fallbackMode) confidence -= 20;
  if (forbiddenActionBlocked.length > 0) confidence -= 10;
  confidence = Math.round(clamp(confidence, 0, 100));

  const headlineMap: Record<string, string> = {
    keep: "Follow your planned session",
    reduce: "Do your session with targeted reductions",
    replace: "Session replaced to reduce interference risk",
    move: "Session moved to protect recovery",
    delete: "Session removed",
    rest: "Rest day recommended",
    deload: "Deload recommended",
  };

  const top3 = reasonCodesFinal.slice(0, 3).map((code) => ({
    code,
    text: reasonText(code),
  }));
  while (top3.length < 3) {
    top3.push({
      code: "DATA_FRESH",
      text: "Recommendation computed deterministically from current signals.",
    });
  }

  const output = {
    scope: "today",
    decision,
    decisionState,
    patch: {
      action,
      planned_session_id: args.plannedSessionId,
      session_template_id: args.sessionTemplateId,
      volume_multiplier: volumeMultiplier,
      intensity_multiplier: intensityMultiplier,
      duration_min: null,
      new_session_type: newSessionType,
      new_date: newDate,
      exercise_swaps: [],
    },
    confidence_score: confidence,
    risk_level: riskLevel,
    reasons: reasonCodesFinal,
    rules_triggered: dedupe(rulesTriggered),
    session_adjustments: {
      volume_pct: Math.round((volumeMultiplier - 1) * 10000) / 100,
      intensity_pct: Math.round((intensityMultiplier - 1) * 10000) / 100,
      duration_min: null,
      exercise_swaps: [],
      new_session_type: newSessionType,
      new_date: newDate,
    },
    human_validation_required: humanValidationRequired,
    forbidden_action_blocked: forbiddenActionBlocked,
    fallback_mode: fallbackMode,
    reasonCodes: reasonCodesFinal,
    algorithmVersion: args.algorithmVersion,
    configVersion: args.config.version,
  };

  const explanation = {
    summary: {
      headline: headlineMap[decision] ?? "Recommendation computed",
      reasonsTop3: top3,
    },
    decisionState,
    decision,
    riskLevel,
    confidenceScore: confidence,
    reasonCodes: reasonCodesFinal,
    signals: [
      {
        signalId: "executed_last7d_count",
        rawValue: last7dCount,
        normalizedValue: clamp01(last7dCount / 7),
        weight: 0.25,
        direction: last7dCount > args.config.thresholds.loadGuardLast7dMaxCount ? "down" : "neutral",
        reasonCode: last7dCount > args.config.thresholds.loadGuardLast7dMaxCount ? "LOAD_GUARD" : undefined,
      },
      {
        signalId: "fatigue_score",
        rawValue: fatigueScore,
        normalizedValue: clamp01(fatigueScore),
        weight: 0.25,
        direction: fatigueScore >= args.config.thresholds.fatigueHighThreshold ? "down" : "neutral",
        reasonCode: fatigueScore >= args.config.thresholds.fatigueHighThreshold ? "FATIGUE_HIGH" : undefined,
      },
      {
        signalId: "readiness_score",
        rawValue: readinessScore,
        normalizedValue: clamp01(readinessScore),
        weight: 0.2,
        direction: readinessScore <= args.config.thresholds.readinessLowThreshold ? "down" : "neutral",
        reasonCode: readinessScore <= args.config.thresholds.readinessLowThreshold ? "READINESS_LOW" : undefined,
      },
      {
        signalId: "pain_score",
        rawValue: args.dailySignals.painScore ?? -1,
        normalizedValue: args.dailySignals.painScore !== null ? clamp01(args.dailySignals.painScore / 10) : 0,
        weight: 0.15,
        direction:
          args.dailySignals.painScore !== null &&
          args.dailySignals.painScore >= args.config.thresholds.painOrangeThreshold
            ? "down"
            : "neutral",
        reasonCode:
          args.dailySignals.painScore !== null &&
          args.dailySignals.painScore >= args.config.thresholds.painOrangeThreshold
            ? "PAIN_ORANGE_MODIFY"
            : undefined,
      },
      {
        signalId: "sleep_last_night_h",
        rawValue: args.dailySignals.sleepHoursLastNight ?? -1,
        normalizedValue: args.dailySignals.sleepHoursLastNight !== null ? clamp01(args.dailySignals.sleepHoursLastNight / 8) : 0,
        weight: 0.15,
        direction:
          args.dailySignals.sleepHoursLastNight !== null &&
          args.dailySignals.sleepHoursLastNight < args.config.thresholds.sleepHardMinHours
            ? "down"
            : "neutral",
        reasonCode:
          args.dailySignals.sleepHoursLastNight !== null &&
          args.dailySignals.sleepHoursLastNight < args.config.thresholds.sleepHardMinHours
            ? "SLEEP_DEBT_48H"
            : undefined,
      },
    ],
    rulesFired,
    dataQuality: {
      completenessScore,
      missingFields,
      freshnessHours:
        args.dailySignals.degradedModeDays !== null
          ? Math.max(0, args.dailySignals.degradedModeDays * 24)
          : null,
    },
    fallbackMode,
    forbiddenActionBlocked: forbiddenActionBlocked,
    humanValidationRequired,
    algorithmVersion: args.algorithmVersion,
    configVersion: args.config.version,
  };

  const readinessLimitingFactor: "none" | "fatigue" | "data" =
    completenessScore < 0.4
      ? "data"
      : fatigueScore >= args.config.thresholds.fatigueHighThreshold
        ? "fatigue"
        : "none";

  return {
    output,
    explanation,
    snapshots: {
      fatigueScore,
      fatigueDataQualityScore:
        args.latestFatigueQuality !== null
          ? clamp01(args.latestFatigueQuality)
          : clamp01(completenessScore),
      readinessScore,
      readinessLimitingFactor,
      inputQuality: {
        completenessScore,
        missingFields,
        freshnessHours:
          args.dailySignals.degradedModeDays !== null
            ? Math.max(0, args.dailySignals.degradedModeDays * 24)
            : null,
      },
    },
  };
}

async function insertIdempotency(authClient: ReturnType<typeof createSupabaseAuthClient>, op: SyncOpIn) {
  const { error } = await authClient.from("sync_ops").insert({
    device_id: null,
    idempotency_key: op.idempotencyKey,
    op_type: op.opType,
    entity: op.entity,
    payload: op.payload,
    applied_at: null,
    result: null,
  });

  if (error && (error as { code?: string }).code === "23505") return { ok: true as const, duplicate: true as const };
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, duplicate: false as const };
}

async function markApplied(authClient: ReturnType<typeof createSupabaseAuthClient>, idempotencyKey: string) {
  await authClient
    .from("sync_ops")
    .update({ applied_at: new Date().toISOString() })
    .eq("idempotency_key", idempotencyKey);
}

async function markAppliedWithResult(
  authClient: ReturnType<typeof createSupabaseAuthClient>,
  idempotencyKey: string,
  result: Record<string, unknown>,
) {
  await authClient
    .from("sync_ops")
    .update({ applied_at: new Date().toISOString(), result })
    .eq("idempotency_key", idempotencyKey);
}

async function getExistingResult(
  authClient: ReturnType<typeof createSupabaseAuthClient>,
  idempotencyKey: string,
): Promise<{ appliedAt: string | null; result: Record<string, unknown> | null } | null> {
  const { data } = await authClient
    .from("sync_ops")
    .select("applied_at, result")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (!data) return null;
  const appliedAt = data.applied_at ? String(data.applied_at) : null;
  const result = data.result && typeof data.result === "object" ? (data.result as Record<string, unknown>) : null;
  return { appliedAt, result };
}
 
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return badRequest("Method not allowed.");

  const authClient = createSupabaseAuthClient(req);
  const { data: userRes, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userRes?.user?.id) {
    return json(401, { error: "Unauthorized." });
  }
  const userId = userRes.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  if (!body || typeof body !== "object" || !("ops" in body)) return badRequest("Missing ops.");
  const opsRaw = (body as { ops: unknown }).ops;
  if (!Array.isArray(opsRaw)) return badRequest("ops must be an array.");
  if (opsRaw.length > 25) return badRequest("Too many ops (max 25).");

  const ops: SyncOpIn[] = [];
  for (const o of opsRaw) {
    if (!o || typeof o !== "object") continue;
    const opId = asString((o as { opId?: unknown }).opId);
    const idempotencyKey = asString((o as { idempotencyKey?: unknown }).idempotencyKey);
    const opType = asString((o as { opType?: unknown }).opType);
    const entity = asString((o as { entity?: unknown }).entity);
    const payload = (o as { payload?: unknown }).payload;
    if (!opId || !idempotencyKey || !opType || !entity) continue;
    if (!payload || typeof payload !== "object") continue;
    ops.push({ opId, idempotencyKey, opType, entity, payload: payload as Record<string, unknown> });
  }

  const results: Array<{ opId: string; status: "applied" | "rejected" | "error"; error?: string }> = [];

  for (const op of ops) {
    try {
      if (op.opType !== "insert") {
        results.push({ opId: op.opId, status: "rejected", error: "Unsupported opType." });
        continue;
      }

      const idem = await insertIdempotency(authClient, op);
      if (!idem.ok) {
        results.push({ opId: op.opId, status: "error", error: idem.error });
        continue;
      }
      if (idem.duplicate) {
        const existing = await getExistingResult(authClient, op.idempotencyKey);
        // If we have a stored result, we can safely return applied.
        if (existing?.appliedAt) {
          results.push({ opId: op.opId, status: "applied" });
          continue;
        }
        // Otherwise retry applying (previous attempt may have crashed mid-flight).
        // We do NOT treat this as applied until we can store applied_at.
      }

      if (op.entity === "executed_sessions") {
        const id = asString(op.payload.id);
        const startedAt = asString(op.payload.started_at);
        const endedAt = asString(op.payload.ended_at);
        if (!id || !startedAt || !endedAt) {
          results.push({ opId: op.opId, status: "rejected", error: "Missing id/started_at/ended_at." });
          continue;
        }

        const { data: inserted, error: insErr } = await authClient
          .from("executed_sessions")
          .upsert({
            id,
            plan_id: op.payload.plan_id ?? null,
            planned_session_id: op.payload.planned_session_id ?? null,
            recommendation_id: null,
            started_at: startedAt,
            ended_at: endedAt,
            payload: op.payload.payload ?? {},
          })
          .select("id, planned_session_id, plan_id")
          .single();

        if (insErr || !inserted?.id) {
          results.push({ opId: op.opId, status: "error", error: insErr?.message ?? "Insert failed." });
          continue;
        }

        // Server-side recalc (V1): compute recommendation payload with safety/interference gates.
        if (inserted.planned_session_id) {
          const plannedId = String(inserted.planned_session_id);
          const { data: ps } = await authClient
            .from("planned_sessions")
            .select(`
              id,
              plan_id,
              plan_version_id,
              session_template_id,
              scheduled_for,
              payload,
              session_templates:session_template_id ( name )
            `)
            .eq("id", plannedId)
            .maybeSingle();

          if (ps?.plan_id) {
            const planId = String(ps.plan_id);
            const planVersionId = ps.plan_version_id ? String(ps.plan_version_id) : null;
            const plannedPayload = asRecord(ps.payload) ?? {};
            const templateName =
              ps.session_templates && typeof ps.session_templates === "object" && "name" in ps.session_templates
                ? asText((ps.session_templates as { name?: unknown }).name)
                : null;

            let configProfileId: string | null = null;
            let algorithmVersionId: string | null = null;
            let algorithmVersion = "v1.1.0";
            let configRaw: unknown = { version: "v1.1-default" };

            if (planVersionId) {
              const { data: pv } = await authClient
                .from("plan_versions")
                .select("config_profile_id, algorithm_version_id")
                .eq("id", planVersionId)
                .maybeSingle();
              if (pv?.config_profile_id) configProfileId = String(pv.config_profile_id);
              if (pv?.algorithm_version_id) algorithmVersionId = String(pv.algorithm_version_id);
            }

            if (configProfileId) {
              const { data: cfg } = await authClient
                .from("config_profiles")
                .select("config")
                .eq("id", configProfileId)
                .maybeSingle();
              if (cfg?.config) configRaw = cfg.config;
            }
            if (algorithmVersionId) {
              const { data: av } = await authClient
                .from("algorithm_versions")
                .select("version")
                .eq("id", algorithmVersionId)
                .maybeSingle();
              if (av?.version) algorithmVersion = String(av.version);
            }

            const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
            const [
              recentExecRes,
              latestFatigueRes,
              latestReadinessRes,
              latestInternalRes,
              latestExternalRes,
              latestDailyCheckinRes,
            ] = await Promise.all([
              authClient
                .from("executed_sessions")
                .select("started_at, payload")
                .eq("user_id", userId)
                .gte("started_at", since14)
                .order("started_at", { ascending: false })
                .limit(80),
              authClient
                .from("fatigue_snapshots")
                .select("score, data_quality_score")
                .eq("user_id", userId)
                .not("score", "is", null)
                .order("captured_at", { ascending: false })
                .limit(1)
                .maybeSingle(),
              authClient
                .from("readiness_snapshots")
                .select("score")
                .eq("user_id", userId)
                .not("score", "is", null)
                .order("captured_at", { ascending: false })
                .limit(1)
                .maybeSingle(),
              authClient
                .from("internal_metrics")
                .select("metrics")
                .eq("user_id", userId)
                .order("captured_at", { ascending: false })
                .limit(1)
                .maybeSingle(),
              authClient
                .from("external_metrics")
                .select("metrics")
                .eq("user_id", userId)
                .order("captured_at", { ascending: false })
                .limit(1)
                .maybeSingle(),
              authClient
                .from("daily_checkins")
                .select(`
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
                .eq("user_id", userId)
                .order("checkin_date", { ascending: false })
                .limit(1)
                .maybeSingle(),
            ]);

            const recentExecutedRows =
              Array.isArray(recentExecRes.data)
                ? recentExecRes.data.map((row) => ({
                    started_at: String(row.started_at),
                    payload: asRecord(row.payload) ?? {},
                  }))
                : [];

            const latestFatigueScore = latestFatigueRes.data?.score !== null && latestFatigueRes.data?.score !== undefined
              ? asNumberish(latestFatigueRes.data.score)
              : null;
            const latestFatigueQuality = latestFatigueRes.data?.data_quality_score !== null && latestFatigueRes.data?.data_quality_score !== undefined
              ? asNumberish(latestFatigueRes.data.data_quality_score)
              : null;
            const latestReadinessScore = latestReadinessRes.data?.score !== null && latestReadinessRes.data?.score !== undefined
              ? asNumberish(latestReadinessRes.data.score)
              : null;

            const latestInternalMetrics = latestInternalRes.data?.metrics && typeof latestInternalRes.data.metrics === "object"
              ? (latestInternalRes.data.metrics as Record<string, unknown>)
              : null;
            const latestExternalMetrics = latestExternalRes.data?.metrics && typeof latestExternalRes.data.metrics === "object"
              ? (latestExternalRes.data.metrics as Record<string, unknown>)
              : null;
            const latestDailyCheckin =
              latestDailyCheckinRes.data && typeof latestDailyCheckinRes.data === "object"
                ? (latestDailyCheckinRes.data as Record<string, unknown>)
                : null;

            const dailySignals = extractDailySignalsFromMetrics(
              latestInternalMetrics,
              latestExternalMetrics,
              latestDailyCheckin,
              latestFatigueScore,
              latestReadinessScore,
            );

            const athleteLevelRaw =
              asText(plannedPayload.athleteLevel) ??
              asText(plannedPayload.athlete_level) ??
              "intermediate";
            const athleteLevel =
              athleteLevelRaw.toLowerCase() === "beginner"
                ? "beginner"
                : athleteLevelRaw.toLowerCase() === "advanced"
                  ? "advanced"
                  : "intermediate";

            const runtimeConfig = readConfig(configRaw);
            const nowIsoDate = new Date().toISOString().slice(0, 10);
            const { output, explanation, snapshots } = buildSyncV1Recommendation({
              nowIsoDate,
              planId,
              planVersionId,
              plannedSessionId: plannedId,
              sessionTemplateId: ps.session_template_id ? String(ps.session_template_id) : null,
              templateName,
              plannedPayload,
              recentExecutedRows,
              latestFatigueScore,
              latestFatigueQuality,
              latestReadinessScore,
              dailySignals,
              config: runtimeConfig,
              algorithmVersion,
              athleteLevel,
            });

            const { data: recoRow } = await authClient
              .from("recommendations")
              .insert({
                plan_id: planId,
                session_id: null,
                algorithm_version_id: algorithmVersionId,
                config_profile_id: configProfileId,
                input: {
                  today_iso: nowIsoDate,
                  planned_session_id: plannedId,
                  plan_id: planId,
                  plan_version_id: planVersionId,
                  session_template_id: ps.session_template_id ? String(ps.session_template_id) : null,
                  executed_session_id: String(inserted.id),
                  data_quality_score: snapshots.inputQuality.completenessScore,
                  fallback_mode: output.fallback_mode ?? false,
                  daily_signals: dailySignals,
                },
                output,
              })
              .select("id")
              .single();

            if (recoRow?.id) {
              const recommendationId = String(recoRow.id);
              await authClient.from("recommendation_explanations").insert({
                recommendation_id: recommendationId,
                content: explanation,
              });

              await authClient.from("engine_decisions").upsert(
                {
                  recommendation_id: recommendationId,
                  user_id: userId,
                  plan_id: planId,
                  plan_version_id: planVersionId,
                  planned_session_id: plannedId,
                  executed_session_id: String(inserted.id),
                  decision: asText(output.decision) ?? "keep",
                  decision_state: asText(output.decisionState),
                  confidence_score: asNumberish(output.confidence_score),
                  risk_level: asText(output.risk_level),
                  reason_codes: Array.isArray(output.reasonCodes) ? output.reasonCodes : [],
                  rules_triggered: Array.isArray(output.rules_triggered) ? output.rules_triggered : [],
                  human_validation_required: (asBoolean(output.human_validation_required) ?? false) === true,
                  fallback_mode: (asBoolean(output.fallback_mode) ?? false) === true,
                  forbidden_action_blocked: Array.isArray(output.forbidden_action_blocked)
                    ? output.forbidden_action_blocked
                    : [],
                  algorithm_version: asText(output.algorithmVersion),
                  config_version: asText(output.configVersion),
                  payload: {
                    patch: asRecord(output.patch) ?? {},
                    session_adjustments: asRecord(output.session_adjustments) ?? {},
                    reasons: Array.isArray(output.reasons) ? output.reasons : [],
                  },
                },
                { onConflict: "user_id,recommendation_id" },
              );

              await authClient
                .from("executed_sessions")
                .update({ recommendation_id: recommendationId })
                .eq("id", String(inserted.id));

              // Best-effort traceability snapshots for analytics/debug.
              const capturedAt = new Date().toISOString();
              const { data: contextRow } = await authClient
                .from("context_snapshots")
                .insert({
                  plan_id: planId,
                  plan_version_id: planVersionId,
                  executed_session_id: String(inserted.id),
                  recommendation_id: recommendationId,
                  captured_at: capturedAt,
                  input_quality: snapshots.inputQuality,
                  payload: {
                    source: "sync_v1",
                    daily_signals: dailySignals,
                    session_type: output.patch?.new_session_type ?? null,
                    decision: output.decision ?? null,
                    fallback_mode: output.fallback_mode ?? false,
                  },
                })
                .select("id")
                .maybeSingle();

              const contextSnapshotId =
                contextRow?.id ? String(contextRow.id) : null;

              await authClient.from("fatigue_snapshots").insert({
                context_snapshot_id: contextSnapshotId,
                captured_at: capturedAt,
                score: snapshots.fatigueScore,
                dimensions: { general: snapshots.fatigueScore },
                data_quality_score: snapshots.fatigueDataQualityScore,
                algorithm_version: algorithmVersion,
                payload: {
                  source: "sync_v1",
                  recommendation_id: recommendationId,
                },
              });

              await authClient.from("readiness_snapshots").insert({
                context_snapshot_id: contextSnapshotId,
                captured_at: capturedAt,
                score: snapshots.readinessScore,
                limiting_factor: snapshots.readinessLimitingFactor,
                algorithm_version: algorithmVersion,
                payload: {
                  source: "sync_v1",
                  recommendation_id: recommendationId,
                },
              });
            }
          }
        }

        await markAppliedWithResult(authClient, op.idempotencyKey, { executed_session_id: String(inserted.id) });
        results.push({ opId: op.opId, status: "applied" });
        continue;
      }

      if (op.entity === "executed_session_exercises") {
        const id = asString(op.payload.id);
        const executedSessionId = asString(op.payload.executed_session_id);
        const exerciseName = asString(op.payload.exercise_name_snapshot);
        const position = asInteger(op.payload.position);
        if (!id || !executedSessionId || !exerciseName || position === null || position < 1) {
          results.push({
            opId: op.opId,
            status: "rejected",
            error: "Missing id/executed_session_id/exercise_name_snapshot/position.",
          });
          continue;
        }

        const { data, error } = await authClient
          .from("executed_session_exercises")
          .upsert({
            id,
            executed_session_id: executedSessionId,
            session_template_exercise_id: asString(op.payload.session_template_exercise_id),
            position,
            exercise_name_snapshot: exerciseName,
            notes: asString(op.payload.notes),
            payload:
              typeof op.payload.payload === "object" && op.payload.payload
                ? op.payload.payload
                : {},
          })
          .select("id")
          .single();

        if (error || !data?.id) {
          results.push({ opId: op.opId, status: "error", error: error?.message ?? "Insert failed." });
          continue;
        }

        await markAppliedWithResult(authClient, op.idempotencyKey, {
          executed_session_exercise_id: String(data.id),
        });
        results.push({ opId: op.opId, status: "applied" });
        continue;
      }

      if (op.entity === "executed_session_sets") {
        const id = asString(op.payload.id);
        const executedSessionExerciseId = asString(op.payload.executed_session_exercise_id);
        const setIndex = asInteger(op.payload.set_index);
        if (!id || !executedSessionExerciseId || setIndex === null || setIndex < 1) {
          results.push({
            opId: op.opId,
            status: "rejected",
            error: "Missing id/executed_session_exercise_id/set_index.",
          });
          continue;
        }

        const { data, error } = await authClient
          .from("executed_session_sets")
          .upsert({
            id,
            executed_session_exercise_id: executedSessionExerciseId,
            set_index: setIndex,
            reps: asInteger(op.payload.reps),
            load_kg: asNumber(op.payload.load_kg),
            rpe: asNumber(op.payload.rpe),
            rir: asNumber(op.payload.rir),
            rest_seconds: asInteger(op.payload.rest_seconds),
            completed: asBoolean(op.payload.completed) ?? true,
            payload:
              typeof op.payload.payload === "object" && op.payload.payload
                ? op.payload.payload
                : {},
          })
          .select("id")
          .single();

        if (error || !data?.id) {
          results.push({ opId: op.opId, status: "error", error: error?.message ?? "Insert failed." });
          continue;
        }

        await markAppliedWithResult(authClient, op.idempotencyKey, {
          executed_session_set_id: String(data.id),
        });
        results.push({ opId: op.opId, status: "applied" });
        continue;
      }

      if (op.entity === "executed_session_metrics") {
        const executedSessionId = asString(op.payload.executed_session_id);
        if (!executedSessionId) {
          results.push({
            opId: op.opId,
            status: "rejected",
            error: "Missing executed_session_id.",
          });
          continue;
        }

        const { error } = await authClient
          .from("executed_session_metrics")
          .upsert({
            executed_session_id: executedSessionId,
            total_exercises: asInteger(op.payload.total_exercises) ?? 0,
            total_sets: asInteger(op.payload.total_sets) ?? 0,
            total_reps: asInteger(op.payload.total_reps) ?? 0,
            tonnage_kg: asNumber(op.payload.tonnage_kg) ?? 0,
            avg_rpe: asNumber(op.payload.avg_rpe),
            volume_score: asNumber(op.payload.volume_score),
            intensity_score: asNumber(op.payload.intensity_score),
            strain_score: asNumber(op.payload.strain_score),
            computed_at: asString(op.payload.computed_at) ?? new Date().toISOString(),
            payload:
              typeof op.payload.payload === "object" && op.payload.payload
                ? op.payload.payload
                : {},
          });

        if (error) {
          results.push({ opId: op.opId, status: "error", error: error.message });
          continue;
        }

        await markAppliedWithResult(authClient, op.idempotencyKey, {
          executed_session_id: executedSessionId,
        });
        results.push({ opId: op.opId, status: "applied" });
        continue;
      }

      if (op.entity === "session_feedback") {
        const executedSessionId = asString(op.payload.executed_session_id);
        if (!executedSessionId) {
          results.push({ opId: op.opId, status: "rejected", error: "Missing executed_session_id." });
          continue;
        }
        const { error } = await authClient.from("session_feedback").insert({
          executed_session_id: executedSessionId,
          rating: typeof op.payload.rating === "number" ? op.payload.rating : null,
          soreness: typeof op.payload.soreness === "number" ? op.payload.soreness : null,
          notes: typeof op.payload.notes === "string" ? op.payload.notes : null,
          payload: typeof op.payload.payload === "object" && op.payload.payload ? op.payload.payload : {},
        });
        if (error) {
          results.push({ opId: op.opId, status: "error", error: error.message });
          continue;
        }
        await markApplied(authClient, op.idempotencyKey);
        results.push({ opId: op.opId, status: "applied" });
        continue;
      }

      if (op.entity === "daily_checkins") {
        const checkinDate = asString(op.payload.checkin_date);
        if (!checkinDate) {
          results.push({ opId: op.opId, status: "rejected", error: "Missing checkin_date." });
          continue;
        }

        const { data, error } = await authClient
          .from("daily_checkins")
          .upsert(
            {
              id: asString(op.payload.id) ?? crypto.randomUUID(),
              checkin_date: checkinDate,
              pain_score: asNumber(op.payload.pain_score),
              pain_red_flag: asBoolean(op.payload.pain_red_flag) ?? false,
              fatigue_score: asNumber(op.payload.fatigue_score),
              readiness_score: asNumber(op.payload.readiness_score),
              sleep_hours: asNumber(op.payload.sleep_hours),
              sleep_quality_score: asNumber(op.payload.sleep_quality_score),
              soreness_score: asNumber(op.payload.soreness_score),
              stress_score: asNumber(op.payload.stress_score),
              mood_score: asNumber(op.payload.mood_score),
              available_time_today_min: asInteger(op.payload.available_time_today_min),
              degraded_mode_days: asInteger(op.payload.degraded_mode_days),
              hrv_below_baseline_days: asInteger(op.payload.hrv_below_baseline_days),
              rhr_delta_bpm: asNumber(op.payload.rhr_delta_bpm),
              illness_flag: asBoolean(op.payload.illness_flag) ?? false,
              neurological_symptoms_flag: asBoolean(op.payload.neurological_symptoms_flag) ?? false,
              limp_flag: asBoolean(op.payload.limp_flag) ?? false,
              notes: asString(op.payload.notes),
              payload: asRecord(op.payload.payload) ?? {},
            },
            { onConflict: "user_id,checkin_date" },
          )
          .select("id, checkin_date")
          .single();
        if (error || !data?.id) {
          results.push({ opId: op.opId, status: "error", error: error?.message ?? "Insert failed." });
          continue;
        }

        await markAppliedWithResult(authClient, op.idempotencyKey, {
          daily_checkin_id: String(data.id),
          checkin_date: String(data.checkin_date),
        });
        results.push({ opId: op.opId, status: "applied" });
        continue;
      }

      if (op.entity === "context_snapshots") {
        const { error } = await authClient.from("context_snapshots").insert({
          plan_id: op.payload.plan_id ?? null,
          plan_version_id: op.payload.plan_version_id ?? null,
          executed_session_id: op.payload.executed_session_id ?? null,
          recommendation_id: op.payload.recommendation_id ?? null,
          captured_at: op.payload.captured_at ?? null,
          input_quality: typeof op.payload.input_quality === "object" && op.payload.input_quality ? op.payload.input_quality : {},
          payload: typeof op.payload.payload === "object" && op.payload.payload ? op.payload.payload : {},
        });
        if (error) {
          results.push({ opId: op.opId, status: "error", error: error.message });
          continue;
        }
        await markApplied(authClient, op.idempotencyKey);
        results.push({ opId: op.opId, status: "applied" });
        continue;
      }

      results.push({ opId: op.opId, status: "rejected", error: "Unsupported entity." });
    } catch (e) {
      results.push({ opId: op.opId, status: "error", error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return json(200, { results });
});
