import { enqueueSyncOp } from "../../infra/offline/db";
import { flushSyncQueue } from "../sync/syncClient";

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
  position: number;
  exerciseName: string;
  notes: string | null;
  sets: ExecutedSetInput[];
  payload?: Record<string, unknown>;
};

export type LogExecutedSessionDetailedInput = {
  plannedSessionId: string;
  planId: string;
  startedAt: Date;
  endedAt: Date;
  notes: string | null;
  exercises: ExecutedExerciseInput[];
};

export type ExecutedSessionMetrics = {
  totalExercises: number;
  totalSets: number;
  totalReps: number;
  tonnageKg: number;
  avgRpe: number | null;
  volumeScore: number;
  intensityScore: number | null;
  strainScore: number;
  computedAt: string;
};

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function computeSessionMetrics(exercises: ExecutedExerciseInput[]): ExecutedSessionMetrics {
  let totalSets = 0;
  let totalReps = 0;
  let tonnageKg = 0;
  let rpeCount = 0;
  let rpeSum = 0;

  for (const ex of exercises) {
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
    }
  }

  const avgRpe = rpeCount > 0 ? round2(rpeSum / rpeCount) : null;
  const volumeScore = clamp01(tonnageKg / 5000);
  const intensityScore = avgRpe === null ? null : clamp01(avgRpe / 10);
  const strainScore = clamp01(volumeScore * (intensityScore ?? 0.5));

  return {
    totalExercises: exercises.length,
    totalSets,
    totalReps,
    tonnageKg: round2(tonnageKg),
    avgRpe,
    volumeScore: round2(volumeScore),
    intensityScore: intensityScore === null ? null : round2(intensityScore),
    strainScore: round2(strainScore),
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
  if (!Array.isArray(input.exercises) || input.exercises.length === 0) {
    throw new Error("At least one exercise is required.");
  }

  const metrics = computeSessionMetrics(input.exercises);
  const executedSessionId = crypto.randomUUID();

  const durationMinutes = Math.round((input.endedAt.getTime() - input.startedAt.getTime()) / 60000);
  const globalPayload: Record<string, unknown> = {
    durationMinutes,
    rpe: metrics.avgRpe,
    notes: input.notes,
    totalExercises: metrics.totalExercises,
    totalSets: metrics.totalSets,
    totalReps: metrics.totalReps,
    tonnageKg: metrics.tonnageKg,
    volumeScore: metrics.volumeScore,
    intensityScore: metrics.intensityScore,
    strainScore: metrics.strainScore,
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
    payload: {},
  });

  await enqueue("session_feedback", {
    executed_session_id: executedSessionId,
    rating: metrics.avgRpe !== null ? Math.round(metrics.avgRpe) : null,
    soreness: null,
    notes: input.notes,
    payload: {
      source: "planned_session_detailed",
      totalSets: metrics.totalSets,
      tonnageKg: metrics.tonnageKg,
    },
  });

  try {
    await flushSyncQueue();
  } catch {
    // Keep detailed logging usable offline.
  }

  return { id: executedSessionId, metrics };
}
