import type { ReasonCodeV1_1 } from "./reasonCodes";

export type InputQuality = {
  completenessScore: number; // 0..1
  missingFields: string[];
  freshnessHours: number | null;
};

export type SessionTypeV1_1 = "strength" | "endurance" | "mixed" | "recovery" | "rest";
export type SessionPriorityV1_1 = "low" | "normal" | "high" | "key";
export type SessionLockStatusV1_1 = "free" | "adaptable" | "locked" | "locked_unless_safety";

export type DailySignalsV1_1 = {
  painScore: number | null; // 0..10
  painRedFlag: boolean;
  fatigueSelfScore: number | null; // 0..10
  readinessSelfScore: number | null; // 0..10
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

export type InterferenceSignalsV1_1 = {
  lastLowerBodyHeavyHoursAgo: number | null;
  lastIntenseRunHoursAgo: number | null;
  lastLongRunHoursAgo: number | null;
  lowerBodyHighStressCount7d: number | null;
  sameDayForbiddenComboDetected: boolean;
};

export type CriticalDataFlagsV1_1 = {
  hasBlockGoal: boolean;
  hasSessionType: boolean;
  hasPainState: boolean;
  hasRecentLoad: boolean;
  hasCalendarAvailability: boolean;
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
    sessionType: SessionTypeV1_1;
    priority: SessionPriorityV1_1;
    lockStatus: SessionLockStatusV1_1;
    blockPrimaryGoal: string | null;
  } | null;
  recentExecutedSessionsCount: number;
  last7dExecutedCount: number;
  criticalData: CriticalDataFlagsV1_1;
  dailySignals: DailySignalsV1_1;
  interference: InterferenceSignalsV1_1;
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

export type DecisionState = "progress" | "maintain" | "reduce" | "replace" | "move" | "delete" | "rest" | "deload";
export type RecommendationDecisionV1 = "keep" | "reduce" | "replace" | "move" | "delete" | "rest" | "deload";
export type RiskLevelV1 = "green" | "orange" | "red";

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
    maxDegradedDays: number;
    requireHumanValidationForStrongChanges: boolean;
  };
  thresholds: {
    loadGuardLast7dMaxCount: number;
    fatigueHighThreshold: number; // 0..1
    readinessLowThreshold: number; // 0..1
    painOrangeThreshold: number; // 0..10
    painRedThreshold: number; // 0..10
    fatigueSelfReduceThreshold: number; // 0..10
    fatigueSelfRestThreshold: number; // 0..10
    readinessSelfReduceThreshold: number; // 0..10
    readinessSelfRestThreshold: number; // 0..10
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
    maxVolumeReductionPct: number; // 0..1
    maxVolumeIncreasePct: number; // 0..1
    maxIntensityReductionPct: number; // 0..1
    maxIntensityIncreasePct: number; // 0..1
    painOrangeVolumeReductionMinPct: number; // 0..1
    painOrangeVolumeReductionMaxPct: number; // 0..1
    maxMajorLeversPerSession: number;
  };
};

export type CandidatePatch = {
  volumeMultiplier: number; // 0..2
  intensityMultiplier: number; // 0..2
  durationMin: number | null;
  exerciseSwaps: Array<{ from: string; to: string; rationale: string }>;
  newSessionType: SessionTypeV1_1 | null;
  newDate: string | null;
  majorLeversChanged: number;
};

export type RecommendationV1_1 = {
  scope: "today";
  decision: RecommendationDecisionV1;
  decisionState: DecisionState;
  patch: {
    action: "execute_planned" | "rest" | "replace" | "move" | "delete" | "deload";
    planned_session_id: string | null;
    session_template_id: string | null;
    volume_multiplier?: number;
    intensity_multiplier?: number;
    duration_min?: number | null;
    new_session_type?: SessionTypeV1_1 | null;
    new_date?: string | null;
    exercise_swaps?: Array<{ from: string; to: string; rationale: string }>;
  };
  confidence_score: number; // 0..100
  risk_level: RiskLevelV1;
  reasons: ReasonCodeV1_1[];
  rules_triggered: string[];
  session_adjustments: {
    volume_pct: number;
    intensity_pct: number;
    duration_min: number | null;
    exercise_swaps: Array<{ from: string; to: string; rationale: string }>;
    new_session_type: SessionTypeV1_1 | null;
    new_date: string | null;
  };
  human_validation_required: boolean;
  forbidden_action_blocked: string[];
  fallback_mode: boolean;
  reasonCodes: ReasonCodeV1_1[];
  algorithmVersion: string;
  configVersion: string;
};

export type ExplanationV1_1 = {
  summary: { headline: string; reasonsTop3: Array<{ code: ReasonCodeV1_1; text: string }> };
  decisionState: DecisionState;
  decision: RecommendationDecisionV1;
  riskLevel: RiskLevelV1;
  confidenceScore: number;
  reasonCodes: ReasonCodeV1_1[];
  signals: SignalContribution[];
  rulesFired: RuleFired[];
  dataQuality: InputQuality;
  fallbackMode: boolean;
  forbiddenActionBlocked: string[];
  humanValidationRequired: boolean;
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
