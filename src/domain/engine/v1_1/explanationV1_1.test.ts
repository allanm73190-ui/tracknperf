import { describe, expect, it } from "vitest";
import { computeRecommendationV1_1 } from "./computeRecommendationV1_1";

// E4-T06: Verify ExplanationV1_1 is fully populated in all cases.

const plannedSession = {
  id: "ps_1",
  scheduledFor: "2026-04-13",
  planId: "p1",
  planVersionId: "pv1",
  sessionTemplateId: "tpl_1",
  templateName: "Force",
  payload: {},
};

describe("ExplanationV1_1 completeness", () => {
  it("explanation.signals contains ≥ 3 entries with real numeric values", () => {
    const res = computeRecommendationV1_1({
      todayIso: "2026-04-13",
      plannedSession,
      recentExecutedSessionsCount: 3,
      last7dExecutedCount: 3,
      algorithmVersion: "v1.1.0",
      recentSessions: [
        { startedAt: "2026-04-12T10:00:00Z", durationMinutes: 60, rpe: 7 },
        { startedAt: "2026-04-11T10:00:00Z", durationMinutes: 55, rpe: 6 },
        { startedAt: "2026-04-10T10:00:00Z", durationMinutes: 50, rpe: 8 },
      ],
      feedback: [],
    });

    expect(res.explanation.signals.length).toBeGreaterThanOrEqual(3);
    for (const s of res.explanation.signals) {
      expect(typeof s.signalId).toBe("string");
      expect(s.normalizedValue).not.toBeNull();
      expect(typeof s.weight).toBe("number");
      expect(["up", "down", "neutral"]).toContain(s.direction);
    }
  });

  it("explanation.rulesFired lists triggered rules when fatigue is high", () => {
    const res = computeRecommendationV1_1({
      todayIso: "2026-04-13",
      plannedSession,
      recentExecutedSessionsCount: 5,
      last7dExecutedCount: 5,
      algorithmVersion: "v1.1.0",
      recentSessions: [1, 2, 3, 4, 5].map((d) => ({
        startedAt: `2026-04-${String(13 - d).padStart(2, "0")}T10:00:00Z`,
        durationMinutes: 60,
        rpe: 9,
      })),
      feedback: [],
      config: {
        version: "cfg-1",
        policies: { conservativeByDefault: false },
        thresholds: { loadGuardLast7dMaxCount: 10, fatigueHighThreshold: 0.75, readinessLowThreshold: 0.4 },
        optimization: { maxVolumeReductionPct: 0.3, maxIntensityReductionPct: 0.2 },
      },
    });

    expect(res.explanation.rulesFired.length).toBeGreaterThan(0);
    const rule = res.explanation.rulesFired[0];
    expect(typeof rule.ruleId).toBe("string");
    expect(rule.ruleVersion).toBe("1");
    expect(Array.isArray(rule.reasonCodes)).toBe(true);
    expect(rule.reasonCodes.length).toBeGreaterThan(0);
  });

  it("explanation.summary.reasonsTop3 always has exactly 3 entries", () => {
    // Case 1: rest (no planned session)
    const rest = computeRecommendationV1_1({
      todayIso: "2026-04-13",
      plannedSession: null,
      recentExecutedSessionsCount: 0,
      last7dExecutedCount: 0,
      algorithmVersion: "v1.1.0",
    });
    expect(rest.explanation.summary.reasonsTop3).toHaveLength(3);

    // Case 2: follow plan (normal)
    const follow = computeRecommendationV1_1({
      todayIso: "2026-04-13",
      plannedSession,
      recentExecutedSessionsCount: 2,
      last7dExecutedCount: 2,
      algorithmVersion: "v1.1.0",
    });
    expect(follow.explanation.summary.reasonsTop3).toHaveLength(3);

    for (const entry of [...rest.explanation.summary.reasonsTop3, ...follow.explanation.summary.reasonsTop3]) {
      expect(typeof entry.code).toBe("string");
      expect(typeof entry.text).toBe("string");
      expect(entry.text.length).toBeGreaterThan(0);
    }
  });
});
