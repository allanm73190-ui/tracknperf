import { describe, expect, it } from "vitest";
import { computeReadinessSnapshot } from "./computeReadinessSnapshot";
import type { FatigueSnapshot } from "../fatigue/computeFatigueSnapshot";

function fatigue(score: number, dataQualityScore: number): FatigueSnapshot {
  return {
    score,
    dimensions: { general: score },
    dataQualityScore,
    algorithmVersion: "v1.1.0",
    computedAt: new Date().toISOString(),
  };
}

describe("computeReadinessSnapshot", () => {
  it("high fatigue → low readiness + limitingFactor fatigue", () => {
    const result = computeReadinessSnapshot(fatigue(0.85, 0.9));
    expect(result.score).toBeCloseTo(0.15, 2);
    expect(result.limitingFactor).toBe("fatigue");
  });

  it("low fatigue → high readiness + no limiting factor", () => {
    const result = computeReadinessSnapshot(fatigue(0.2, 0.8));
    expect(result.score).toBeCloseTo(0.8, 2);
    expect(result.limitingFactor).toBe("none");
  });

  it("poor data quality → limitingFactor data regardless of fatigue score", () => {
    const result = computeReadinessSnapshot(fatigue(0.3, 0.1));
    expect(result.limitingFactor).toBe("data");
  });
});
