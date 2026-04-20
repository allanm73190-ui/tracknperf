import { supabase } from "../../infra/supabase/client";

export type PlannedSessionTemplateExercise = {
  id: string;
  sessionTemplateExerciseId: string | null;
  position: number;
  exerciseName: string;
  seriesRaw: string | null;
  repsRaw: string | null;
  loadRaw: string | null;
  tempoRaw: string | null;
  restRaw: string | null;
  rirRaw: string | null;
  coachNotes: string | null;
  payload: Record<string, unknown>;
};

export type PlannedSessionDetail = {
  id: string;
  scheduledFor: string;
  planId: string;
  planVersionId: string | null;
  sessionTemplateId: string | null;
  templateName: string | null;
  templatePayload: Record<string, unknown>;
  templateDescription: string | null;
  payload: Record<string, unknown>;
  templateExercises: PlannedSessionTemplateExercise[];
};

export async function getPlannedSessionById(id: string): Promise<PlannedSessionDetail | null> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("planned_sessions")
    .select(`
      id,
      scheduled_for,
      plan_id,
      plan_version_id,
      session_template_id,
      payload,
      session_templates:session_template_id ( name, template )
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const tpl = data.session_templates as { name?: unknown; template?: unknown } | null;
  const sessionTemplateId = data.session_template_id ? String(data.session_template_id) : null;
  let templateExercises: PlannedSessionTemplateExercise[] = [];
  const { data: snapshotRows, error: snapshotErr } = await supabase
    .from("planned_session_items_snapshot")
    .select(`
      id,
      session_template_exercise_id,
      position,
      exercise_name,
      series_raw,
      reps_raw,
      load_raw,
      tempo_raw,
      rest_raw,
      rir_raw,
      coach_notes,
      payload
    `)
    .eq("planned_session_id", id)
    .order("position", { ascending: true });
  if (snapshotErr) {
    const lower = snapshotErr.message.toLowerCase();
    const missingSnapshotTable = lower.includes("planned_session_items_snapshot");
    if (!missingSnapshotTable) throw new Error(snapshotErr.message);
  }

  if (!snapshotErr && snapshotRows && snapshotRows.length > 0) {
    templateExercises = snapshotRows.map((row) => ({
      id: String(row.id),
      sessionTemplateExerciseId:
        row.session_template_exercise_id !== null && row.session_template_exercise_id !== undefined
          ? String(row.session_template_exercise_id)
          : null,
      position: Number(row.position ?? 0),
      exerciseName: String(row.exercise_name ?? "Exercice"),
      seriesRaw: row.series_raw !== null && row.series_raw !== undefined ? String(row.series_raw) : null,
      repsRaw: row.reps_raw !== null && row.reps_raw !== undefined ? String(row.reps_raw) : null,
      loadRaw: row.load_raw !== null && row.load_raw !== undefined ? String(row.load_raw) : null,
      tempoRaw: row.tempo_raw !== null && row.tempo_raw !== undefined ? String(row.tempo_raw) : null,
      restRaw: row.rest_raw !== null && row.rest_raw !== undefined ? String(row.rest_raw) : null,
      rirRaw: row.rir_raw !== null && row.rir_raw !== undefined ? String(row.rir_raw) : null,
      coachNotes: row.coach_notes !== null && row.coach_notes !== undefined ? String(row.coach_notes) : null,
      payload: row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {},
    }));
  } else if (sessionTemplateId) {
    const { data: exRows, error: exErr } = await supabase
      .from("session_template_exercises")
      .select(`
        id,
        position,
        exercise_name,
        series_raw,
        reps_raw,
        load_raw,
        tempo_raw,
        rest_raw,
        rir_raw,
        coach_notes,
        payload
      `)
      .eq("session_template_id", sessionTemplateId)
      .order("position", { ascending: true });
    if (exErr) throw new Error(exErr.message);
    templateExercises = (exRows ?? []).map((row) => ({
      id: String(row.id),
      sessionTemplateExerciseId: String(row.id),
      position: Number(row.position ?? 0),
      exerciseName: String(row.exercise_name ?? "Exercice"),
      seriesRaw: row.series_raw !== null && row.series_raw !== undefined ? String(row.series_raw) : null,
      repsRaw: row.reps_raw !== null && row.reps_raw !== undefined ? String(row.reps_raw) : null,
      loadRaw: row.load_raw !== null && row.load_raw !== undefined ? String(row.load_raw) : null,
      tempoRaw: row.tempo_raw !== null && row.tempo_raw !== undefined ? String(row.tempo_raw) : null,
      restRaw: row.rest_raw !== null && row.rest_raw !== undefined ? String(row.rest_raw) : null,
      rirRaw: row.rir_raw !== null && row.rir_raw !== undefined ? String(row.rir_raw) : null,
      coachNotes: row.coach_notes !== null && row.coach_notes !== undefined ? String(row.coach_notes) : null,
      payload: row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {},
    }));
  }

  return {
    id: String(data.id),
    scheduledFor: String(data.scheduled_for),
    planId: String(data.plan_id),
    planVersionId: data.plan_version_id ? String(data.plan_version_id) : null,
    sessionTemplateId,
    templateName: tpl && typeof tpl.name === "string" && tpl.name.trim() ? tpl.name : null,
    templatePayload:
      tpl?.template && typeof tpl.template === "object"
        ? (tpl.template as Record<string, unknown>)
        : {},
    templateDescription: null,
    payload: data.payload && typeof data.payload === "object" ? (data.payload as Record<string, unknown>) : {},
    templateExercises,
  };
}
