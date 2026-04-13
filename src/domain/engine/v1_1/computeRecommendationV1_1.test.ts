import { describe, expect, it } from "vitest";
import { computeRecommendationV1_1 } from "./computeRecommendationV1_1";

describe("computeRecommendationV1_1", () => {
  it("returns rest when no planned session", () => {
    const res = computeRecommendationV1_1({
      todayIso: "2026-04-13",
      plannedSession: null,
      recentExecutedSessionsCount: 0,
      last7dExecutedCount: 0,
      algorithmVersion: "v1.1.0",
    });
    expect(res.recommendation.patch.action).toBe("rest");
    expect(res.explanation.summary.reasonsTop3.length).toBe(3);
  });

  it("reduces when last7d exceeds guard", () => {
    const res = computeRecommendationV1_1({
      todayIso: "2026-04-13",
      plannedSession: {
        id: "ps_1",
        scheduledFor: "2026-04-13",
        planId: "plan_1",
        planVersionId: "pv_1",
        sessionTemplateId: "tpl_1",
        templateName: "Force",
        payload: {},
      },
      recentExecutedSessionsCount: 2,
      last7dExecutedCount: 10,
      algorithmVersion: "v1.1.0",
      config: {
        version: "cfg-1",
        policies: { conservativeByDefault: true },
        thresholds: { loadGuardLast7dMaxCount: 6, fatigueHighThreshold: 0.75, readinessLowThreshold: 0.4 },
        optimization: { maxVolumeReductionPct: 0.3, maxIntensityReductionPct: 0.15 },
      },
    });
    expect(res.recommendation.decisionState).toBe("reduce");
    expect(res.recommendation.patch.volume_multiplier).toBeLessThan(1);
  });

  it("is deterministic for same inputs/config", () => {
    const args = {
      todayIso: "2026-04-13",
      plannedSession: null,
      recentExecutedSessionsCount: 1,
      last7dExecutedCount: 1,
      algorithmVersion: "v1.1.0",
      config: { version: "cfg-1" },
    } as const;

    const a = computeRecommendationV1_1(args);
    const b = computeRecommendationV1_1(args);
    expect(a).toEqual(b);
  });
});

