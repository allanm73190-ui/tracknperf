import { enqueueSyncOp } from "../../infra/offline/db";
import { flushSyncQueue } from "../sync/syncClient";
import type { SessionMode } from "../../domain/session/sessionMode";

type ExecutedSetInput = {
  setIndex: number;
  reps: number | null;
  loadKg: number | null;
  rpe: number | null;
  rir: number | null;
  restSeconds: number | null;
  completed?: boolean;
  payload?: Record<string, unknown>;
};

type ExecutedExerciseInput = {
  sessionTemplateExerciseId: string | null;
  plannedSessionItemLiveId: string | null;
  position: number;
  exerciseName: string;
  notes: string | null;
  sets: ExecutedSetInput[];
  payload?: Record<string, unknown>;
};

export type EnduranceMetricsInput = {
  durationMinutes: number | null;
  distanceKm: number | null;
  elevationGainM: number | null;
  avgHr: number | null;
  rpe: number | null;
  notes: string | null;
};

export type LogExecutedSessionDetailedInput = {
  plannedSessionId: string;
  planId: string;
  startedAt: Date;
  endedAt: Date;
  sessionMode?: SessionMode;
  notes: string | null;
  sessionPainScore?: number | null;
  exercises: ExecutedExerciseInput[];
  enduranceMetrics?: EnduranceMetricsInput;
};

export type ExecutedSessionMetrics = {
  sessionMode: SessionMode;
  totalExercises: number;
  totalSets: number;
  totalReps: number;
  tonnageKg: number;
  avgRpe: number | null;
  durationMinutes: number;
  runDistanceKm: number | null;
  runLoad: number | null;
  avgPaceSecPerKm: number | null;
  elevationGainM: number | null;
  avgHr: number | null;
  trainingLoad: number;
  volumeScore: number;
  intensityScore: number | null;
  strainScore: number;
  avgPainScore: number | null;
  computedAt: string;
};

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function toNullableFinite(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function toNullablePainScore(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 10) return round2(v);
  if (typeof v === "string") {
    const parsed = Number(v.trim().replace(",", "."));
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 10) return round2(parsed);
  }
  return null;
}

function hasEnduranceSignal(endurance: EnduranceMetricsInput | undefined): boolean {
  if (!endurance) return false;
  return [
    endurance.durationMinutes,
    endurance.distanceKm,
    endurance.elevationGainM,
    endurance.avgHr,
    endurance.rpe,
    endurance.notes,
  ].some((v) => {
    if (typeof v === "number") return Number.isFinite(v);
    return typeof v === "string" && v.trim().length > 0;
  });
}

function inferFallbackMode(input: LogExecutedSessionDetailedInput): SessionMode {
  if (input.sessionMode) return input.sessionMode;
  const hasExercises = Array.isArray(input.exercises) && input.exercises.length > 0;
  const hasEndurance = hasEnduranceSignal(input.enduranceMetrics);
  if (hasExercises && hasEndurance) return "mixed";
  if (hasExercises) return "strength";
  if (hasEndurance) return "endurance";
  return "mixed";
}

