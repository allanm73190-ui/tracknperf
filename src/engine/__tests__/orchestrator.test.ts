import { describe, it, expect } from "vitest";
import { runAdaptiveEngine } from "../index";
import type { EngineInputs } from "../../types/engine";

function makeInputs(overrides: Partial<EngineInputs> = {}): EngineInputs {
  return {
    athlete: { userId: "u1", level: "intermediate", goals: ["strength"] },
    today: { date: "2026-04-15", plannedSession: null },
    history: { recentSessions: [], last7dCount: 0 },
    algorithmVersion: "v2.0.0",
    ...overrides,
  };
}

describe("runAdaptiveEngine", () => {
  it("returns a complete EngineResult with all required fields", () => {
    const result = runAdaptiveEngine(makeInputs());
    expect(result).toHaveProperty("recommendation");
    expect(result).toHaveProperty("explanation");
    expect(result).toHaveProperty("fatigue");
    expect(result).toHaveProperty("readiness");
    expect(result).toHaveProperty("load");
  });

  it("recommendation.decisionState is 'rest' when no planned session", () => {
    const result = runAdaptiveEngine(makeInputs({ today: { date: "2026-04-15", plannedSession: null } }));
    expect(result.recommendation.decisionState).toBe("rest");
  });

  it("explanation always present even with minimal inputs", () => {
    const result = runAdaptiveEngine(makeInputs());
    expect(result.explanation.headline).toBeTruthy();
    expect(result.explanation.reasonsTop3.length).toBe(3);
  });

  it("is deterministic: same inputs produce same output", () => {
    const inputs = makeInputs();
    const a = runAdaptiveEngine(inputs);
    const b = runAdaptiveEngine(inputs);
    expect(a.recommendation.decisionState).toBe(b.recommendation.decisionState);
    expect(a.recommendation.patch.volumeMultiplier).toBe(b.recommendation.patch.volumeMultiplier);
  });

  it("triggers reduce decision after high-RPE session accumulation", () => {
    const sessions = [1,2,3,4,5].map(d => ({
      id: `s${d}`,
      startedAt: `2026-04-${String(15-d).padStart(2,"0")}T10:00:00Z`,
      durationMinutes: 90,
      rpe: 9,
      sessionType: "strength" as const,
      volumeMultiplierApplied: 1.0,
      intensityMultiplierApplied: 1.0,
    }));
    const result = runAdaptiveEngine(makeInputs({
      today: {
        date: "2026-04-15",
        plannedSession: { id: "ps1", sessionType: "strength", templateName: "Force", scheduledFor: "2026-04-15" },
      },
      history: { recentSessions: sessions, last7dCount: 5 },
    }));
    expect(["reduce_volume","reduce_intensity","deload_local","deload_global"]).toContain(result.recommendation.decisionState);
  });

  it("recommendation.patch.volumeMultiplier < 1 when decision reduces volume", () => {
    const sessions = [1,2,3,4,5,6].map(d => ({
      id: `s${d}`,
      startedAt: `2026-04-${String(15-d).padStart(2,"0")}T10:00:00Z`,
      durationMinutes: 90,
      rpe: 9,
      sessionType: "strength" as const,
      volumeMultiplierApplied: 1.0,
      intensityMultiplierApplied: 1.0,
    }));
    const result = runAdaptiveEngine(makeInputs({
      today: {
        date: "2026-04-15",
        plannedSession: { id: "ps1", sessionType: "strength", templateName: "Force", scheduledFor: "2026-04-15" },
      },
      history: { recentSessions: sessions, last7dCount: 6 },
    }));
    if (["reduce_volume","deload_local","deload_global"].includes(result.recommendation.decisionState)) {
      expect(result.recommendation.patch.volumeMultiplier).toBeLessThan(1);
    }
  });

  it("never increases both volume and intensity simultaneously", () => {
    const result = runAdaptiveEngine(makeInputs({
      today: {
        date: "2026-04-15",
        plannedSession: { id: "ps1", sessionType: "strength", templateName: "Force", scheduledFor: "2026-04-15" },
      },
      history: { recentSessions: [], last7dCount: 0 },
    }));
    const { volumeMultiplier, intensityMultiplier } = result.recommendation.patch;
    expect(volumeMultiplier > 1 && intensityMultiplier > 1).toBe(false);
  });

  it("algorithmVersion is echoed back in result", () => {
    const result = runAdaptiveEngine(makeInputs({ algorithmVersion: "v2.0.0" }));
    expect(result.recommendation.algorithmVersion).toBe("v2.0.0");
  });
});
