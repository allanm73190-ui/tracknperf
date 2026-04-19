import { describe, it, expect } from "vitest";
import {
  updateNextSessionParameters,
  updateUserToleranceProfile,
  detectRecurringFatiguePatterns,
} from "../adaptive";
import type { ToleranceProfile, ExecutedSessionRecord } from "../../types/engine";

function makeSession(overrides: Partial<ExecutedSessionRecord> = {}): ExecutedSessionRecord {
  return {
    id: "s1",
    startedAt: "2026-04-14T10:00:00Z",
    durationMinutes: 60,
    rpe: 7,
    sessionType: "strength",
    volumeMultiplierApplied: 1.0,
    intensityMultiplierApplied: 1.0,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<ToleranceProfile> = {}): ToleranceProfile {
  return {
    volumeTolerance: 0.7,
    intensityTolerance: 0.7,
    recoverySensitivity: 0.5,
    confidenceScore: 0.5,
    updatedAt: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

describe("updateNextSessionParameters", () => {
  it("returns a patch with volume_multiplier and intensity_multiplier", () => {
    const patch = updateNextSessionParameters({
      decisionState: "progress",
      progressionAxis: "volume",
      currentParameters: { targetSets: 4, targetRepsPerSet: 8, targetIntensityPct: 75 },
      toleranceProfile: makeProfile(),
    });
    expect(patch).toHaveProperty("volumeMultiplier");
    expect(patch).toHaveProperty("intensityMultiplier");
  });

  it("volumeMultiplier > 1 when progressing on volume axis", () => {
    const patch = updateNextSessionParameters({
      decisionState: "progress",
      progressionAxis: "volume",
      currentParameters: { targetSets: 4, targetRepsPerSet: 8, targetIntensityPct: 75 },
      toleranceProfile: makeProfile(),
    });
    expect(patch.volumeMultiplier).toBeGreaterThan(1);
    expect(patch.intensityMultiplier).toBe(1.0);
  });

  it("intensityMultiplier > 1 when progressing on intensity axis", () => {
    const patch = updateNextSessionParameters({
      decisionState: "progress",
      progressionAxis: "intensity",
      currentParameters: { targetSets: 4, targetRepsPerSet: 8, targetIntensityPct: 75 },
      toleranceProfile: makeProfile(),
    });
    expect(patch.intensityMultiplier).toBeGreaterThan(1);
    expect(patch.volumeMultiplier).toBe(1.0);
  });

  it("volumeMultiplier < 1 when reduce_volume", () => {
    const patch = updateNextSessionParameters({
      decisionState: "reduce_volume",
      progressionAxis: null,
      currentParameters: { targetSets: 4, targetRepsPerSet: 8, targetIntensityPct: 75 },
      toleranceProfile: makeProfile(),
    });
    expect(patch.volumeMultiplier).toBeLessThan(1);
  });

  it("intensityMultiplier < 1 when reduce_intensity", () => {
    const patch = updateNextSessionParameters({
      decisionState: "reduce_intensity",
      progressionAxis: null,
      currentParameters: { targetSets: 4, targetRepsPerSet: 8, targetIntensityPct: 75 },
      toleranceProfile: makeProfile(),
    });
    expect(patch.intensityMultiplier).toBeLessThan(1);
  });

  it("never increases both volume and intensity simultaneously", () => {
    const patch = updateNextSessionParameters({
      decisionState: "progress",
      progressionAxis: "volume",
      currentParameters: { targetSets: 4, targetRepsPerSet: 8, targetIntensityPct: 75 },
      toleranceProfile: makeProfile(),
    });
    expect(patch.volumeMultiplier > 1 && patch.intensityMultiplier > 1).toBe(false);
  });

  it("multipliers stay in [0.5, 1.5] range", () => {
    const patch = updateNextSessionParameters({
      decisionState: "progress",
      progressionAxis: "volume",
      currentParameters: { targetSets: 10, targetRepsPerSet: 20, targetIntensityPct: 95 },
      toleranceProfile: makeProfile({ volumeTolerance: 1.0 }),
    });
    expect(patch.volumeMultiplier).toBeGreaterThanOrEqual(0.5);
    expect(patch.volumeMultiplier).toBeLessThanOrEqual(1.5);
  });
});

describe("updateUserToleranceProfile", () => {
  it("returns an updated profile with bumped confidenceScore when RPE matches target", () => {
    const updated = updateUserToleranceProfile(makeProfile({ confidenceScore: 0.5 }), [
      makeSession({ rpe: 7 }),
      makeSession({ rpe: 7 }),
      makeSession({ rpe: 7 }),
    ]);
    expect(updated.confidenceScore).toBeGreaterThanOrEqual(0.5);
  });

  it("lowers volumeTolerance when RPE consistently high (>= 9)", () => {
    const profile = makeProfile({ volumeTolerance: 0.8 });
    const sessions = [1,2,3,4,5].map(() => makeSession({ rpe: 9 }));
    const updated = updateUserToleranceProfile(profile, sessions);
    expect(updated.volumeTolerance).toBeLessThan(profile.volumeTolerance);
  });

  it("raises volumeTolerance when RPE consistently low (<= 5)", () => {
    const profile = makeProfile({ volumeTolerance: 0.5 });
    const sessions = [1,2,3,4,5].map(() => makeSession({ rpe: 4 }));
    const updated = updateUserToleranceProfile(profile, sessions);
    expect(updated.volumeTolerance).toBeGreaterThan(profile.volumeTolerance);
  });

  it("all tolerance values stay in [0, 1]", () => {
    const updated = updateUserToleranceProfile(makeProfile(), [makeSession({ rpe: 10 }), makeSession({ rpe: 10 }), makeSession({ rpe: 10 })]);
    expect(updated.volumeTolerance).toBeGreaterThanOrEqual(0);
    expect(updated.volumeTolerance).toBeLessThanOrEqual(1);
    expect(updated.intensityTolerance).toBeGreaterThanOrEqual(0);
    expect(updated.intensityTolerance).toBeLessThanOrEqual(1);
  });

  it("updatedAt is set to a recent ISO timestamp", () => {
    const updated = updateUserToleranceProfile(makeProfile(), [makeSession()]);
    expect(updated.updatedAt).toBeTruthy();
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(0);
  });
});

describe("detectRecurringFatiguePatterns", () => {
  it("returns empty patterns with no sessions", () => {
    const patterns = detectRecurringFatiguePatterns([]);
    expect(patterns).toEqual([]);
  });

  it("detects 'post_strength_accumulation' pattern from repeated strength sessions with RPE >= 8", () => {
    const sessions = [1,2,3,4,5].map((d) =>
      makeSession({ id:`s${d}`, startedAt:`2026-04-${String(15-d).padStart(2,"0")}T10:00:00Z`, sessionType:"strength", rpe:8 })
    );
    const patterns = detectRecurringFatiguePatterns(sessions);
    expect(patterns.some(p => p.includes("strength") || p.includes("accumulation"))).toBe(true);
  });

  it("detects 'weekly_overload' when 6+ sessions in 7 days", () => {
    const sessions = [1,2,3,4,5,6].map((d) => {
      const date = new Date(Date.now() - d * 86_400_000).toISOString();
      return makeSession({ id:`s${d}`, startedAt: date, sessionType:"mixed", rpe:7 });
    });
    const patterns = detectRecurringFatiguePatterns(sessions);
    expect(patterns.some(p => p.includes("overload") || p.includes("weekly"))).toBe(true);
  });

  it("returns array of strings", () => {
    const patterns = detectRecurringFatiguePatterns([makeSession()]);
    expect(Array.isArray(patterns)).toBe(true);
    for (const p of patterns) expect(typeof p).toBe("string");
  });
});
