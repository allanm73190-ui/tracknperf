import { describe, expect, it } from "vitest";
import { computeRecommendationV1 } from "./computeRecommendationV1";
import type { EngineInput } from "./types";

describe("computeRecommendationV1", () => {
  it("recommends follow_plan when planned session exists", () => {
    const input: EngineInput = {
      todayIso: "2026-04-13",
      plannedSession: {
        id: "ps_1",
        scheduledFor: "2026-04-13",
        planId: "plan_1",
        planVersionId: null,
        sessionTemplateId: "tpl_1",
        templateName: "Force",
        payload: {},
      },
      recentExecutedSessionsCount: 0,
    };
    const res = computeRecommendationV1(input);
    expect(res.output.kind).toBe("follow_plan");
    expect(res.output.plannedSessionId).toBe("ps_1");
    expect(res.explanation.summary.reasonsTop3).toHaveLength(3);
  });

  it("recommends rest when no planned session exists", () => {
    const input: EngineInput = {
      todayIso: "2026-04-13",
      plannedSession: null,
      recentExecutedSessionsCount: 0,
    };
    const res = computeRecommendationV1(input);
    expect(res.output.kind).toBe("rest");
    expect(res.explanation.summary.headline.toLowerCase()).toContain("rest");
  });

  it("is deterministic for same inputs", () => {
    const input: EngineInput = {
      todayIso: "2026-04-13",
      plannedSession: null,
      recentExecutedSessionsCount: 2,
    };
    const a = computeRecommendationV1(input);
    const b = computeRecommendationV1(input);
    expect(a).toEqual(b);
  });
});

