export type DecisionState =
  | "progress" | "maintain" | "reduce_volume" | "reduce_intensity"
  | "substitute" | "defer" | "deload_local" | "deload_global" | "rest";

export type ProgressionAxis = "volume" | "intensity" | "density" | "complexity";
export type SessionType = "strength" | "endurance" | "mixed" | "recovery";
export type AthleteLevel = "beginner" | "intermediate" | "advanced";

export interface ToleranceProfile {
  volumeTolerance: number;
  intensityTolerance: number;
  recoverySensitivity: number;
  confidenceScore: number;
  updatedAt: string;
}

export interface ExecutedSessionRecord {
  id: string;
  startedAt: string;
  durationMinutes: number;
  rpe: number;
  sessionType: SessionType;
  volumeMultiplierApplied: number;
  intensityMultiplierApplied: number;
}

export interface PlannedSession {
  id: string;
  sessionType: SessionType;
  templateName: string;
  scheduledFor: string;
}

export interface PainReport {
  reportedAt: string;
  bodyZone: string;
  severity: number;
}

export interface EngineInputs {
  athlete: {
    userId: string;
    level: AthleteLevel;
    goals: string[];
    toleranceProfile?: ToleranceProfile;
  };
  today: {
    date: string;
    plannedSession: PlannedSession | null;
    painReports?: PainReport[];
  };
  history: {
    recentSessions: ExecutedSessionRecord[];
    last7dCount: number;
    recentAxes?: ProgressionAxis[];
  };
  algorithmVersion: string;
  config?: EngineConfig;
}

export interface EngineConfig {
  version: string;
  thresholds: {
    loadGuardLast7dMaxCount: number;
    fatigueGlobalHighThreshold: number;
    fatigueGlobalCriticalThreshold: number;
    readinessLowThreshold: number;
    painRiskCriticalThreshold: number;
    conflictHighThreshold: number;
  };
  optimization: {
    maxVolumeReductionPct: number;
    maxVolumeIncreasePct: number;
    maxIntensityReductionPct: number;
    maxIntensityIncreasePct: number;
  };
  policies: {
    conservativeByDefault: boolean;
  };
}

export interface MultidimensionalFatigue {
  muscular: number;
  cardiovascular: number;
  neural: number;
  articular: number;
  global: number;
  dataQualityScore: number;
}

export interface ReadinessState {
  score: number;
  limitingFactor: "none" | "muscular" | "cardiovascular" | "neural" | "articular" | "data" | "fatigue";
}

export interface LoadState {
  last7dCount: number;
  monotonyProxy: number;
  strainProxy: number;
}

export interface PlannedSessionPatch {
  volumeMultiplier: number;
  intensityMultiplier: number;
}

export interface RuleFired {
  ruleId: string;
  reasonCode: string;
  detail?: string;
}

export interface SignalContribution {
  signalId: string;
  rawValue: number;
  normalizedValue: number;
  weight: number;
  direction: "up" | "down" | "neutral";
  reasonCode?: string;
}

export interface EngineExplanation {
  headline: string;
  reasonsTop3: Array<{ code: string; text: string }>;
  signals: SignalContribution[];
  rulesFired: RuleFired[];
  decisionState: DecisionState;
  algorithmVersion: string;
  configVersion: string;
}

export interface EngineRecommendation {
  scope: "today";
  decisionState: DecisionState;
  patch: {
    action: "rest" | "execute_planned" | "substitute" | "defer";
    plannedSessionId: string | null;
    volumeMultiplier: number;
    intensityMultiplier: number;
  };
  progressionAxis: ProgressionAxis | null;
  algorithmVersion: string;
  configVersion: string;
}

export interface EngineResult {
  inputs: EngineInputs;
  load: LoadState;
  fatigue: MultidimensionalFatigue;
  readiness: ReadinessState;
  recommendation: EngineRecommendation;
  explanation: EngineExplanation;
}
