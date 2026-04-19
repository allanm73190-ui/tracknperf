import { describe, it, expect } from "vitest";
import { substituteSession, reoptimizeMicrocycle, buildExplanation } from "../optimization";
import type { PlannedSession, MultidimensionalFatigue, DecisionState } from "../../types/engine";

function makePlanned(overrides: Partial<PlannedSession> = {}): PlannedSession {
  return { id: "ps1", sessionType: "strength", templateName: "Force", scheduledFor: "2026-04-15", ...overrides };
}

function makeFatigue(overrides: Partial<MultidimensionalFatigue> = {}): MultidimensionalFatigue {
  return { muscular: 0.5, cardiovascular: 0.3, neural: 0.4, articular: 0.3, global: 0.4, dataQualityScore: 0.8, ...overrides };
}

describe("substituteSession", () => {
  it("returns a substitute session with a different sessionType when conflict high", () => {
    const substitute = substituteSession(makePlanned({ sessionType: "strength" }), makeFatigue({ muscular: 0.85 }), "conflict");
    expect(substitute).not.toBeNull();
    expect(substitute?.sessionType).not.toBe("strength");
  });

  it("returns null when no suitable substitute exists", () => {
    const substitute = substituteSession(makePlanned({ sessionType: "recovery" }), makeFatigue({ global: 0.1 }), "conflict");
    expect(substitute).toBeNull();
  });

  it("returns a lower-intensity session when reason is pain", () => {
    const substitute = substituteSession(makePlanned({ sessionType: "strength" }), makeFatigue({ articular: 0.9 }), "pain");
    expect(substitute?.sessionType).toBe("recovery");
  });

  it("substitute session has all required fields", () => {
    const substitute = substituteSession(makePlanned({ sessionType: "strength" }), makeFatigue({ muscular: 0.9 }), "conflict");
    if (substitute) {
      expect(substitute).toHaveProperty("id");
      expect(substitute).toHaveProperty("sessionType");
      expect(substitute).toHaveProperty("templateName");
    }
  });
});

describe("reoptimizeMicrocycle", () => {
  const week = [
    makePlanned({ id:"ps1", sessionType:"strength", scheduledFor:"2026-04-14" }),
    makePlanned({ id:"ps2", sessionType:"endurance", scheduledFor:"2026-04-16" }),
    makePlanned({ id:"ps3", sessionType:"strength", scheduledFor:"2026-04-18" }),
  ];

  it("returns same number or fewer sessions (never adds sessions)", () => {
    const optimized = reoptimizeMicrocycle(week, makeFatigue({ global: 0.7 }));
    expect(optimized.length).toBeLessThanOrEqual(week.length);
  });

  it("never places two identical types back-to-back when fatigue is elevated", () => {
    const optimized = reoptimizeMicrocycle(week, makeFatigue({ global: 0.7 }));
    for (let i = 0; i < optimized.length - 1; i++) {
      if (optimized[i]?.sessionType === "strength" && optimized[i+1]?.sessionType === "strength") {
        // If two strength sessions are adjacent, fail
        expect(false).toBe(true);
      }
    }
  });

  it("returns original plan unchanged when fatigue is very low", () => {
    const optimized = reoptimizeMicrocycle(week, makeFatigue({ global: 0.1, muscular: 0.1, cardiovascular: 0.1, neural: 0.1, articular: 0.1 }));
    expect(optimized.map(s => s.id)).toEqual(week.map(s => s.id));
  });
});

describe("buildExplanation", () => {
  const baseArgs = {
    decisionState: "reduce_volume" as DecisionState,
    progressionAxis: null as null,
    patch: { volumeMultiplier: 0.8, intensityMultiplier: 1.0 },
    fatigue: makeFatigue({ global: 0.75 }),
    rulesFired: [{ ruleId: "fatigue_high", reasonCode: "FATIGUE_HIGH" }],
    algorithmVersion: "v2.0.0",
    configVersion: "cfg-1",
  };

  it("always returns a non-empty explanation", () => {
    const expl = buildExplanation(baseArgs);
    expect(expl).toBeTruthy();
    expect(expl.headline).toBeTruthy();
  });

  it("reasonsTop3 has exactly 3 entries", () => {
    const expl = buildExplanation(baseArgs);
    expect(expl.reasonsTop3.length).toBe(3);
  });

  it("each reason has code and text", () => {
    const expl = buildExplanation(baseArgs);
    for (const r of expl.reasonsTop3) {
      expect(r.code).toBeTruthy();
      expect(r.text).toBeTruthy();
      expect(typeof r.text).toBe("string");
    }
  });

  it("headline mentions reduction when decisionState is reduce_volume", () => {
    const expl = buildExplanation(baseArgs);
    expect(expl.headline.toLowerCase()).toMatch(/reduc|fatigue|volume|adjust/i);
  });

  it("works for all decision states without throwing", () => {
    const states: DecisionState[] = ["progress","maintain","reduce_volume","reduce_intensity","substitute","defer","deload_local","deload_global","rest"];
    for (const ds of states) {
      expect(() => buildExplanation({ ...baseArgs, decisionState: ds })).not.toThrow();
    }
  });

  it("signals array is present and non-empty", () => {
    const expl = buildExplanation(baseArgs);
    expect(Array.isArray(expl.signals)).toBe(true);
    expect(expl.signals.length).toBeGreaterThan(0);
  });
});
