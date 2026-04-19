import type {
  EngineInputs, LoadState, MultidimensionalFatigue, ReadinessState,
  DecisionState, ProgressionAxis, PainReport, ExecutedSessionRecord,
} from "../types/engine";
import { FATIGUE_WEIGHTS, FATIGUE_DECAY_DAYS, DATA_QUALITY_MIN_SESSIONS, defaultEngineConfig } from "./config";

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function daysBetween(isoA: string, isoB: string): number {
  return Math.abs(new Date(isoA).getTime() - new Date(isoB).getTime()) / 86_400_000;
}

export function normalizeInputs(inputs: EngineInputs): EngineInputs {
  return {
    ...inputs,
    history: {
      ...inputs.history,
      last7dCount: Math.max(0, Math.floor(inputs.history.last7dCount)),
      recentSessions: inputs.history.recentSessions,
    },
  };
}

export function computeLoadState(inputs: EngineInputs): LoadState {
  const last7d = inputs.history.last7dCount;
  const monotony = last7d / 7;
  return { last7dCount: last7d, monotonyProxy: monotony, strainProxy: last7d * monotony };
}

export function computeMultidimensionalFatigue(inputs: EngineInputs): MultidimensionalFatigue {
  const sessions = inputs.history.recentSessions;
  const today = inputs.today.date;
  const dataQualityScore = sessions.length < DATA_QUALITY_MIN_SESSIONS
    ? clamp01(sessions.length / DATA_QUALITY_MIN_SESSIONS * 0.28)
    : clamp01(0.3 + (sessions.length / 10) * 0.7);

  if (sessions.length === 0) {
    return { muscular: 0, cardiovascular: 0, neural: 0, articular: 0, global: 0, dataQualityScore };
  }

  let muscular = 0, cardiovascular = 0, neural = 0, articular = 0;

  for (const s of sessions) {
    const daysAgo = daysBetween(today + "T00:00:00Z", s.startedAt);
    const decay = Math.exp(-daysAgo / FATIGUE_DECAY_DAYS);
    const rpeNorm = clamp01((s.rpe - 1) / 9);
    const durationNorm = clamp01(s.durationMinutes / 120);
    const load = rpeNorm * durationNorm * decay;

    const w = FATIGUE_WEIGHTS;
    const st = s.sessionType as keyof typeof w.muscular;
    muscular      += load * (w.muscular[st]      ?? 0.2);
    cardiovascular+= load * (w.cardiovascular[st] ?? 0.2);
    neural        += load * (w.neural[st]         ?? 0.2);
    articular     += load * (w.articular[st]      ?? 0.2);
  }

  const scale = 1.5;
  muscular       = clamp01(muscular       * scale);
  cardiovascular = clamp01(cardiovascular * scale);
  neural         = clamp01(neural         * scale);
  articular      = clamp01(articular      * scale);
  const global   = clamp01((muscular * 0.35 + cardiovascular * 0.3 + neural * 0.25 + articular * 0.1));

  return { muscular, cardiovascular, neural, articular, global, dataQualityScore };
}

export function computeSessionSpecificReadiness(
  fatigue: MultidimensionalFatigue,
  sessionType: string
): ReadinessState {
  if (fatigue.dataQualityScore < 0.3) {
    return { score: 0.5, limitingFactor: "data" };
  }

  const relevantFatigue = sessionType === "strength"
    ? fatigue.muscular * 0.6 + fatigue.neural * 0.3 + fatigue.articular * 0.1
    : sessionType === "endurance"
    ? fatigue.cardiovascular * 0.6 + fatigue.muscular * 0.2 + fatigue.neural * 0.2
    : fatigue.global;

  const score = clamp01(1 - relevantFatigue * 0.95);

  let limitingFactor: ReadinessState["limitingFactor"] = "none";
  if (score < 0.4) {
    if (sessionType === "strength" && fatigue.muscular > 0.75) limitingFactor = "muscular";
    else if (sessionType === "endurance" && fatigue.cardiovascular > 0.75) limitingFactor = "cardiovascular";
    else if (fatigue.global > 0.7) limitingFactor = "fatigue";
  } else if (sessionType === "strength" && fatigue.muscular > 0.85) {
    limitingFactor = "muscular";
  } else if (sessionType === "endurance" && fatigue.cardiovascular > 0.85) {
    limitingFactor = "cardiovascular";
  }

  return { score, limitingFactor };
}

