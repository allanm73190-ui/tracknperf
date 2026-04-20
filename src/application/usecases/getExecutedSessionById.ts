import { supabase } from "../../infra/supabase/client";

export type ExecutedSessionSetDetail = {
  id: string;
  setIndex: number;
  reps: number | null;
  loadKg: number | null;
  rpe: number | null;
  rir: number | null;
  restSeconds: number | null;
  completed: boolean;
  payload: Record<string, unknown>;
};

export type ExecutedSessionExerciseDetail = {
  id: string;
  position: number;
  sessionTemplateExerciseId: string | null;
  exerciseName: string;
  notes: string | null;
  payload: Record<string, unknown>;
  sets: ExecutedSessionSetDetail[];
};

export type ExecutedSessionComputedMetrics = {
  totalExercises: number;
  totalSets: number;
  totalReps: number;
  tonnageKg: number;
  avgRpe: number | null;
  volumeScore: number | null;
  intensityScore: number | null;
  strainScore: number | null;
  computedAt: string | null;
  payload: Record<string, unknown>;
};

export type ExecutedSessionDetail = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  plannedSessionId: string | null;
  recommendationId: string | null;
  planId: string | null;
  payload: Record<string, unknown>;
  exercises: ExecutedSessionExerciseDetail[];
  metrics: ExecutedSessionComputedMetrics | null;
};

function toNullableNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toNumber(v: unknown, fallback = 0): number {
  const n = toNullableNumber(v);
  return n === null ? fallback : n;
}

export async function getExecutedSessionById(sessionId: string): Promise<ExecutedSessionDetail | null> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("executed_sessions")
    .select("id, started_at, ended_at, planned_session_id, recommendation_id, plan_id, payload")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const [{ data: metricsRow, error: metricsErr }, { data: exerciseRows, error: exerciseErr }] = await Promise.all([
    supabase
      .from("executed_session_metrics")
      .select(`
        executed_session_id,
        total_exercises,
        total_sets,
        total_reps,
        tonnage_kg,
        avg_rpe,
        volume_score,
        intensity_score,
        strain_score,
        computed_at,
        payload
      `)
      .eq("executed_session_id", sessionId)
      .maybeSingle(),
    supabase
      .from("executed_session_exercises")
      .select(`
        id,
        session_template_exercise_id,
        position,
        exercise_name_snapshot,
        notes,
        payload
      `)
      .eq("executed_session_id", sessionId)
      .order("position", { ascending: true }),
  ]);
  if (metricsErr) throw new Error(metricsErr.message);
  if (exerciseErr) throw new Error(exerciseErr.message);

  const exerciseIds = (exerciseRows ?? []).map((row) => String(row.id));
  let setsByExerciseId = new Map<string, ExecutedSessionSetDetail[]>();
  if (exerciseIds.length > 0) {
    const { data: setRows, error: setErr } = await supabase
      .from("executed_session_sets")
      .select(`
        id,
        executed_session_exercise_id,
        set_index,
        reps,
        load_kg,
        rpe,
        rir,
        rest_seconds,
        completed,
        payload
      `)
      .in("executed_session_exercise_id", exerciseIds)
      .order("set_index", { ascending: true });
    if (setErr) throw new Error(setErr.message);

    setsByExerciseId = (setRows ?? []).reduce((acc, row) => {
      const exerciseId = String(row.executed_session_exercise_id);
      const current = acc.get(exerciseId) ?? [];
      current.push({
        id: String(row.id),
        setIndex: Math.max(1, Math.trunc(toNumber(row.set_index, 1))),
        reps: toNullableNumber(row.reps),
        loadKg: toNullableNumber(row.load_kg),
        rpe: toNullableNumber(row.rpe),
        rir: toNullableNumber(row.rir),
        restSeconds: toNullableNumber(row.rest_seconds),
        completed: row.completed !== false,
        payload: row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {},
      });
      acc.set(exerciseId, current);
      return acc;
    }, new Map<string, ExecutedSessionSetDetail[]>());
  }

  const exercises: ExecutedSessionExerciseDetail[] = (exerciseRows ?? []).map((row) => ({
    id: String(row.id),
    position: Math.max(1, Math.trunc(toNumber(row.position, 1))),
    sessionTemplateExerciseId: row.session_template_exercise_id ? String(row.session_template_exercise_id) : null,
    exerciseName: String(row.exercise_name_snapshot ?? "Exercice"),
    notes: row.notes ? String(row.notes) : null,
    payload: row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {},
    sets: setsByExerciseId.get(String(row.id)) ?? [],
  }));

  const metrics: ExecutedSessionComputedMetrics | null = metricsRow
    ? {
        totalExercises: Math.max(0, Math.trunc(toNumber(metricsRow.total_exercises, 0))),
        totalSets: Math.max(0, Math.trunc(toNumber(metricsRow.total_sets, 0))),
        totalReps: Math.max(0, Math.trunc(toNumber(metricsRow.total_reps, 0))),
        tonnageKg: toNumber(metricsRow.tonnage_kg, 0),
        avgRpe: toNullableNumber(metricsRow.avg_rpe),
        volumeScore: toNullableNumber(metricsRow.volume_score),
        intensityScore: toNullableNumber(metricsRow.intensity_score),
        strainScore: toNullableNumber(metricsRow.strain_score),
        computedAt: metricsRow.computed_at ? String(metricsRow.computed_at) : null,
        payload:
          metricsRow.payload && typeof metricsRow.payload === "object"
            ? (metricsRow.payload as Record<string, unknown>)
            : {},
      }
    : null;

  return {
    id: String(data.id),
    startedAt: String(data.started_at),
    endedAt: data.ended_at ? String(data.ended_at) : null,
    plannedSessionId: data.planned_session_id ? String(data.planned_session_id) : null,
    recommendationId: data.recommendation_id ? String(data.recommendation_id) : null,
    planId: data.plan_id ? String(data.plan_id) : null,
    payload: data.payload && typeof data.payload === "object" ? (data.payload as Record<string, unknown>) : {},
    exercises,
    metrics,
  };
}