function computeSessionMetrics(args: {
  sessionMode: SessionMode;
  durationMinutes: number;
  exercises: ExecutedExerciseInput[];
  endurance: EnduranceMetricsInput | undefined;
  sessionPainScore: number | null | undefined;
}): ExecutedSessionMetrics {
  let totalSets = 0;
  let totalReps = 0;
  let tonnageKg = 0;
  let rpeCount = 0;
  let rpeSum = 0;
  const painValues: number[] = [];

  const sessionPain = toNullablePainScore(args.sessionPainScore);
  if (sessionPain !== null) painValues.push(sessionPain);

  for (const ex of args.exercises) {
    const exPain = toNullablePainScore(ex.payload?.painScore);
    if (exPain !== null) painValues.push(exPain);

    for (const set of ex.sets) {
      if (set.completed === false) continue;
      totalSets += 1;
      if (typeof set.reps === "number" && Number.isFinite(set.reps) && set.reps > 0) {
        totalReps += set.reps;
        if (typeof set.loadKg === "number" && Number.isFinite(set.loadKg) && set.loadKg > 0) {
          tonnageKg += set.reps * set.loadKg;
        }
      }
      if (typeof set.rpe === "number" && Number.isFinite(set.rpe)) {
        rpeCount += 1;
        rpeSum += set.rpe;
      }
      const setPain = toNullablePainScore(set.payload?.painScore);
      if (setPain !== null) painValues.push(setPain);
    }
  }

  const avgRpeStrength = rpeCount > 0 ? round2(rpeSum / rpeCount) : null;

  const enduranceDuration =
    toNullableFinite(args.endurance?.durationMinutes) ??
    (["endurance", "mixed", "recovery"].includes(args.sessionMode) ? args.durationMinutes : null);
  const runDistanceKm = toNullableFinite(args.endurance?.distanceKm);
  const elevationGainM = toNullableFinite(args.endurance?.elevationGainM);
  const avgHr = toNullableFinite(args.endurance?.avgHr);
  const enduranceRpe = toNullableFinite(args.endurance?.rpe);

  const avgPaceSecPerKm =
    enduranceDuration !== null &&
    runDistanceKm !== null &&
    runDistanceKm > 0
      ? round2((enduranceDuration * 60) / runDistanceKm)
      : null;

  const runLoad =
    enduranceDuration !== null && enduranceRpe !== null
      ? round2(enduranceDuration * enduranceRpe)
      : null;

  const avgRpe = enduranceRpe ?? avgRpeStrength;

  const volumeStrength = clamp01(tonnageKg / 5000);
  const volumeEndurance = clamp01((enduranceDuration ?? 0) / 120 + (runDistanceKm ?? 0) / 20);
  const volumeScore = round2(clamp01(Math.max(volumeStrength, volumeEndurance)));

  const intensityScore = avgRpe === null ? null : round2(clamp01(avgRpe / 10));

  const trainingLoad = round2((runLoad ?? 0) + tonnageKg / 100);

  const strainBase = volumeScore * (intensityScore ?? 0.5);
  const strainWithLoad = clamp01(strainBase + Math.min(0.4, trainingLoad / 500));
  const strainScore = round2(strainWithLoad);
  const avgPainScore =
    painValues.length > 0 ? round2(painValues.reduce((acc, value) => acc + value, 0) / painValues.length) : null;

  return {
    sessionMode: args.sessionMode,
    totalExercises: args.exercises.length,
    totalSets,
    totalReps,
    tonnageKg: round2(tonnageKg),
    avgRpe,
    durationMinutes: args.durationMinutes,
    runDistanceKm,
    runLoad,
    avgPaceSecPerKm,
    elevationGainM,
    avgHr,
    trainingLoad,
    volumeScore,
    intensityScore,
    strainScore,
    avgPainScore,
    computedAt: new Date().toISOString(),
  };
}

