import type {
  ToleranceProfile, ExecutedSessionRecord, PlannedSessionPatch,
  DecisionState, ProgressionAxis,
} from "../types/engine";
import { defaultEngineConfig } from "./config";

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function updateNextSessionParameters(args: {
  decisionState: DecisionState;
  progressionAxis: ProgressionAxis | null;
  currentParameters: { targetSets: number; targetRepsPerSet: number; targetIntensityPct: number };
  toleranceProfile: ToleranceProfile;
}): PlannedSessionPatch {
  const cfg = defaultEngineConfig();
  const { maxVolumeReductionPct, maxVolumeIncreasePct, maxIntensityReductionPct, maxIntensityIncreasePct } = cfg.optimization;

  const toleranceFactor = clamp(args.toleranceProfile.volumeTolerance, 0.5, 1.0);

  if (args.decisionState === "reduce_volume") {
    return { volumeMultiplier: 1 - maxVolumeReductionPct, intensityMultiplier: 1.0 };
  }
  if (args.decisionState === "reduce_intensity") {
    return { volumeMultiplier: 1.0, intensityMultiplier: 1 - maxIntensityReductionPct };
  }
  if (args.decisionState === "deload_local" || args.decisionState === "deload_global") {
    return { volumeMultiplier: 1 - maxVolumeReductionPct, intensityMultiplier: 1 - maxIntensityReductionPct };
  }
  if (args.decisionState !== "progress" || !args.progressionAxis) {
    return { volumeMultiplier: 1.0, intensityMultiplier: 1.0 };
  }

  // progress — exactly one axis at a time
  if (args.progressionAxis === "volume") {
    const inc = maxVolumeIncreasePct * toleranceFactor;
    return { volumeMultiplier: clamp(1 + inc, 0.5, 1.5), intensityMultiplier: 1.0 };
  }
  if (args.progressionAxis === "intensity") {
    const inc = maxIntensityIncreasePct * clamp(args.toleranceProfile.intensityTolerance, 0.5, 1.0);
    return { volumeMultiplier: 1.0, intensityMultiplier: clamp(1 + inc, 0.5, 1.5) };
  }
  // density / complexity → volume proxy with smaller step
  const inc = maxVolumeIncreasePct * 0.5 * toleranceFactor;
  return { volumeMultiplier: clamp(1 + inc, 0.5, 1.5), intensityMultiplier: 1.0 };
}

export function updateUserToleranceProfile(
  profile: ToleranceProfile,
  sessions: ExecutedSessionRecord[]
): ToleranceProfile {
  if (sessions.length === 0) return { ...profile };

  const avgRpe = sessions.reduce((s, r) => s + r.rpe, 0) / sessions.length;
  const LEARN_RATE = 0.05;

  let { volumeTolerance, intensityTolerance, recoverySensitivity, confidenceScore } = profile;

  if (avgRpe >= 9) {
    volumeTolerance    = clamp(volumeTolerance    - LEARN_RATE * 1.5, 0, 1);
    intensityTolerance = clamp(intensityTolerance - LEARN_RATE,       0, 1);
    recoverySensitivity= clamp(recoverySensitivity+ LEARN_RATE,       0, 1);
  } else if (avgRpe <= 5) {
    volumeTolerance    = clamp(volumeTolerance    + LEARN_RATE,       0, 1);
    intensityTolerance = clamp(intensityTolerance + LEARN_RATE * 0.5, 0, 1);
    recoverySensitivity= clamp(recoverySensitivity- LEARN_RATE * 0.5, 0, 1);
  }

  confidenceScore = clamp(confidenceScore + LEARN_RATE * (sessions.length / 5), 0, 1);

  return { volumeTolerance, intensityTolerance, recoverySensitivity, confidenceScore, updatedAt: new Date().toISOString() };
}

export function detectRecurringFatiguePatterns(sessions: ExecutedSessionRecord[]): string[] {
  if (sessions.length === 0) return [];

  const patterns: string[] = [];

  // Weekly overload: 6+ sessions in 7 days
  const cutoff = Date.now() - 7 * 86_400_000;
  const last7d = sessions.filter(s => new Date(s.startedAt).getTime() >= cutoff);
  if (last7d.length >= 6) patterns.push("weekly_overload");

  // Post-strength accumulation: 4+ strength sessions with avg RPE >= 8
  const strengthSessions = sessions.filter(s => s.sessionType === "strength");
  if (strengthSessions.length >= 4) {
    const avgRpe = strengthSessions.reduce((sum, s) => sum + s.rpe, 0) / strengthSessions.length;
    if (avgRpe >= 8) patterns.push("post_strength_accumulation");
  }

  // High-intensity accumulation: avg RPE >= 8.5 overall
  const avgRpeAll = sessions.reduce((sum, s) => sum + s.rpe, 0) / sessions.length;
  if (sessions.length >= 3 && avgRpeAll >= 8.5) patterns.push("high_intensity_accumulation");

  return patterns;
}
