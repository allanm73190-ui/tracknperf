import type { FatigueState } from "../v1_1/types";

export type ExecutedSessionSummary = {
  startedAt: string; // ISO
  durationMinutes: number | null;
  rpe: number | null; // 1–10
};

export type SessionFeedback = {
  sessionStartedAt: string; // ISO
  rpe: number | null; // 1–10
};

export type FatigueSnapshot = FatigueState & {
  dataQualityScore: number; // 0..1
  algorithmVersion: string;
  computedAt: string; // ISO
};

function daysBetween(isoA: string, isoB: string): number {
  return Math.abs(new Date(isoA).getTime() - new Date(isoB).getTime()) / 86_400_000;
}

/**
 * Compute a FatigueSnapshot from recent executed sessions and feedback.
 *
 * Score = weighted average RPE (normalised to 0..1) over last 7 days.
 * More recent sessions get higher weight (linear decay).
 * Returns score 0.5 + dataQualityScore 0.1 when data is insufficient.
 */
export function computeFatigueSnapshot(
  recentSessions: ExecutedSessionSummary[],
  feedback: SessionFeedback[],
  opts: { todayIso?: string; algorithmVersion?: string } = {}
): FatigueSnapshot {
  const today = opts.todayIso ?? new Date().toISOString().slice(0, 10);
  const algorithmVersion = opts.algorithmVersion ?? "v1.1.0";
  const computedAt = new Date().toISOString();

  // Merge RPE data: feedback takes priority over session payload
  const feedbackByDate = new Map<string, number>();
  for (const f of feedback) {
    if (f.rpe !== null) {
      const day = f.sessionStartedAt.slice(0, 10);
      feedbackByDate.set(day, f.rpe);
    }
  }

  // Sessions within 7 days
  const relevant = recentSessions.filter((s) => daysBetween(s.startedAt.slice(0, 10), today) <= 7);

  if (relevant.length < 3) {
    return {
      score: 0.5,
      dimensions: { general: 0.5 },
      dataQualityScore: relevant.length === 0 ? 0.0 : 0.2,
      algorithmVersion,
      computedAt,
    };
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const s of relevant) {
    const daysAgo = daysBetween(s.startedAt.slice(0, 10), today);
    const weight = Math.max(0.1, 1 - daysAgo / 7);
    const day = s.startedAt.slice(0, 10);
    const rpe = feedbackByDate.has(day) ? feedbackByDate.get(day)! : s.rpe;
    if (rpe !== null) {
      weightedSum += (rpe / 10) * weight;
      totalWeight += weight;
    }
  }

  const score = totalWeight > 0 ? Math.max(0, Math.min(1, weightedSum / totalWeight)) : 0.5;
  const dataQualityScore = Math.min(1, relevant.length / 7);

  return {
    score,
    dimensions: { general: score },
    dataQualityScore,
    algorithmVersion,
    computedAt,
  };
}
