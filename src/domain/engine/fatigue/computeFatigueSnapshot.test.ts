import { describe, expect, it } from "vitest";
import { computeFatigueSnapshot } from "./computeFatigueSnapshot";
import type { ExecutedSessionSummary, SessionFeedback } from "./computeFatigueSnapshot";

const TODAY = "2026-04-14";

function session(daysAgo: number, rpe: number | null = 7): ExecutedSessionSummary {
  const d = new Date("2026-04-14");
  d.setDate(d.getDate() - daysAgo);
  return { startedAt: d.toISOString(), durationMinutes: 60, rpe };
}

describe("computeFatigueSnapshot", () => {
  it("returns neutral score + low quality when no data", () => {
    const result = computeFatigueSnapshot([], [], { todayIso: TODAY });
    expect(result.score).toBe(0.5);
    expect(result.dataQualityScore).toBe(0.0);
    expect(result.dimensions.general).toBe(0.5);
  });

  it("returns score 0.5 + low quality when fewer than 3 sessions", () => {
    const result = computeFatigueSnapshot([session(1, 8), session(3, 6)], [], { todayIso: TODAY });
    expect(result.score).toBe(0.5);
    expect(result.dataQualityScore).toBe(0.2);
  });

  it("computes weighted average RPE with full data", () => {
    // 7 sessions with RPE 8 → score ~0.8
    const sessions = [0, 1, 2, 3, 4, 5, 6].map((d) => session(d, 8));
    const result = computeFatigueSnapshot(sessions, [], { todayIso: TODAY });
    expect(result.score).toBeCloseTo(0.8, 1);
    expect(result.dataQualityScore).toBe(1.0);
    expect(result.dimensions.general).toBeCloseTo(result.score, 5);
  });

  it("feedback RPE overrides session RPE for the same day", () => {
    const sessions = [0, 1, 2, 3, 4, 5, 6].map((d) => session(d, 5));
    const feedback: SessionFeedback[] = [
      { sessionStartedAt: sessions[0].startedAt, rpe: 9 },
    ];
    const withFeedback = computeFatigueSnapshot(sessions, feedback, { todayIso: TODAY });
    const withoutFeedback = computeFatigueSnapshot(sessions, [], { todayIso: TODAY });
    // Feedback RPE 9 > session RPE 5, so score should be higher
    expect(withFeedback.score).toBeGreaterThan(withoutFeedback.score);
  });
});
