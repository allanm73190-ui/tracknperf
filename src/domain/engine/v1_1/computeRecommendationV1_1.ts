import { reasonCodesV1_1 } from "./reasonCodes";
import { defaultEngineConfigV1_1, engineConfigV1_1Schema } from "./config.schema";
import type {
  CandidatePatch,
  CriticalDataFlagsV1_1,
  DailySignalsV1_1,
  DecisionState,
  EngineConfigV1_1,
  EngineResultV1_1,
  FatigueState,
  InputQuality,
  InterferenceSignalsV1_1,
  LoadState,
  NormalizedInputs,
  ReadinessState,
  RecommendationDecisionV1,
  RiskLevelV1,
  RuleFired,
  SessionLockStatusV1_1,
  SessionPriorityV1_1,
  SessionTypeV1_1,
  SignalContribution,
} from "./types";
import { computeFatigueSnapshot } from "../fatigue/computeFatigueSnapshot";
import type { ExecutedSessionSummary, SessionFeedback } from "../fatigue/computeFatigueSnapshot";
import { computeReadinessSnapshot } from "../readiness/computeReadinessSnapshot";

type AthleteLevel = "beginner" | "intermediate" | "advanced";

type RawPlannedSession = {
  id: string;
  scheduledFor: string;
  planId: string;
  planVersionId: string | null;
  sessionTemplateId: string | null;
  templateName: string | null;
  payload: Record<string, unknown>;
  sessionType?: SessionTypeV1_1 | null;
  priority?: SessionPriorityV1_1 | null;
  lockStatus?: SessionLockStatusV1_1 | null;
  blockPrimaryGoal?: string | null;
};

const DEFAULT_DAILY_SIGNALS: DailySignalsV1_1 = {
  painScore: null,
  painRedFlag: false,
  fatigueSelfScore: null,
  readinessSelfScore: null,
  sleepHoursLastNight: null,
  sleepHours2dAvg: null,
  hrvBelowBaselineDays: null,
  rhrDeltaBpm: null,
  illnessFlag: false,
  neurologicalSymptomsFlag: false,
  limpFlag: false,
  availableTimeTodayMin: null,
  degradedModeDays: null,
};

const DEFAULT_INTERFERENCE_SIGNALS: InterferenceSignalsV1_1 = {
  lastLowerBodyHeavyHoursAgo: null,
  lastIntenseRunHoursAgo: null,
  lastLongRunHoursAgo: null,
  lowerBodyHighStressCount7d: null,
  sameDayForbiddenComboDetected: false,
};

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function clamp(x: number, min: number, max: number): number {
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim().replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asBoolean(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "oui"].includes(s)) return true;
    if (["false", "0", "no", "non"].includes(s)) return false;
  }
  return null;
}

function inferSessionType(planned: RawPlannedSession | null): SessionTypeV1_1 {
  if (!planned) return "rest";
  if (planned.sessionType) return planned.sessionType;

  const payload = planned.payload ?? {};
  const explicit = asString(payload.sessionType) ?? asString(payload.session_type) ?? asString(payload.type);
  if (explicit) {
    const e = explicit.toLowerCase();
    if (e.includes("strength") || e.includes("force") || e.includes("hypert")) return "strength";
    if (e.includes("endurance") || e.includes("course") || e.includes("run") || e.includes("trail")) return "endurance";
    if (e.includes("recovery") || e.includes("recup")) return "recovery";
    if (e.includes("rest") || e.includes("repos")) return "rest";
    if (e.includes("mixed") || e.includes("hybrid")) return "mixed";
  }

  const name = (planned.templateName ?? "").toLowerCase();
  const hasStrength = /force|hypert|squat|deadlift|jambes|muscu/.test(name);
  const hasEndurance = /endurance|course|run|trail|fraction|tempo|long/.test(name);
  const hasRecovery = /recovery|recup|repos|easy/.test(name);

  if (hasRecovery) return "recovery";
  if (hasStrength && hasEndurance) return "mixed";
  if (hasStrength) return "strength";
  if (hasEndurance) return "endurance";
  return "mixed";
}

function inferPriority(planned: RawPlannedSession | null): SessionPriorityV1_1 {
  if (!planned) return "low";
  if (planned.priority) return planned.priority;

  const payload = planned.payload ?? {};
  const isKey = asBoolean(payload.isKeySession) ?? asBoolean(payload.is_key_session);
  if (isKey) return "key";

  const explicit = asString(payload.priority) ?? asString(payload.session_priority);
  if (explicit) {
    const p = explicit.toLowerCase();
    if (["low", "faible"].includes(p)) return "low";
    if (["high", "haute", "elevated"].includes(p)) return "high";
    if (["key", "cle", "clé", "strategic"].includes(p)) return "key";
  }

  const name = (planned.templateName ?? "").toLowerCase();
  if (/cle|clé|key|competition|compete|test|race/.test(name)) return "key";
  if (/long run|fraction|heavy|lourd/.test(name)) return "high";
  return "normal";
}

function inferLockStatus(planned: RawPlannedSession | null): SessionLockStatusV1_1 {
  if (!planned) return "free";
  if (planned.lockStatus) return planned.lockStatus;
  const payload = planned.payload ?? {};
  const explicit = asString(payload.lockStatus) ?? asString(payload.lock_status);
  if (explicit) {
    const s = explicit.toLowerCase();
    if (s === "free" || s === "libre") return "free";
    if (s === "adaptable") return "adaptable";
    if (s === "locked" || s === "verrouillee" || s === "verrouillée") return "locked";
    if (s === "locked_unless_safety" || s === "verrouillee_sauf_securite" || s === "verrouillée_sauf_sécurité") {
      return "locked_unless_safety";
    }
  }
  return "adaptable";
}

