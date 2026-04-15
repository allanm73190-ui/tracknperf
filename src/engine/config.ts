import type { EngineConfig } from "../types/engine";

export const ENGINE_VERSION = "v2.0.0";

export const FATIGUE_WEIGHTS = {
  muscular: { strength: 0.5, endurance: 0.15, mixed: 0.3, recovery: 0.05 },
  cardiovascular: { strength: 0.1, endurance: 0.55, mixed: 0.3, recovery: 0.05 },
  neural: { strength: 0.25, endurance: 0.15, mixed: 0.2, recovery: 0.05 },
  articular: { strength: 0.15, endurance: 0.15, mixed: 0.2, recovery: 0.05 },
} as const;

export const FATIGUE_DECAY_DAYS = 3;
export const DATA_QUALITY_MIN_SESSIONS = 3;

export function defaultEngineConfig(): EngineConfig {
  return {
    version: "cfg-default-v2",
    thresholds: {
      loadGuardLast7dMaxCount: 6,
      fatigueGlobalHighThreshold: 0.70,
      fatigueGlobalCriticalThreshold: 0.88,
      readinessLowThreshold: 0.35,
      painRiskCriticalThreshold: 0.85,
      conflictHighThreshold: 0.75,
    },
    optimization: {
      maxVolumeReductionPct: 0.25,
      maxVolumeIncreasePct: 0.10,
      maxIntensityReductionPct: 0.15,
      maxIntensityIncreasePct: 0.05,
    },
    policies: {
      conservativeByDefault: false,
    },
  };
}

export const GOAL_SESSION_AFFINITY: Record<string, string[]> = {
  strength: ["strength", "mixed"],
  endurance: ["endurance", "mixed"],
  hypertrophy: ["strength", "mixed"],
  cardio: ["endurance", "mixed"],
  recovery: ["recovery", "mixed"],
};
