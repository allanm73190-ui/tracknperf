import { reasonCodesV1_1 } from "./reasonCodes";
import { defaultEngineConfigV1_1, engineConfigV1_1Schema } from "./config.schema";
import type {
  CandidatePatch,
  EngineConfigV1_1,
  EngineResultV1_1,
  FatigueState,
  InputQuality,
  LoadState,
  NormalizedInputs,
  ReadinessState,
  RuleFired,
  SignalContribution,
} from "./types";
import { computeFatigueSnapshot } from "../fatigue/computeFatigueSnapshot";
import type { ExecutedSessionSummary, SessionFeedback } from "../fatigue/computeFatigueSnapshot";
import { computeReadinessSnapshot } from "../readiness/computeReadinessSnapshot";

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function normalizeInputsV1_1(args: {
  todayIso: string;
  plannedSession: NormalizedInputs["plannedSession"];
  recentExecutedSessionsCount: number;
  last7dExecutedCount: number;
}): NormalizedInputs {
  return {
    todayIso: args.todayIso,
    plannedSession: args.plannedSession,
    recentExecutedSessionsCount: Math.max(0, Math.floor(args.recentExecutedSessionsCount)),
    last7dExecutedCount: Math.max(0, Math.floor(args.last7dExecutedCount)),
  };
}

export function computeInputQualityV1_1(inputs: NormalizedInputs): InputQuality {
  const missing: string[] = [];
  if (!inputs.plannedSession) missing.push("plannedSession");
  // V1.1 pragmatic: we don't have metrics yet; treat as missing but not blocking.
  missing.push("metrics");

  // completeness heuristic: planned session matters most for Today scope.
  const completeness = clamp01(inputs.plannedSession ? 0.7 : 0.3);
  return {
    completenessScore: completeness,
    missingFields: missing,
    freshnessHours: null,
  };
}

export function computeLoadStateV1_1(inputs: NormalizedInputs): LoadState {
  const last7d = inputs.last7dExecutedCount;
  const monotony = last7d / 7;
  const strain = last7d * monotony;
  return { last7dCount: last7d, monotonyProxy: monotony, strainProxy: strain };
}

/** @deprecated Use computeFatigueSnapshot from domain/engine/fatigue */
export function computeFatigueStateV1_1(load: LoadState): FatigueState {
  // Proxy fatigue: rises with strain; capped.
  const score = clamp01(load.strainProxy / 10);
  return { score, dimensions: { general: score } };
}

/** @deprecated Use computeReadinessSnapshot from domain/engine/readiness */
export function computeReadinessV1_1(inputQuality: InputQuality, fatigue: FatigueState): ReadinessState {
  if (inputQuality.completenessScore < 0.4) {
    return { score: 0.35, limitingFactor: "data" };
  }
  // readiness inversely related to fatigue (proxy)
  const score = clamp01(1 - fatigue.score * 0.9);
  return { score, limitingFactor: fatigue.score > 0.7 ? "fatigue" : "none" };
}