function inferBlockPrimaryGoal(planned: RawPlannedSession | null): string | null {
  if (!planned) return null;
  return (
    planned.blockPrimaryGoal ??
    asString(planned.payload?.blockPrimaryGoal) ??
    asString(planned.payload?.block_primary_goal) ??
    asString(planned.payload?.primaryGoal) ??
    asString(planned.payload?.primary_goal)
  );
}

function mergeDailySignals(partial?: Partial<DailySignalsV1_1>): DailySignalsV1_1 {
  if (!partial) return { ...DEFAULT_DAILY_SIGNALS };
  return {
    painScore: asNumber(partial.painScore) ?? null,
    painRedFlag: partial.painRedFlag === true,
    fatigueSelfScore: asNumber(partial.fatigueSelfScore) ?? null,
    readinessSelfScore: asNumber(partial.readinessSelfScore) ?? null,
    sleepHoursLastNight: asNumber(partial.sleepHoursLastNight) ?? null,
    sleepHours2dAvg: asNumber(partial.sleepHours2dAvg) ?? null,
    hrvBelowBaselineDays: asNumber(partial.hrvBelowBaselineDays) ?? null,
    rhrDeltaBpm: asNumber(partial.rhrDeltaBpm) ?? null,
    illnessFlag: partial.illnessFlag === true,
    neurologicalSymptomsFlag: partial.neurologicalSymptomsFlag === true,
    limpFlag: partial.limpFlag === true,
    availableTimeTodayMin: asNumber(partial.availableTimeTodayMin) ?? null,
    degradedModeDays: asNumber(partial.degradedModeDays) ?? null,
  };
}

function mergeInterferenceSignals(partial?: Partial<InterferenceSignalsV1_1>): InterferenceSignalsV1_1 {
  if (!partial) return { ...DEFAULT_INTERFERENCE_SIGNALS };
  return {
    lastLowerBodyHeavyHoursAgo: asNumber(partial.lastLowerBodyHeavyHoursAgo) ?? null,
    lastIntenseRunHoursAgo: asNumber(partial.lastIntenseRunHoursAgo) ?? null,
    lastLongRunHoursAgo: asNumber(partial.lastLongRunHoursAgo) ?? null,
    lowerBodyHighStressCount7d: asNumber(partial.lowerBodyHighStressCount7d) ?? null,
    sameDayForbiddenComboDetected: partial.sameDayForbiddenComboDetected === true,
  };
}

function mergedCriticalData(args: {
  planned: NormalizedInputs["plannedSession"];
  daily: DailySignalsV1_1;
  last7dExecutedCount: number;
  partial?: Partial<CriticalDataFlagsV1_1>;
}): CriticalDataFlagsV1_1 {
  const base: CriticalDataFlagsV1_1 = {
    hasBlockGoal: !!args.planned?.blockPrimaryGoal,
    hasSessionType: !!args.planned,
    hasPainState: args.daily.painScore !== null || args.daily.painRedFlag,
    hasRecentLoad: args.last7dExecutedCount > 0,
    hasCalendarAvailability: args.daily.availableTimeTodayMin !== null || !!args.planned,
  };
  if (!args.partial) return base;
  return {
    hasBlockGoal: args.partial.hasBlockGoal ?? base.hasBlockGoal,
    hasSessionType: args.partial.hasSessionType ?? base.hasSessionType,
    hasPainState: args.partial.hasPainState ?? base.hasPainState,
    hasRecentLoad: args.partial.hasRecentLoad ?? base.hasRecentLoad,
    hasCalendarAvailability: args.partial.hasCalendarAvailability ?? base.hasCalendarAvailability,
  };
}

