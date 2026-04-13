import type { ReasonCodeV1_1 } from "./reasonCodes";

export type InputQuality = {
  completenessScore: number; // 0..1
  missingFields: string[];
  freshnessHours: number | null;
};

export type NormalizedInputs = {
  todayIso: string;
  plannedSession: {
    id: string;
    scheduledFor: string;
    planId: string;
    planVersionId: string | null;
    sessionTemplateId: string | null;
    templateName: string | null;
    payload: Record<string, unknown>;
  } | null;
  recentExecutedSessionsCount: number;
  last7dExecutedCount: number;
};

export type LoadState = {
  last7dCount: number;
  monotonyProxy: number; // 0..?, simple proxy
  strainProxy: number; // 0..?, simple proxy
};

export type FatigueState = {
  score: number; // 0..1
  dimensions: { general: number };
};

export type ReadinessState = {
  score: number; // 0..1
  limitingFactor: "none" | "fatigue" | "data";
};

export type DecisionState = "progress" | "maintain" | "reduce" | "rest";

export type RuleFired = {
  ruleId: string;
  ruleVersion: string;
  reasonCodes: ReasonCodeV1_1[];
  detail?: string;
};

export type SignalContribution = {
  signalId: string;
  rawValue: unknown;
  normalizedValue: number | null;
  weight: number;
  direction: "up" | "down" | "neutral";
  reasonCode?: ReasonCodeV1_1;
};

export type EngineConfigV1_1 = {
  version: string;
  policies: {
    conservativeByDefault: boolean;
  };
  thresholds: {
    loadGuardLast7dMaxCount: number;
    fatigueHighThreshold: number; // 0..1
    readinessLowThreshold: number; // 0..1
  };
  optimization: {
    maxVolumeReductionPct: number; // 0..1
    maxIntensityReductionPct: number; // 0..1
  };
};

export type CandidatePatch = {
  volumeMultiplier: number; // 0..2
  intensityMultiplier: number; // 0..2
};

export type RecommendationV1_1 = {
  scope: "today";
  decisionState: DecisionState;
  patch: {
    action: "execute_planned" | "rest";
    planned_session_id: string | null;
    session_template_id: string | null;
    volume_multiplier?: number;
    intensity_multiplier?: number;
  };
  reasonCodes: ReasonCodeV1_1[];
  algorithmVersion: string;
  configVersion: string;
};

export type ExplanationV1_1 = {
  summary: { headline: string; reasonsTop3: Array<{ code: ReasonCodeV1_1; text: string }> };
  decisionState: DecisionState;
  reasonCodes: ReasonCodeV1_1[];
  signals: SignalContribution[];
  rulesFired: RuleFired[];
  dataQuality: InputQuality;
  algorithmVersion: string;
  configVersion: string;
};

export type EngineResultV1_1 = {
  inputs: NormalizedInputs;
  load: LoadState;
  fatigue: FatigueState;
  readiness: ReadinessState;
  recommendation: RecommendationV1_1;
  explanation: ExplanationV1_1;
};

