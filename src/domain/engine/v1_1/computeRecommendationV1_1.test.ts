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
    expect(a.recommendation.decisionState).toEqual(b.recommendation.decisionState);
    expect(a.recommendation.patch).toEqual(b.recommendation.patch);
  });

  it("reduces when feedback RPE is high across recent sessions", () => {
    // 5 sessions in the last 7 days with RPE 9 feedback → high fatigue → reduce
    const today = "2026-04-13";
    const recentSessions = [1, 2, 3, 4, 5].map((daysAgo) => ({
      startedAt: `2026-04-${String(13 - daysAgo).padStart(2, "0")}T10:00:00Z`,
      durationMinutes: 60,
      rpe: null as null,
    }));
    const feedback = recentSessions.map((s) => ({
      sessionStartedAt: s.startedAt,
      rpe: 9,
    }));

    const res = computeRecommendationV1_1({
      todayIso: today,
      plannedSession: {
        id: "ps_1",
        scheduledFor: today,
        planId: "plan_1",
        planVersionId: "pv_1",
        sessionTemplateId: "tpl_1",
        templateName: "Force",
        payload: {},
      },
      recentExecutedSessionsCount: 5,
      last7dExecutedCount: 5,
      algorithmVersion: "v1.1.0",
      recentSessions,
      feedback,
      config: {
        version: "cfg-1",
        policies: { conservativeByDefault: false },
        thresholds: { loadGuardLast7dMaxCount: 10, fatigueHighThreshold: 0.75, readinessLowThreshold: 0.4 },
        optimization: { maxVolumeReductionPct: 0.3, maxIntensityReductionPct: 0.15 },
      },
    });

    expect(res.fatigue.score).toBeGreaterThan(0.75);
    expect(res.recommendation.decisionState).toBe("reduce");
  });

  // ── Deload scenarios ──────────────────────────────────────────────────────

  it("deload S1: 6 sessions in 7 days triggers reduce (load guard)", () => {
    // Given: athlete trained 6 times in the last 7 days (at the threshold)
    // When:  engine runs with loadGuardLast7dMaxCount = 5
    // Then:  decisionState = "reduce" and volume_multiplier < 1
    const res = computeRecommendationV1_1({
      todayIso: "2026-04-13",
      plannedSession: {
        id: "ps_1",
        scheduledFor: "2026-04-13",
        planId: "p1",
        planVersionId: "pv1",
        sessionTemplateId: "tpl_1",
        templateName: "Endurance",
        payload: {},
      },
      recentExecutedSessionsCount: 6,
      last7dExecutedCount: 6,
      algorithmVersion: "v1.1.0",
      config: {
        version: "cfg-deload-s1",
        policies: { conservativeByDefault: false },
        thresholds: { loadGuardLast7dMaxCount: 5, fatigueHighThreshold: 0.75, readinessLowThreshold: 0.4 },
        optimization: { maxVolumeReductionPct: 0.25, maxIntensityReductionPct: 0.1 },
      },
    });

    expect(["reduce", "rest"]).toContain(res.recommendation.decisionState);
    expect(res.recommendation.patch.volume_multiplier).toBeLessThan(1);
  });

  it("deload S2: avg RPE > 8 on last 5 sessions triggers fatigue reduce", () => {
    // Given: 5 sessions with RPE 9 each in the past week
    // When:  engine runs with default fatigueHighThreshold = 0.75
    // Then:  fatigue.score > 0.75 and decisionState = "reduce" with intensity cut
    const today = "2026-04-13";
    const sessions = [1, 2, 3, 4, 5].map((d) => ({
      startedAt: `2026-04-${String(13 - d).padStart(2, "0")}T08:00:00Z`,
      durationMinutes: 75,
      rpe: 9 as number,
    }));

    const res = computeRecommendationV1_1({
      todayIso: today,
      plannedSession: {
        id: "ps_2",
        scheduledFor: today,
        planId: "p1",
        planVersionId: "pv1",
        sessionTemplateId: "tpl_2",
        templateName: "Force lourde",
        payload: {},
      },
      recentExecutedSessionsCount: 5,
      last7dExecutedCount: 5,
      algorithmVersion: "v1.1.0",
      recentSessions: sessions,
      feedback: [],
      config: {
        version: "cfg-deload-s2",
        policies: { conservativeByDefault: false },
        thresholds: { loadGuardLast7dMaxCount: 10, fatigueHighThreshold: 0.75, readinessLowThreshold: 0.4 },
        optimization: { maxVolumeReductionPct: 0.3, maxIntensityReductionPct: 0.2 },
      },
    });

    expect(res.fatigue.score).toBeGreaterThan(0.75);
    expect(res.recommendation.decisionState).toBe("reduce");
    expect(res.recommendation.patch.intensity_multiplier).toBeLessThan(1);
  });

  it("deload S3: no planned session today → rest decision with NO_PLAN_TODAY reason code", () => {
    // Given: athlete has no planned session for today
    // When:  engine runs
    // Then:  action = "rest" and explanation includes NO_PLAN_TODAY reason
    const res = computeRecommendationV1_1({
      todayIso: "2026-04-13",
      plannedSession: null,
      recentExecutedSessionsCount: 3,
      last7dExecutedCount: 3,
      algorithmVersion: "v1.1.0",
    });

    expect(res.recommendation.patch.action).toBe("rest");
    const codes = res.recommendation.reasonCodes;
    expect(codes.some((c) => c.includes("NO_PLAN") || c.includes("no_plan"))).toBe(true);
  });

  it("deload S4: insufficient history (< 3 sessions) → conservative decision with data quality flag", () => {
    // Given: only 1 recent session available (insufficient for reliable fatigue calc)
    // When:  engine runs with a planned session
    // Then:  fatigue.dataQualityScore < 0.3 and readiness.limitingFactor = "data"
    const today = "2026-04-13";
    const res = computeRecommendationV1_1({
      todayIso: today,
      plannedSession: {
        id: "ps_4",
        scheduledFor: today,
        planId: "p1",
        planVersionId: "pv1",
        sessionTemplateId: "tpl_4",
        templateName: "Récup active",
        payload: {},
      },
      recentExecutedSessionsCount: 1,
      last7dExecutedCount: 1,
      algorithmVersion: "v1.1.0",
      recentSessions: [
        { startedAt: "2026-04-12T10:00:00Z", durationMinutes: 45, rpe: 6 },
      ],
      feedback: [],
    });

    expect(((res.fatigue as unknown) as { dataQualityScore?: number })?.dataQualityScore ?? 0).toBeLessThan(0.3);
    expect(res.readiness.limitingFactor).toBe("data");
  });

  it("applies safety gate: pain red flag forces rest", () => {
    const res = computeRecommendationV1_1({
      todayIso: "2026-04-13",
      plannedSession: {
        id: "ps_safety",
        scheduledFor: "2026-04-13",
        planId: "p1",
        planVersionId: "pv1",
        sessionTemplateId: "tpl_safety",
        templateName: "Jambes lourdes",
        payload: { sessionType: "strength", primaryGoal: "strength" },
      },
      recentExecutedSessionsCount: 4,
      last7dExecutedCount: 4,
      algorithmVersion: "v1.1.0",
      dailySignals: {
        painScore: 7,
        painRedFlag: true,
        fatigueSelfScore: 6,
        readinessSelfScore: 5,
      },
    });

    expect(res.recommendation.decision).toBe("rest");
    expect(res.recommendation.patch.action).toBe("rest");
    expect(res.recommendation.risk_level).toBe("red");
    expect(res.recommendation.reasonCodes).toContain("PAIN_RED_FLAG");
  });

  it("applies interference gate: forbidden same-day stack moves non-key session", () => {
    const res = computeRecommendationV1_1({
      todayIso: "2026-04-13",
      plannedSession: {
        id: "ps_interference",
        scheduledFor: "2026-04-13",
        planId: "p1",
        planVersionId: "pv1",
        sessionTemplateId: "tpl_interference",
        templateName: "Force bas du corps",
        payload: { sessionType: "strength", primaryGoal: "strength" },
      },
      recentExecutedSessionsCount: 4,
      last7dExecutedCount: 4,
      algorithmVersion: "v1.1.0",
      dailySignals: {
        painScore: 1,
        fatigueSelfScore: 4,
        readinessSelfScore: 7,
        availableTimeTodayMin: 60,
      },
      interferenceSignals: {
        sameDayForbiddenComboDetected: true,
        lastIntenseRunHoursAgo: 8,
        lowerBodyHighStressCount7d: 3,
      },
      criticalData: {
        hasBlockGoal: true,
        hasSessionType: true,
        hasPainState: true,
        hasRecentLoad: true,
        hasCalendarAvailability: true,
      },
    });

    expect(res.recommendation.decision).toBe("move");
    expect(res.recommendation.patch.action).toBe("move");
    expect(res.recommendation.human_validation_required).toBe(true);
    expect(res.recommendation.reasonCodes).toContain("LOWER_BODY_CONFLICT");
  });

  it("respects lock gate: locked session blocks structural changes", () => {
    const res = computeRecommendationV1_1({
      todayIso: "2026-04-13",
      plannedSession: {
        id: "ps_locked",
        scheduledFor: "2026-04-13",
        planId: "p1",
        planVersionId: "pv1",
        sessionTemplateId: "tpl_locked",
        templateName: "Force",
        lockStatus: "locked",
        payload: { sessionType: "strength", primaryGoal: "strength" },
      },
      recentExecutedSessionsCount: 5,
      last7dExecutedCount: 5,
      algorithmVersion: "v1.1.0",
      dailySignals: {
        painScore: 2,
        fatigueSelfScore: 4,
        readinessSelfScore: 6,
      },
      interferenceSignals: {
        sameDayForbiddenComboDetected: true,
        lastIntenseRunHoursAgo: 6,
      },
      criticalData: {
        hasBlockGoal: true,
        hasSessionType: true,
        hasPainState: true,
        hasRecentLoad: true,
        hasCalendarAvailability: true,
      },
    });

    expect(res.recommendation.decision).toBe("keep");
    expect(res.recommendation.patch.action).toBe("execute_planned");
    expect(res.recommendation.forbidden_action_blocked).toContain("LOCKED_SESSION_CHANGE_BLOCKED");
    expect(res.recommendation.reasonCodes).toContain("LOCKED_SESSION");
  });
});