function defaultPatch(): CandidatePatch {
  return {
    volumeMultiplier: 1,
    intensityMultiplier: 1,
    durationMin: null,
    exerciseSwaps: [],
    newSessionType: null,
    newDate: null,
    majorLeversChanged: 0,
  };
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toRecommendationDecision(state: DecisionState): RecommendationDecisionV1 {
  if (state === "reduce") return "reduce";
  if (state === "replace") return "replace";
  if (state === "move") return "move";
  if (state === "delete") return "delete";
  if (state === "rest") return "rest";
  if (state === "deload") return "deload";
  return "keep";
}

function dedupeReasonCodes(codes: Array<keyof typeof reasonCodesV1_1>): Array<keyof typeof reasonCodesV1_1> {
  const seen = new Set<string>();
  const out: Array<keyof typeof reasonCodesV1_1> = [];
  for (const code of codes) {
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

export function normalizeInputsV1_1(args: {
  todayIso: string;
  plannedSession: RawPlannedSession | null;
  recentExecutedSessionsCount: number;
  last7dExecutedCount: number;
  dailySignals?: Partial<DailySignalsV1_1>;
  interferenceSignals?: Partial<InterferenceSignalsV1_1>;
  criticalData?: Partial<CriticalDataFlagsV1_1>;
}): NormalizedInputs {
  const dailySignals = mergeDailySignals(args.dailySignals);
  const interference = mergeInterferenceSignals(args.interferenceSignals);

  const planned =
    args.plannedSession === null
      ? null
      : {
          id: args.plannedSession.id,
          scheduledFor: args.plannedSession.scheduledFor,
          planId: args.plannedSession.planId,
          planVersionId: args.plannedSession.planVersionId,
          sessionTemplateId: args.plannedSession.sessionTemplateId,
          templateName: args.plannedSession.templateName,
          payload: args.plannedSession.payload ?? {},
          sessionType: inferSessionType(args.plannedSession),
          priority: inferPriority(args.plannedSession),
          lockStatus: inferLockStatus(args.plannedSession),
          blockPrimaryGoal: inferBlockPrimaryGoal(args.plannedSession),
        };

  const criticalData = mergedCriticalData({
    planned,
    daily: dailySignals,
    last7dExecutedCount: args.last7dExecutedCount,
    partial: args.criticalData,
  });

  return {
    todayIso: args.todayIso,
    plannedSession: planned,
    recentExecutedSessionsCount: Math.max(0, Math.floor(args.recentExecutedSessionsCount)),
    last7dExecutedCount: Math.max(0, Math.floor(args.last7dExecutedCount)),
    criticalData,
    dailySignals,
    interference,
  };
}

export function computeInputQualityV1_1(inputs: NormalizedInputs, config: EngineConfigV1_1): InputQuality {
  const missing: string[] = [];
  if (!inputs.plannedSession) missing.push("plannedSession");
  if (!inputs.criticalData.hasBlockGoal) missing.push("blockGoal");
  if (!inputs.criticalData.hasSessionType) missing.push("sessionType");
  if (!inputs.criticalData.hasPainState) missing.push("painState");
  if (!inputs.criticalData.hasRecentLoad) missing.push("recentLoad");
  if (!inputs.criticalData.hasCalendarAvailability) missing.push("calendarAvailability");

  const criticalFields = Object.values(inputs.criticalData);
  const criticalCompleteness = criticalFields.filter(Boolean).length / criticalFields.length;
  const plannedWeight = inputs.plannedSession ? 0.2 : 0;
  const completeness = clamp01(plannedWeight + criticalCompleteness * 0.8);

  const degradedDays = inputs.dailySignals.degradedModeDays;
  const freshnessHours = degradedDays === null ? null : Math.max(0, degradedDays) * 24;
  if (degradedDays !== null && degradedDays > config.policies.maxDegradedDays) {
    missing.push("requalification_required");
  }

  return {
    completenessScore: completeness,
    missingFields: missing,
    freshnessHours,
  };
}

export function computeLoadStateV1_1(inputs: NormalizedInputs): LoadState {
  const last7d = inputs.last7dExecutedCount;
  const monotony = last7d / 7;
  const strain = last7d * monotony;
  return { last7dCount: last7d, monotonyProxy: monotony, strainProxy: strain };
}

function lowerBodyStressCap(config: EngineConfigV1_1, athleteLevel: AthleteLevel): number {
  if (athleteLevel === "beginner") return config.thresholds.lowerBodyHighStressMaxBeginner;
  if (athleteLevel === "advanced") return config.thresholds.lowerBodyHighStressMaxAdvanced;
  return config.thresholds.lowerBodyHighStressMaxIntermediate;
}

function reasonText(code: keyof typeof reasonCodesV1_1): string {
  switch (code) {
    case "NO_PLAN_TODAY":
      return "Aucune séance n'est planifiée aujourd'hui.";
    case "FOLLOW_PLAN":
      return "Le plan reste la meilleure option dans le contexte actuel.";
    case "DATA_MISSING":
      return "Des données critiques manquent pour personnaliser agressivement.";
    case "DATA_DEGRADED_MODE":
      return "Le moteur est en mode dégradé modéré-conservateur.";
    case "PAIN_RED_FLAG":
      return "Signal douleur rouge ou drapeau sécurité détecté.";
    case "PAIN_ORANGE_MODIFY":
      return "Douleur modérée: réduction de charge appliquée.";
    case "FATIGUE_HIGH":
      return "Fatigue élevée: réduction de charge recommandée.";
    case "READINESS_LOW":
      return "Readiness basse: séance allégée pour protéger la récupération.";
    case "SLEEP_DEBT_48H":
      return "Dette de sommeil sur 48h.";
    case "SLEEP_CRITICAL":
      return "Sommeil critique combiné à d'autres signaux de risque.";
    case "HRV_RHR_DIVERGENCE":
      return "Dérive HRV/RHR concordante avec d'autres signaux.";
    case "LOAD_GUARD":
      return "Charge des 7 derniers jours élevée.";
    case "WEEKLY_LOAD_CAP":
      return "Plafond de variation hebdo appliqué.";
    case "LOWER_BODY_CONFLICT":
      return "Risque d'interférence course/salle sur le bas du corps.";
    case "KEY_SESSION_PROTECTED":
      return "Séance clé protégée, adaptation des autres leviers.";
    case "LOCKED_SESSION":
      return "Séance verrouillée: changements limités.";
    case "FORCED_DELOAD":
      return "Deload forcé déclenché par cumul de signaux.";
    case "FORBIDDEN_ACTION_BLOCKED":
      return "Une action interdite a été bloquée par les garde-fous.";
    case "HUMAN_VALIDATION_REQUIRED":
      return "Validation humaine requise avant application.";
    case "OPTIMIZE_VOLUME_DOWN":
      return "Volume réduit pour préserver la progression.";
    case "OPTIMIZE_INTENSITY_DOWN":
      return "Intensité réduite pour limiter le risque.";
    case "DATA_FRESH":
      return "Recommandation calculée de façon déterministe.";
    default:
      return code;
  }
}

function countMajorLevers(patch: CandidatePatch): number {
  let count = 0;
  if (Math.abs(patch.volumeMultiplier - 1) > 0.001) count += 1;
  if (Math.abs(patch.intensityMultiplier - 1) > 0.001) count += 1;
  if (patch.durationMin !== null) count += 1;
  if (patch.newSessionType !== null) count += 1;
  if (patch.newDate !== null) count += 1;
  if (patch.exerciseSwaps.length > 0) count += 1;
  return count;
}

type RulesEngineOutcome = {
  decisionState: DecisionState;
  decision: RecommendationDecisionV1;
  riskLevel: RiskLevelV1;
  constraints: CandidatePatch;
  rulesFired: RuleFired[];
  fallbackMode: boolean;
  humanValidationRequired: boolean;
  forbiddenActionBlocked: string[];
};

export function rulesEngineV1_1(args: {
  config: EngineConfigV1_1;
  inputs: NormalizedInputs;
  load: LoadState;
  fatigue: FatigueState;
  readiness: ReadinessState;
  inputQuality: InputQuality;
  athleteLevel: AthleteLevel;
}): RulesEngineOutcome {
  const rulesFired: RuleFired[] = [];
  const forbiddenActionBlocked: string[] = [];
  let decisionState: DecisionState = "maintain";
  let decision: RecommendationDecisionV1 = "keep";
  let riskLevel: RiskLevelV1 = "green";
  let patch = defaultPatch();
  let humanValidationRequired = false;

  const addRule = (ruleId: string, reasonCodes: Array<keyof typeof reasonCodesV1_1>, detail?: string) => {
    rulesFired.push({
      ruleId,
      ruleVersion: "1",
      reasonCodes: reasonCodes.map((c) => reasonCodesV1_1[c]),
      detail,
    });
  };

  if (!args.inputs.plannedSession) {
    decisionState = "rest";
    decision = "rest";
    patch.volumeMultiplier = 0;
    patch.intensityMultiplier = 0;
    addRule("no_plan_today", ["NO_PLAN_TODAY"]);
    patch.majorLeversChanged = countMajorLevers(patch);
    return {
      decisionState,
      decision,
      riskLevel,
      constraints: patch,
      rulesFired,
      fallbackMode: false,
      humanValidationRequired: false,
      forbiddenActionBlocked,
    };
  }

  const fallbackMode =
    args.inputQuality.completenessScore < 0.8 ||
    (args.inputs.dailySignals.degradedModeDays !== null &&
      args.inputs.dailySignals.degradedModeDays > 0);
  if (fallbackMode) {
    addRule(
      "degraded_mode",
      ["DATA_DEGRADED_MODE", "DATA_MISSING"],
      `completeness=${args.inputQuality.completenessScore.toFixed(2)}`,
    );
  }

  const daily = args.inputs.dailySignals;
  const pain = daily.painScore ?? 0;
  const painRed =
    daily.painRedFlag ||
    pain >= args.config.thresholds.painRedThreshold ||
    daily.illnessFlag ||
    daily.neurologicalSymptomsFlag ||
    daily.limpFlag;
  const painOrange =
    !painRed &&
    daily.painScore !== null &&
    daily.painScore >= args.config.thresholds.painOrangeThreshold &&
    daily.painScore < args.config.thresholds.painRedThreshold;

  const fatigueHighBySelf =
    daily.fatigueSelfScore !== null && daily.fatigueSelfScore >= args.config.thresholds.fatigueSelfReduceThreshold;
  const fatigueRestBySelf =
    daily.fatigueSelfScore !== null && daily.fatigueSelfScore >= args.config.thresholds.fatigueSelfRestThreshold;
  const fatigueHighByEngine = args.fatigue.score >= args.config.thresholds.fatigueHighThreshold;

  const readinessLowBySelf =
    daily.readinessSelfScore !== null && daily.readinessSelfScore <= args.config.thresholds.readinessSelfReduceThreshold;
  const readinessRestBySelf =
    daily.readinessSelfScore !== null && daily.readinessSelfScore <= args.config.thresholds.readinessSelfRestThreshold;
  const readinessLowByEngine = args.readiness.score <= args.config.thresholds.readinessLowThreshold;

  const sleepHard =
    daily.sleepHoursLastNight !== null &&
    daily.sleepHoursLastNight < args.config.thresholds.sleepHardMinHours;
  const sleepDebt =
    daily.sleepHours2dAvg !== null &&
    daily.sleepHours2dAvg < args.config.thresholds.sleepDebt2dHours;
  const sleepCritical =
    daily.sleepHoursLastNight !== null &&
    daily.sleepHoursLastNight < args.config.thresholds.sleepCriticalHours &&
    (fatigueHighByEngine || fatigueHighBySelf || readinessLowByEngine || readinessLowBySelf);

  const hrvRhrDivergence =
    (
      (daily.hrvBelowBaselineDays ?? 0) >= args.config.thresholds.hrvLowDaysThreshold ||
      (daily.rhrDeltaBpm ?? 0) >= args.config.thresholds.rhrHighDeltaBpm
    ) &&
    (fatigueHighByEngine || fatigueHighBySelf || sleepHard || readinessLowByEngine || readinessLowBySelf);

  const loadGuard = args.load.last7dCount > args.config.thresholds.loadGuardLast7dMaxCount;
  const weeklyLoadCap = loadGuard && args.load.last7dCount > args.config.thresholds.loadGuardLast7dMaxCount + 1;

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
    decisionState = "rest";
    decision = "rest";
    riskLevel = "red";
    patch.volumeMultiplier = 0;
    patch.intensityMultiplier = 0;
    addRule("pain_red_or_medical_red_flag", ["PAIN_RED_FLAG"]);
  } else if (fatigueRestBySelf || readinessRestBySelf || sleepCritical) {
    decisionState = "rest";
    decision = "rest";
    riskLevel = "red";
    patch.volumeMultiplier = 0;
    patch.intensityMultiplier = 0;
    addRule("critical_recovery_gate", ["SLEEP_CRITICAL"]);
  } else if (forcedDeload) {
    decisionState = "deload";
    decision = "deload";
    riskLevel = "orange";
    patch.volumeMultiplier = Math.min(patch.volumeMultiplier, 1 - args.config.optimization.maxVolumeReductionPct);
    patch.intensityMultiplier = Math.min(patch.intensityMultiplier, 1 - args.config.optimization.maxIntensityReductionPct);
    addRule("forced_deload", ["FORCED_DELOAD"], `signals=${persistentSignalsCount}`);
  }

  if (painOrange) {
    decisionState = decisionState === "rest" ? decisionState : "reduce";
    decision = decisionState === "rest" ? "rest" : "reduce";
    riskLevel = riskLevel === "red" ? "red" : "orange";
    patch.volumeMultiplier = Math.min(
      patch.volumeMultiplier,
      1 - args.config.optimization.painOrangeVolumeReductionMaxPct,
    );
    patch.intensityMultiplier = Math.min(patch.intensityMultiplier, 1 - args.config.optimization.maxIntensityReductionPct);
    addRule("pain_orange_modify", ["PAIN_ORANGE_MODIFY"], `pain=${pain.toFixed(1)}`);
  }

  if (fatigueHighByEngine || fatigueHighBySelf) {
    decisionState = decisionState === "rest" ? decisionState : decisionState === "deload" ? "deload" : "reduce";
    decision = decisionState === "rest" ? "rest" : decisionState === "deload" ? "deload" : "reduce";
    riskLevel = riskLevel === "red" ? "red" : "orange";
    patch.volumeMultiplier = Math.min(patch.volumeMultiplier, 1 - args.config.optimization.maxVolumeReductionPct);
    patch.intensityMultiplier = Math.min(patch.intensityMultiplier, 1 - args.config.optimization.maxIntensityReductionPct);
    addRule("fatigue_gate", ["FATIGUE_HIGH"], `fatigue=${args.fatigue.score.toFixed(2)}`);
  }

  if (readinessLowByEngine || readinessLowBySelf) {
    decisionState = decisionState === "rest" ? decisionState : decisionState === "deload" ? "deload" : "reduce";
    decision = decisionState === "rest" ? "rest" : decisionState === "deload" ? "deload" : "reduce";
    riskLevel = riskLevel === "red" ? "red" : "orange";
    patch.volumeMultiplier = Math.min(patch.volumeMultiplier, 1 - args.config.optimization.maxVolumeReductionPct);
    patch.intensityMultiplier = Math.min(patch.intensityMultiplier, 1 - args.config.optimization.maxIntensityReductionPct);
    addRule("readiness_gate", ["READINESS_LOW"], `readiness=${args.readiness.score.toFixed(2)}`);
  }

  if (sleepHard || sleepDebt) {
    decisionState = decisionState === "rest" ? decisionState : decisionState === "deload" ? "deload" : "reduce";
    decision = decisionState === "rest" ? "rest" : decisionState === "deload" ? "deload" : "reduce";
    riskLevel = riskLevel === "red" ? "red" : "orange";
    patch.intensityMultiplier = Math.min(patch.intensityMultiplier, 0.9);
    if (sleepDebt) addRule("sleep_debt_48h", ["SLEEP_DEBT_48H"]);
  }

  if (hrvRhrDivergence) {
    decisionState = decisionState === "rest" ? decisionState : decisionState === "deload" ? "deload" : "reduce";
    decision = decisionState === "rest" ? "rest" : decisionState === "deload" ? "deload" : "reduce";
    riskLevel = riskLevel === "red" ? "red" : "orange";
    patch.intensityMultiplier = Math.min(patch.intensityMultiplier, 0.9);
    addRule("hrv_rhr_divergence", ["HRV_RHR_DIVERGENCE"]);
  }

  if (loadGuard) {
    decisionState = decisionState === "rest" ? decisionState : decisionState === "deload" ? "deload" : "reduce";
    decision = decisionState === "rest" ? "rest" : decisionState === "deload" ? "deload" : "reduce";
    patch.volumeMultiplier = Math.min(patch.volumeMultiplier, 1 - args.config.optimization.maxVolumeReductionPct);
    addRule("load_guard", ["LOAD_GUARD"], `last7d=${args.load.last7dCount}`);
  }

  if (weeklyLoadCap) {
    decisionState = decisionState === "rest" ? decisionState : decisionState === "deload" ? "deload" : "reduce";
    decision = decisionState === "rest" ? "rest" : decisionState === "deload" ? "deload" : "reduce";
    patch.volumeMultiplier = Math.min(patch.volumeMultiplier, 1 - args.config.thresholds.maxWeeklyLoadVariationPct);
    addRule("weekly_load_cap", ["WEEKLY_LOAD_CAP"], `maxVar=${args.config.thresholds.maxWeeklyLoadVariationPct}`);
  }

  const interference = args.inputs.interference;
  const lowerBodyCap = lowerBodyStressCap(args.config, args.athleteLevel);
  const overLowerBodyCap =
    interference.lowerBodyHighStressCount7d !== null &&
    interference.lowerBodyHighStressCount7d > lowerBodyCap;
  const recentLowerBodyLoadConflict =
    (interference.lastLowerBodyHeavyHoursAgo !== null && interference.lastLowerBodyHeavyHoursAgo < 24) ||
    (interference.lastIntenseRunHoursAgo !== null && interference.lastIntenseRunHoursAgo < 24) ||
    (interference.lastLongRunHoursAgo !== null && interference.lastLongRunHoursAgo < 24) ||
    interference.sameDayForbiddenComboDetected ||
    overLowerBodyCap;

  if (recentLowerBodyLoadConflict && decisionState !== "rest") {
    const planned = args.inputs.plannedSession;
    const isKeySession = planned?.priority === "key";
    addRule(
      "lower_body_interference",
      isKeySession ? ["LOWER_BODY_CONFLICT", "KEY_SESSION_PROTECTED"] : ["LOWER_BODY_CONFLICT"],
      `lowerBodyStress7d=${interference.lowerBodyHighStressCount7d ?? "na"}`,
    );
    if (isKeySession) {
      decisionState = decisionState === "deload" ? "deload" : decisionState === "reduce" ? "reduce" : "maintain";
      decision = toRecommendationDecision(decisionState);
      riskLevel = riskLevel === "red" ? "red" : "orange";
      patch.volumeMultiplier = Math.min(patch.volumeMultiplier, 0.9);
    } else if (interference.sameDayForbiddenComboDetected) {
      decisionState = "move";
      decision = "move";
      riskLevel = "orange";
      patch.newDate = addDaysIso(args.inputs.todayIso, 1);
      humanValidationRequired = true;
    } else {
      decisionState = "replace";
      decision = "replace";
      riskLevel = "orange";
      patch.newSessionType = args.inputs.plannedSession.sessionType === "strength" ? "recovery" : "mixed";
      humanValidationRequired = true;
    }
  }

  const isStrongChange = decision === "replace" || decision === "move" || decision === "delete" || decision === "deload" || decision === "rest";
  if (args.config.policies.requireHumanValidationForStrongChanges && isStrongChange) {
    humanValidationRequired = true;
    addRule("human_validation_required", ["HUMAN_VALIDATION_REQUIRED"], `decision=${decision}`);
  }

  const lockStatus = args.inputs.plannedSession.lockStatus;
  const isLocked = lockStatus === "locked" || lockStatus === "locked_unless_safety";
  const safetyEmergency = painRed || sleepCritical || fatigueRestBySelf || readinessRestBySelf;
  if (isLocked && !safetyEmergency && (decision !== "keep" && decision !== "reduce")) {
    forbiddenActionBlocked.push("LOCKED_SESSION_CHANGE_BLOCKED");
    addRule("forbidden_locked_session_change", ["LOCKED_SESSION", "FORBIDDEN_ACTION_BLOCKED"], `blocked=${decision}`);
    decisionState = "maintain";
    decision = "keep";
    riskLevel = "orange";
    patch = defaultPatch();
  }

  if (fallbackMode && (patch.volumeMultiplier > 1 || patch.intensityMultiplier > 1)) {
    patch.volumeMultiplier = Math.min(1, patch.volumeMultiplier);
    patch.intensityMultiplier = Math.min(1, patch.intensityMultiplier);
    forbiddenActionBlocked.push("NO_AGGRESSIVE_INCREASE_IN_DEGRADED_MODE");
    addRule("forbidden_increase_in_degraded_mode", ["FORBIDDEN_ACTION_BLOCKED", "DATA_DEGRADED_MODE"]);
  }

  patch.volumeMultiplier = clamp(
    patch.volumeMultiplier,
    1 - args.config.optimization.maxVolumeReductionPct,
    1 + args.config.optimization.maxVolumeIncreasePct,
  );
  patch.intensityMultiplier = clamp(
    patch.intensityMultiplier,
    1 - args.config.optimization.maxIntensityReductionPct,
    1 + args.config.optimization.maxIntensityIncreasePct,
  );

  patch.majorLeversChanged = countMajorLevers(patch);
  if (patch.majorLeversChanged > args.config.optimization.maxMajorLeversPerSession) {
    if (patch.newDate !== null) patch.newDate = null;
    if (patch.newSessionType !== null) patch.newSessionType = null;
    if (patch.exerciseSwaps.length > 0) patch.exerciseSwaps = [];
    patch.majorLeversChanged = countMajorLevers(patch);
  }

  if (rulesFired.length === 0) {
    addRule("follow_plan", ["FOLLOW_PLAN"]);
  }

  return {
    decisionState,
    decision,
    riskLevel,
    constraints: patch,
    rulesFired,
    fallbackMode,
    humanValidationRequired,
    forbiddenActionBlocked,
  };
}

export function optimizationLayerV1_1(args: {
  decisionState: DecisionState;
  decision: RecommendationDecisionV1;
  constraints: CandidatePatch;
}): { patch: CandidatePatch; reasonCodes: Array<keyof typeof reasonCodesV1_1> } {
  if (args.decision === "rest") {
    const patch = {
      ...args.constraints,
      volumeMultiplier: 0,
      intensityMultiplier: 0,
    };
    return { patch, reasonCodes: ["NO_PLAN_TODAY"] };
  }

  const codes: Array<keyof typeof reasonCodesV1_1> = [];
  if (args.constraints.volumeMultiplier < 1) codes.push("OPTIMIZE_VOLUME_DOWN");
  if (args.constraints.intensityMultiplier < 1) codes.push("OPTIMIZE_INTENSITY_DOWN");
  if (args.decision === "keep" && codes.length === 0) codes.push("FOLLOW_PLAN");

  return { patch: args.constraints, reasonCodes: codes };
}

function computeConfidenceScore(args: {
  inputQuality: InputQuality;
  load: LoadState;
  fallbackMode: boolean;
  forbiddenActionBlocked: string[];
  hrvRhrDivergence: boolean;
}): number {
  const completeness = clamp01(args.inputQuality.completenessScore) * 100;
  const freshnessPenalty =
    args.inputQuality.freshnessHours !== null && args.inputQuality.freshnessHours > 72
      ? Math.min(20, (args.inputQuality.freshnessHours - 72) / 24)
      : 0;
  const consistency = args.hrvRhrDivergence ? 58 : 76;
  const stability = args.load.last7dCount >= 4 ? 78 : args.load.last7dCount >= 2 ? 66 : 52;
  let score = completeness * 0.55 + consistency * 0.25 + stability * 0.2 - freshnessPenalty;
  if (args.fallbackMode) score -= 20;
  if (args.forbiddenActionBlocked.length > 0) score -= 10;
  return Math.round(clamp(score, 0, 100));
}

export function buildExplainabilityV1_1(args: {
  config: EngineConfigV1_1;
  inputs: NormalizedInputs;
  inputQuality: InputQuality;
  load: LoadState;
  fatigue: FatigueState;
  readiness: ReadinessState;
  rulesFired: RuleFired[];
  patch: CandidatePatch;
  decisionState: DecisionState;
  decision: RecommendationDecisionV1;
  riskLevel: RiskLevelV1;
  fallbackMode: boolean;
  humanValidationRequired: boolean;
  forbiddenActionBlocked: string[];
}): {
  signals: SignalContribution[];
  reasonCodes: Array<keyof typeof reasonCodesV1_1>;
  headline: string;
  top3: Array<{ code: keyof typeof reasonCodesV1_1; text: string }>;
  confidenceScore: number;
} {
  const hrvRhrDivergence =
    ((args.inputs.dailySignals.hrvBelowBaselineDays ?? 0) >= args.config.thresholds.hrvLowDaysThreshold ||
      (args.inputs.dailySignals.rhrDeltaBpm ?? 0) >= args.config.thresholds.rhrHighDeltaBpm) &&
    (args.fatigue.score >= args.config.thresholds.fatigueHighThreshold ||
      args.readiness.score <= args.config.thresholds.readinessLowThreshold);

  const signals: SignalContribution[] = [
    {
      signalId: "executed_last7d_count",
      rawValue: args.load.last7dCount,
      normalizedValue: clamp01(args.load.last7dCount / 7),
      weight: 0.25,
      direction: args.load.last7dCount > args.config.thresholds.loadGuardLast7dMaxCount ? "down" : "neutral",
      reasonCode:
        args.load.last7dCount > args.config.thresholds.loadGuardLast7dMaxCount
          ? reasonCodesV1_1.LOAD_GUARD
          : undefined,
    },
    {
      signalId: "fatigue_score",
      rawValue: args.fatigue.score,
      normalizedValue: clamp01(args.fatigue.score),
      weight: 0.25,
      direction: args.fatigue.score >= args.config.thresholds.fatigueHighThreshold ? "down" : "neutral",
      reasonCode:
        args.fatigue.score >= args.config.thresholds.fatigueHighThreshold
          ? reasonCodesV1_1.FATIGUE_HIGH
          : undefined,
    },
    {
      signalId: "readiness_score",
      rawValue: args.readiness.score,
      normalizedValue: clamp01(args.readiness.score),
      weight: 0.2,
      direction: args.readiness.score <= args.config.thresholds.readinessLowThreshold ? "down" : "neutral",
      reasonCode:
        args.readiness.score <= args.config.thresholds.readinessLowThreshold
          ? reasonCodesV1_1.READINESS_LOW
          : undefined,
    },
    {
      signalId: "pain_score",
      rawValue: args.inputs.dailySignals.painScore ?? -1,
      normalizedValue:
        args.inputs.dailySignals.painScore === null ? 0 : clamp01(args.inputs.dailySignals.painScore / 10),
      weight: 0.15,
      direction:
        args.inputs.dailySignals.painScore !== null &&
        args.inputs.dailySignals.painScore >= args.config.thresholds.painOrangeThreshold
          ? "down"
          : "neutral",
      reasonCode:
        args.inputs.dailySignals.painScore !== null &&
        args.inputs.dailySignals.painScore >= args.config.thresholds.painOrangeThreshold
          ? reasonCodesV1_1.PAIN_ORANGE_MODIFY
          : undefined,
    },
    {
      signalId: "sleep_last_night_h",
      rawValue: args.inputs.dailySignals.sleepHoursLastNight ?? -1,
      normalizedValue:
        args.inputs.dailySignals.sleepHoursLastNight === null
          ? 0
          : clamp01(args.inputs.dailySignals.sleepHoursLastNight / 8),
      weight: 0.15,
      direction:
        args.inputs.dailySignals.sleepHoursLastNight !== null &&
        args.inputs.dailySignals.sleepHoursLastNight < args.config.thresholds.sleepHardMinHours
          ? "down"
          : "neutral",
      reasonCode:
        args.inputs.dailySignals.sleepHoursLastNight !== null &&
        args.inputs.dailySignals.sleepHoursLastNight < args.config.thresholds.sleepHardMinHours
          ? reasonCodesV1_1.SLEEP_DEBT_48H
          : undefined,
    },
  ];

  const collectedCodes: Array<keyof typeof reasonCodesV1_1> = [];
  for (const rule of args.rulesFired) {
    for (const code of rule.reasonCodes) {
      const key = Object.keys(reasonCodesV1_1).find(
        (k) => reasonCodesV1_1[k as keyof typeof reasonCodesV1_1] === code,
      ) as keyof typeof reasonCodesV1_1 | undefined;
      if (key) collectedCodes.push(key);
    }
  }
  if (args.patch.volumeMultiplier < 1) collectedCodes.push("OPTIMIZE_VOLUME_DOWN");
  if (args.patch.intensityMultiplier < 1) collectedCodes.push("OPTIMIZE_INTENSITY_DOWN");
  if (args.humanValidationRequired) collectedCodes.push("HUMAN_VALIDATION_REQUIRED");
  if (args.forbiddenActionBlocked.length > 0) collectedCodes.push("FORBIDDEN_ACTION_BLOCKED");
  if (collectedCodes.length === 0) collectedCodes.push("FOLLOW_PLAN");

  const reasonCodes = dedupeReasonCodes(collectedCodes);
  const top3: Array<{ code: keyof typeof reasonCodesV1_1; text: string }> = reasonCodes
    .slice(0, 3)
    .map((code) => ({ code, text: reasonText(code) }));

  while (top3.length < 3) {
    top3.push({ code: "DATA_FRESH", text: reasonText("DATA_FRESH") });
  }

  const headlineByDecision: Record<RecommendationDecisionV1, string> = {
    keep: "Suivez la séance planifiée",
    reduce: "Séance maintenue avec réduction ciblée",
    replace: "Séance convertie pour limiter l'interférence",
    move: "Séance déplacée pour protéger la récupération",
    delete: "Séance supprimée",
    rest: "Repos recommandé aujourd'hui",
    deload: "Deload recommandé pour protéger la progression",
  };

  const confidenceScore = computeConfidenceScore({
    inputQuality: args.inputQuality,
    load: args.load,
    fallbackMode: args.fallbackMode,
    forbiddenActionBlocked: args.forbiddenActionBlocked,
    hrvRhrDivergence,
  });

  return {
    signals,
    reasonCodes,
    headline: headlineByDecision[args.decision],
    top3: top3.slice(0, 3),
    confidenceScore,
  };
}

export function computeRecommendationV1_1(args: {
  todayIso: string;
  plannedSession: RawPlannedSession | null;
  recentExecutedSessionsCount: number;
  last7dExecutedCount: number;
  config?: unknown;
  algorithmVersion: string;
  recentSessions?: ExecutedSessionSummary[];
  feedback?: SessionFeedback[];
  latestFatigue?: (FatigueState & { dataQualityScore?: number }) | null;
  latestReadiness?: ReadinessState | null;
  dailySignals?: Partial<DailySignalsV1_1>;
  interferenceSignals?: Partial<InterferenceSignalsV1_1>;
  criticalData?: Partial<CriticalDataFlagsV1_1>;
  athleteLevel?: AthleteLevel;
}): EngineResultV1_1 {
  const config = engineConfigV1_1Schema.parse(args.config ?? defaultEngineConfigV1_1());

  const inputs = normalizeInputsV1_1({
    todayIso: args.todayIso,
    plannedSession: args.plannedSession,
    recentExecutedSessionsCount: args.recentExecutedSessionsCount,
    last7dExecutedCount: args.last7dExecutedCount,
    dailySignals: args.dailySignals,
    interferenceSignals: args.interferenceSignals,
    criticalData: args.criticalData,
  });

  const inputQuality = computeInputQualityV1_1(inputs, config as EngineConfigV1_1);
  const load = computeLoadStateV1_1(inputs);

  const computedFatigue = computeFatigueSnapshot(args.recentSessions ?? [], args.feedback ?? [], {
    todayIso: args.todayIso,
    algorithmVersion: args.algorithmVersion,
  });

  const fatigue: FatigueState =
    computedFatigue.dataQualityScore < 0.3 && args.latestFatigue
      ? {
          score: clamp01(args.latestFatigue.score),
          dimensions: {
            general: clamp01(args.latestFatigue.dimensions?.general ?? args.latestFatigue.score),
          },
        }
      : computedFatigue;

  const computedReadiness = computeReadinessSnapshot(
    computedFatigue,
    inputs.plannedSession?.sessionType ?? "mixed",
    { algorithmVersion: args.algorithmVersion },
  );
  const readiness: ReadinessState =
    computedFatigue.dataQualityScore < 0.3 && args.latestReadiness
      ? {
          score: clamp01(args.latestReadiness.score),
          limitingFactor: args.latestReadiness.limitingFactor,
        }
      : computedReadiness;

  const rules = rulesEngineV1_1({
    config: config as EngineConfigV1_1,
    inputs,
    load,
    fatigue,
    readiness,
    inputQuality,
    athleteLevel: args.athleteLevel ?? "intermediate",
  });

  const { patch, reasonCodes: optimizationReasonCodes } = optimizationLayerV1_1({
    decisionState: rules.decisionState,
    decision: rules.decision,
    constraints: rules.constraints,
  });

  const expl = buildExplainabilityV1_1({
    config: config as EngineConfigV1_1,
    inputs,
    inputQuality,
    load,
    fatigue,
    readiness,
    rulesFired: rules.rulesFired,
    patch,
    decisionState: rules.decisionState,
    decision: rules.decision,
    riskLevel: rules.riskLevel,
    fallbackMode: rules.fallbackMode,
    humanValidationRequired: rules.humanValidationRequired,
    forbiddenActionBlocked: rules.forbiddenActionBlocked,
  });

  const allReasonCodes = dedupeReasonCodes([...expl.reasonCodes, ...optimizationReasonCodes]);
  const recommendationReasonValues = allReasonCodes.map((c) => reasonCodesV1_1[c]);
  const sessionAdjustments = {
    volume_pct: round2((patch.volumeMultiplier - 1) * 100),
    intensity_pct: round2((patch.intensityMultiplier - 1) * 100),
    duration_min: patch.durationMin,
    exercise_swaps: patch.exerciseSwaps,
    new_session_type: patch.newSessionType,
    new_date: patch.newDate,
  };

  const action: "execute_planned" | "rest" | "replace" | "move" | "delete" | "deload" =
    rules.decision === "rest"
      ? "rest"
      : rules.decision === "replace"
        ? "replace"
        : rules.decision === "move"
          ? "move"
          : rules.decision === "delete"
            ? "delete"
            : rules.decision === "deload"
              ? "deload"
              : "execute_planned";

  const recommendation = {
    scope: "today" as const,
    decision: rules.decision,
    decisionState: rules.decisionState,
    patch: {
      action,
      planned_session_id: inputs.plannedSession?.id ?? null,
      session_template_id: inputs.plannedSession?.sessionTemplateId ?? null,
      volume_multiplier: patch.volumeMultiplier,
      intensity_multiplier: patch.intensityMultiplier,
      duration_min: patch.durationMin,
      new_session_type: patch.newSessionType,
      new_date: patch.newDate,
      exercise_swaps: patch.exerciseSwaps,
    },
    confidence_score: expl.confidenceScore,
    risk_level: rules.riskLevel,
    reasons: recommendationReasonValues,
    rules_triggered: rules.rulesFired.map((r) => r.ruleId),
    session_adjustments: sessionAdjustments,
    human_validation_required: rules.humanValidationRequired,
    forbidden_action_blocked: rules.forbiddenActionBlocked,
    fallback_mode: rules.fallbackMode,
    reasonCodes: recommendationReasonValues,
    algorithmVersion: args.algorithmVersion,
    configVersion: config.version,
  };

  const explanation = {
    summary: {
      headline: expl.headline,
      reasonsTop3: expl.top3.map((x) => ({ code: reasonCodesV1_1[x.code], text: x.text })),
    },
    decisionState: rules.decisionState,
    decision: rules.decision,
    riskLevel: rules.riskLevel,
    confidenceScore: expl.confidenceScore,
    reasonCodes: recommendationReasonValues,
    signals: expl.signals,
    rulesFired: rules.rulesFired,
    dataQuality: inputQuality,
    fallbackMode: rules.fallbackMode,
    forbiddenActionBlocked: rules.forbiddenActionBlocked,
    humanValidationRequired: rules.humanValidationRequired,
    algorithmVersion: args.algorithmVersion,
    configVersion: config.version,
  };

  return { inputs, load, fatigue, readiness, recommendation, explanation };
}
