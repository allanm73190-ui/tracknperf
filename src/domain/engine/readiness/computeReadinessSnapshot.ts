import type { ReadinessState } from "../v1_1/types";
import type { FatigueSnapshot } from "../fatigue/computeFatigueSnapshot";

export type SessionArchetype = "strength" | "endurance" | "mixed" | "recovery" | "rest";

export type ReadinessSnapshot = ReadinessState & {
  algorithmVersion: string;
  computedAt: string; // ISO
};

/**
 * Compute a ReadinessSnapshot from fatigue state and session archetype.
 *
 * Score = 1 - fatigue.score (simple inverse for V1).
 * limitingFactor:
 *   - "data"    if fatigue.dataQualityScore < 0.3
 *   - "fatigue" if fatigue.score > 0.7
 *   - "none"    otherwise
 */
export function computeReadinessSnapshot(
  fatigue: FatigueSnapshot,
  _sessionArchetype: SessionArchetype = "mixed",
  opts: { algorithmVersion?: string } = {}
): ReadinessSnapshot {
  const algorithmVersion = opts.algorithmVersion ?? fatigue.algorithmVersion;
  const computedAt = new Date().toISOString();

  const limitingFactor: ReadinessState["limitingFactor"] =
    fatigue.dataQualityScore < 0.3
      ? "data"
      : fatigue.score > 0.7
        ? "fatigue"
        : "none";

  const score = Math.max(0, Math.min(1, 1 - fatigue.score));

  return { score, limitingFactor, algorithmVersion, computedAt };
}
