import type { ReasonCode } from "./reasonCodes";

export type DataQuality = {
  plannedSessionPresent: boolean;
  hasRecentExecutionHistory: boolean;
};

export type EngineInput = {
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
};

export type EngineConfig = {
  // Placeholder V1: later this will be derived from `config_profiles.config`.
  conservativeByDefault: boolean;
};

export type RecommendationOutput = {
  kind: "follow_plan" | "rest";
  plannedSessionId: string | null;
  recommendedTemplateName: string | null;
  patch: Record<string, unknown>;
};

export type ExplanationSummary = {
  headline: string;
  reasonsTop3: Array<{ code: ReasonCode; text: string }>;
};

export type Explanation = {
  summary: ExplanationSummary;
  dataQuality: DataQuality;
  rulesFired: Array<{ code: ReasonCode; detail?: string }>;
};

export type EngineResult = {
  input: EngineInput;
  output: RecommendationOutput;
  explanation: Explanation;
};