export function computeGoalAlignment(goals: string[], sessionType: string): number {
  if (sessionType === "mixed") return 0.6;
  if (sessionType === "recovery") return 0.3;
  if (goals.length === 0) return 0.5;

  const primary = goals[0];
  if (primary === sessionType || (primary === "hypertrophy" && sessionType === "strength")) return 1.0;

  const secondaryMatch = goals.slice(1).some(g => g === sessionType || (g === "hypertrophy" && sessionType === "strength"));
  if (secondaryMatch) return 0.65;

  return 0.2;
}

export function computeConflictScore(
  recentSessions: ExecutedSessionRecord[],
  plannedType: string
): number {
  if (recentSessions.length === 0) return 0;

  const sorted = [...recentSessions].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  let conflict = 0;
  for (let i = 0; i < Math.min(sorted.length, 3); i++) {
    const s = sorted[i];
    if (!s) continue;
    const daysAgo = daysBetween(new Date().toISOString(), s.startedAt);
    if (s.sessionType === plannedType && Math.floor(daysAgo) < 2) {
      conflict += (2 - Math.floor(daysAgo)) * 0.6;
    }
  }

  return clamp01(conflict);
}

export function computePainRisk(
  fatigue: MultidimensionalFatigue,
  painReports: PainReport[]
): number {
  let risk = fatigue.articular * 0.7;

  const recentPain = painReports.filter(p => {
    const daysAgo = daysBetween(new Date().toISOString(), p.reportedAt);
    return daysAgo < 7;
  });

  for (const p of recentPain) {
    risk += (p.severity / 5) * 0.3;
  }

  return clamp01(risk);
}

export function chooseDecisionState(args: {
  plannedSession: { id: string; sessionType: string } | null;
  fatigue: MultidimensionalFatigue;
  readiness: ReadinessState;
  goalAlignment: number;
  conflictScore: number;
  painRisk: number;
}): DecisionState {
  const cfg = defaultEngineConfig();
  const t = cfg.thresholds;

  if (!args.plannedSession) return "rest";
  if (args.painRisk >= t.painRiskCriticalThreshold) return "defer";
  if (args.fatigue.global >= t.fatigueGlobalCriticalThreshold) return "deload_global";
  if (args.conflictScore >= t.conflictHighThreshold) return "substitute";

  if (args.fatigue.global >= t.fatigueGlobalHighThreshold || args.readiness.score <= t.readinessLowThreshold) {
    return args.fatigue.muscular > args.fatigue.cardiovascular ? "reduce_volume" : "reduce_intensity";
  }

  if (args.readiness.score > 0.75 && args.fatigue.global < 0.4 && args.goalAlignment >= 0.8) {
    return "progress";
  }

  return "maintain";
}

export function chooseProgressionAxis(args: {
  decisionState: DecisionState;
  recentAxes: ProgressionAxis[];
  sessionType: string;
  goals: string[];
}): ProgressionAxis | null {
  const noProgressStates: DecisionState[] = [
    "reduce_volume", "reduce_intensity", "substitute", "defer",
    "deload_local", "deload_global", "rest",
  ];
  if (noProgressStates.includes(args.decisionState)) return null;

  const allAxes: ProgressionAxis[] = ["volume", "intensity", "density", "complexity"];
  const lastAxis = args.recentAxes[args.recentAxes.length - 1];
  const candidates = allAxes.filter(a => a !== lastAxis);

  // Strength goals → prefer volume then intensity; endurance → density then volume
  const preferred: ProgressionAxis[] = args.goals.includes("endurance")
    ? ["density", "volume", "intensity", "complexity"]
    : ["volume", "intensity", "density", "complexity"];

  return preferred.find(a => candidates.includes(a)) ?? candidates[0] ?? null;
}