function assertValidDate(label: string, value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${label} must be a valid Date.`);
  }
}

export async function logExecutedSessionDetailed(
  input: LogExecutedSessionDetailedInput,
): Promise<{ id: string; metrics: ExecutedSessionMetrics }> {
  if (!input.plannedSessionId) throw new Error("plannedSessionId is required.");
  if (!input.planId) throw new Error("planId is required.");
  assertValidDate("startedAt", input.startedAt);
  assertValidDate("endedAt", input.endedAt);
  if (input.endedAt.getTime() < input.startedAt.getTime()) {
    throw new Error("endedAt must be after startedAt.");
  }
  const sessionPainScore = toNullablePainScore(input.sessionPainScore);
  if (input.sessionPainScore !== undefined && input.sessionPainScore !== null && sessionPainScore === null) {
    throw new Error("La douleur de séance doit être comprise entre 0 et 10.");
  }

  const sessionMode = inferFallbackMode(input);
  const hasExercises = Array.isArray(input.exercises) && input.exercises.length > 0;
  const hasEndurance = hasEnduranceSignal(input.enduranceMetrics);
  if (sessionMode === "strength" && !hasExercises) {
    throw new Error("Au moins un exercice est requis pour une séance force.");
  }
  if (sessionMode === "mixed" && !hasExercises && !hasEndurance) {
    throw new Error("Une séance hybride requiert des exercices, un bloc endurance, ou les deux.");
  }
  if (["endurance", "recovery", "rest"].includes(sessionMode) && !hasExercises && !hasEndurance) {
    throw new Error("Renseignez au moins la durée, le RPE, ou une note pour cette séance.");
  }

  const executedSessionId = crypto.randomUUID();
  const durationMinutes = Math.round((input.endedAt.getTime() - input.startedAt.getTime()) / 60000);

  const metrics = computeSessionMetrics({
    sessionMode,
    durationMinutes,
    exercises: input.exercises,
    endurance: input.enduranceMetrics,
    sessionPainScore,
  });

  const globalPayload: Record<string, unknown> = {
    sessionMode,
    sessionType: sessionMode,
    durationMinutes,
    rpe: metrics.avgRpe,
    notes: input.notes,
    sessionPainScore,
    avgPainScore: metrics.avgPainScore,
    totalExercises: metrics.totalExercises,
    totalSets: metrics.totalSets,
    totalReps: metrics.totalReps,
    tonnageKg: metrics.tonnageKg,
    runDistanceKm: metrics.runDistanceKm,
    runLoad: metrics.runLoad,
    avgPaceSecPerKm: metrics.avgPaceSecPerKm,
    elevationGainM: metrics.elevationGainM,
    avgHr: metrics.avgHr,
    trainingLoad: metrics.trainingLoad,
    volumeScore: metrics.volumeScore,
    intensityScore: metrics.intensityScore,
    strainScore: metrics.strainScore,
    endurance: input.enduranceMetrics ?? {},
  };

  const enqueue = async (entity: string, payload: Record<string, unknown>) => {
    const opId = crypto.randomUUID();
    await enqueueSyncOp({
      opId,
      idempotencyKey: opId,
      opType: "insert",
      entity,
      payload,
    });
  };

  await enqueue("executed_sessions", {
    id: executedSessionId,
    planned_session_id: input.plannedSessionId,
    plan_id: input.planId,
    started_at: input.startedAt.toISOString(),
    ended_at: input.endedAt.toISOString(),
    payload: globalPayload,
  });

  for (const exercise of input.exercises) {
    const executedExerciseId = crypto.randomUUID();
    await enqueue("executed_session_exercises", {
      id: executedExerciseId,
      executed_session_id: executedSessionId,
      session_template_exercise_id: exercise.sessionTemplateExerciseId,
      planned_session_item_live_id: exercise.plannedSessionItemLiveId,
      position: exercise.position,
      exercise_name_snapshot: exercise.exerciseName,
      notes: exercise.notes,
      payload: exercise.payload ?? {},
    });

    for (const set of exercise.sets) {
      await enqueue("executed_session_sets", {
        id: crypto.randomUUID(),
        executed_session_exercise_id: executedExerciseId,
        set_index: set.setIndex,
        reps: set.reps,
        load_kg: set.loadKg,
        rpe: set.rpe,
        rir: set.rir,
        rest_seconds: set.restSeconds,
        completed: set.completed !== false,
        payload: set.payload ?? {},
      });
    }
  }

  await enqueue("executed_session_metrics", {
    executed_session_id: executedSessionId,
    total_exercises: metrics.totalExercises,
    total_sets: metrics.totalSets,
    total_reps: metrics.totalReps,
    tonnage_kg: metrics.tonnageKg,
    avg_rpe: metrics.avgRpe,
    volume_score: metrics.volumeScore,
    intensity_score: metrics.intensityScore,
    strain_score: metrics.strainScore,
    computed_at: metrics.computedAt,
    payload: {
      session_mode: metrics.sessionMode,
      duration_minutes: metrics.durationMinutes,
      run_distance_km: metrics.runDistanceKm,
      run_load: metrics.runLoad,
      avg_pace_sec_per_km: metrics.avgPaceSecPerKm,
      elevation_gain_m: metrics.elevationGainM,
      training_load: metrics.trainingLoad,
      avg_hr: metrics.avgHr,
      avg_pain_score: metrics.avgPainScore,
      session_pain_score: sessionPainScore,
    },
  });

  const feedbackRating = metrics.avgRpe !== null ? Math.round(metrics.avgRpe) : null;
  await enqueue("session_feedback", {
    id: crypto.randomUUID(),
    executed_session_id: executedSessionId,
    rating: feedbackRating,
    soreness: metrics.avgPainScore !== null ? Math.round(metrics.avgPainScore) : null,
    notes: input.notes,
    payload: {
      source: "planned_session_detailed",
      sessionMode,
      avgPainScore: metrics.avgPainScore,
      sessionPainScore,
      totalSets: metrics.totalSets,
      tonnageKg: metrics.tonnageKg,
      runLoad: metrics.runLoad,
      trainingLoad: metrics.trainingLoad,
    },
  });

  try {
    await flushSyncQueue();
  } catch {
    // Keep detailed logging usable offline.
  }

  return { id: executedSessionId, metrics };
}