export function rulesEngineV1_1(args: {
  config: EngineConfigV1_1;
  inputs: NormalizedInputs;
  load: LoadState;
  fatigue: FatigueState;
  readiness: ReadinessState;
  inputQuality: InputQuality;
}): { decisionState: "progress" | "maintain" | "reduce" | "rest"; constraints: CandidatePatch; rulesFired: RuleFired[] } {
  const rulesFired: RuleFired[] = [];
  let decision: "progress" | "maintain" | "reduce" | "rest" = "maintain";
  let constraints: CandidatePatch = { volumeMultiplier: 1, intensityMultiplier: 1 };

  if (!args.inputs.plannedSession) {
    decision = "rest";
    rulesFired.push({
      ruleId: "no_plan_today",
      ruleVersion: "1",
      reasonCodes: [reasonCodesV1_1.NO_PLAN_TODAY],
    });
    return { decisionState: decision, constraints, rulesFired };
  }

  if (args.load.last7dCount > args.config.thresholds.loadGuardLast7dMaxCount) {
    decision = "reduce";
    constraints = { volumeMultiplier: 1 - args.config.optimization.maxVolumeReductionPct, intensityMultiplier: 1 };
    rulesFired.push({
      ruleId: "load_guard_last7d",
      ruleVersion: "1",
      reasonCodes: [reasonCodesV1_1.LOAD_GUARD],
      detail: `last7d=${args.load.last7dCount}`,
    });
  }

  if (args.fatigue.score >= args.config.thresholds.fatigueHighThreshold) {
    decision = "reduce";
    constraints = {
      volumeMultiplier: Math.min(constraints.volumeMultiplier, 1 - args.config.optimization.maxVolumeReductionPct),
      intensityMultiplier: Math.min(constraints.intensityMultiplier, 1 - args.config.optimization.maxIntensityReductionPct),
    };
    rulesFired.push({
      ruleId: "fatigue_high",
      ruleVersion: "1",
      reasonCodes: [reasonCodesV1_1.FATIGUE_HIGH],
      detail: `fatigue=${args.fatigue.score.toFixed(2)}`,
    });
  }

  if (args.readiness.score <= args.config.thresholds.readinessLowThreshold) {
    decision = "reduce";
    constraints = {
      volumeMultiplier: Math.min(constraints.volumeMultiplier, 1 - args.config.optimization.maxVolumeReductionPct),
      intensityMultiplier: Math.min(constraints.intensityMultiplier, 1 - args.config.optimization.maxIntensityReductionPct),
    };
    rulesFired.push({
      ruleId: "readiness_low",
      ruleVersion: "1",
      reasonCodes: [reasonCodesV1_1.READINESS_LOW],
      detail: `readiness=${args.readiness.score.toFixed(2)}`,
    });
  }

  if (args.inputQuality.completenessScore < 0.5 && args.config.policies.conservativeByDefault) {
    decision = "maintain";
    rulesFired.push({
      ruleId: "conservative_default",
      ruleVersion: "1",
      reasonCodes: [reasonCodesV1_1.DATA_MISSING],
      detail: `completeness=${args.inputQuality.completenessScore.toFixed(2)}`,
    });
  }

  if (decision === "maintain" && args.config.policies.conservativeByDefault) {
    decision = "maintain";
  }

  return { decisionState: decision, constraints, rulesFired };
}

export function optimizationLayerV1_1(args: {
  decisionState: "progress" | "maintain" | "reduce" | "rest";
  constraints: CandidatePatch;
}): { patch: CandidatePatch; reasonCodes: Array<keyof typeof reasonCodesV1_1> } {
  if (args.decisionState === "rest") {
    return { patch: { volumeMultiplier: 0, intensityMultiplier: 0 }, reasonCodes: ["NO_PLAN_TODAY"] };
  }
  if (args.decisionState === "reduce") {
    const rc: Array<keyof typeof reasonCodesV1_1> = [];
    if (args.constraints.volumeMultiplier < 1) rc.push("OPTIMIZE_VOLUME_DOWN");
    if (args.constraints.intensityMultiplier < 1) rc.push("OPTIMIZE_INTENSITY_DOWN");
    return { patch: args.constraints, reasonCodes: rc };
  }
  return { patch: { volumeMultiplier: 1, intensityMultiplier: 1 }, reasonCodes: ["FOLLOW_PLAN"] };
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
  decisionState: "progress" | "maintain" | "reduce" | "rest";
}): { signals: SignalContribution[]; reasonCodes: Array<keyof typeof reasonCodesV1_1>; headline: string; top3: Array<{ code: keyof typeof reasonCodesV1_1; text: string }> } {
  const signals: SignalContribution[] = [
    {
      signalId: "executed_last7d_count",
      rawValue: args.load.last7dCount,
      normalizedValue: clamp01(args.load.last7dCount / 7),
      weight: 0.3,
      direction: "down",
      reasonCode: args.load.last7dCount > args.config.thresholds.loadGuardLast7dMaxCount ? reasonCodesV1_1.LOAD_GUARD : undefined,
    },
    {
      signalId: "fatigue_proxy",
      rawValue: args.fatigue.score,
      normalizedValue: args.fatigue.score,
      weight: 0.4,
      direction: args.fatigue.score > 0.6 ? "down" : "neutral",
      reasonCode: args.fatigue.score >= args.config.thresholds.fatigueHighThreshold ? reasonCodesV1_1.FATIGUE_HIGH : undefined,
    },
    {
      signalId: "readiness_proxy",
      rawValue: args.readiness.score,
      normalizedValue: args.readiness.score,
      weight: 0.3,
      direction: args.readiness.score < 0.5 ? "down" : "neutral",
      reasonCode: args.readiness.score <= args.config.thresholds.readinessLowThreshold ? reasonCodesV1_1.READINESS_LOW : undefined,
    },
  ];

  const reasonCodes: Array<keyof typeof reasonCodesV1_1> = [];
  if (!args.inputs.plannedSession) reasonCodes.push("NO_PLAN_TODAY");
  if (args.inputQuality.completenessScore < 0.6) reasonCodes.push("DATA_MISSING");
  if (args.decisionState === "reduce" && args.patch.volumeMultiplier < 1) reasonCodes.push("OPTIMIZE_VOLUME_DOWN");
  if (args.decisionState === "reduce" && args.patch.intensityMultiplier < 1) reasonCodes.push("OPTIMIZE_INTENSITY_DOWN");
  if (args.inputs.plannedSession) reasonCodes.push("FOLLOW_PLAN");

  const top3: Array<{ code: keyof typeof reasonCodesV1_1; text: string }> = [];
  if (!args.inputs.plannedSession) {
    top3.push({ code: "NO_PLAN_TODAY", text: "No planned session found for today." });
    top3.push({ code: "DATA_MISSING", text: "Add a plan and signals to unlock personalized recommendations." });
  } else {
    top3.push({ code: "FOLLOW_PLAN", text: "You have a planned session for today." });
    if (args.decisionState === "reduce") {
      if (args.patch.volumeMultiplier < 1) top3.push({ code: "OPTIMIZE_VOLUME_DOWN", text: "Reducing volume to manage load and fatigue." });
      if (args.patch.intensityMultiplier < 1) top3.push({ code: "OPTIMIZE_INTENSITY_DOWN", text: "Reducing intensity to keep the session safe." });
    } else {
      top3.push({ code: "DATA_MISSING", text: "Signals are partial, so we keep the recommendation conservative." });
    }
  }
  while (top3.length < 3) top3.push({ code: "DATA_FRESH", text: "Recommendation computed deterministically from current inputs." });

  const headline = args.decisionState === "rest" ? "Rest day" : args.decisionState === "reduce" ? "Do your session, but reduce" : "Follow your planned session";
  return { signals, reasonCodes, headline, top3: top3.slice(0,3) };
}

export function computeRecommendationV1_1(args: {
  todayIso: string;
  plannedSession: NormalizedInputs["plannedSession"];
  recentExecutedSessionsCount: number;
  last7dExecutedCount: number;
  config?: unknown;
  algorithmVersion: string;
  recentSessions?: ExecutedSessionSummary[];
  feedback?: SessionFeedback[];
}): EngineResultV1_1 {
  const config = engineConfigV1_1Schema.parse(args.config ?? defaultEngineConfigV1_1());
  const inputs = normalizeInputsV1_1({
    todayIso: args.todayIso,
    plannedSession: args.plannedSession,
    recentExecutedSessionsCount: args.recentExecutedSessionsCount,
    last7dExecutedCount: args.last7dExecutedCount,
  });
  const inputQuality = computeInputQualityV1_1(inputs);
  const load = computeLoadStateV1_1(inputs);
  const fatigue = computeFatigueSnapshot(
    args.recentSessions ?? [],
    args.feedback ?? [],
    { todayIso: args.todayIso, algorithmVersion: args.algorithmVersion }
  );
  const readiness = computeReadinessSnapshot(fatigue, "mixed", { algorithmVersion: args.algorithmVersion });
  const { decisionState, constraints, rulesFired } = rulesEngineV1_1({
    config: config as EngineConfigV1_1,
    inputs,
    load,
    fatigue,
    readiness,
    inputQuality,
  });
  const { patch } = optimizationLayerV1_1({ decisionState, constraints });
  const expl = buildExplainabilityV1_1({
    config: config as EngineConfigV1_1,
    inputs,
    inputQuality,
    load,
    fatigue,
    readiness,
    rulesFired,
    patch,
    decisionState,
  });

  const recommendation = {
    scope: "today" as const,
    decisionState,
    patch: {
      action: decisionState === "rest" ? "rest" as const : "execute_planned" as const,
      planned_session_id: inputs.plannedSession?.id ?? null,
      session_template_id: inputs.plannedSession?.sessionTemplateId ?? null,
      volume_multiplier: patch.volumeMultiplier,
      intensity_multiplier: patch.intensityMultiplier,
    },
    reasonCodes: expl.reasonCodes.map((c) => reasonCodesV1_1[c]),
    algorithmVersion: args.algorithmVersion,
    configVersion: config.version,
  };

  const explanation = {
    summary: {
      headline: expl.headline,
      reasonsTop3: expl.top3.map((x) => ({ code: reasonCodesV1_1[x.code], text: x.text })),
    },
    decisionState,
    reasonCodes: expl.reasonCodes.map((c) => reasonCodesV1_1[c]),
    signals: expl.signals,
    rulesFired,
    dataQuality: inputQuality,
    algorithmVersion: args.algorithmVersion,
    configVersion: config.version,
  };

  return { inputs, load, fatigue, readiness, recommendation, explanation };
}
