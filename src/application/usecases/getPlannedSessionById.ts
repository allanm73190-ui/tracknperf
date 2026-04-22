import { supabase } from "../../infra/supabase/client";

export type PlannedSessionTemplateExercise = {
  id: string;
  plannedSessionItemLiveId: string | null;
  sessionTemplateExerciseId: string | null;
  executedSessionExerciseId: string | null;
  version: number | null;
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
  userId: string;
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

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    return String(v);
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function normalizeLookupKey(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizePayloadExercise(raw: Record<string, unknown>, idx: number): PlannedSessionTemplateExercise | null {
  const normalizedRaw: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalized = normalizeLookupKey(key);
    if (!normalized) continue;
    if (!(normalized in normalizedRaw)) normalizedRaw[normalized] = value;
  }

  const exerciseName =
    asString(normalizedRaw.exercise) ??
    asString(normalizedRaw.exercice) ??
    asString(normalizedRaw.name) ??
    asString(normalizedRaw.title);
  if (!exerciseName) return null;

  const payload: Record<string, unknown> = {};
  const reserved = new Set([
    "exercise",
    "exercice",
    "name",
    "title",
    "series",
    "sets",
    "reps",
    "repetitions",
    "load",
    "load_kg",
    "charge",
    "tempo",
    "rest",
    "rest_seconds",
    "repos",
    "recuperation",
    "rir",
    "coachnotes",
    "coach_notes",
    "notes",
  ]);
  for (const [k, v] of Object.entries(raw)) {
    if (reserved.has(normalizeLookupKey(k))) continue;
    payload[k] = v;
  }

  return {
    id: `payload-item-${idx + 1}`,
    plannedSessionItemLiveId: null,
    sessionTemplateExerciseId: null,
    executedSessionExerciseId: null,
    version: null,
    position: idx + 1,
    exerciseName,
    seriesRaw:
      asString(normalizedRaw.series) ??
      asString(normalizedRaw.sets) ??
      asString(normalizedRaw.serie) ??
      asString(normalizedRaw.nb_series),
    repsRaw:
      asString(normalizedRaw.reps) ??
      asString(normalizedRaw.repetitions) ??
      asString(normalizedRaw.repetition) ??
      asString(normalizedRaw.nb_reps),
    loadRaw:
      asString(normalizedRaw.load) ??
      asString(normalizedRaw.load_kg) ??
      asString(normalizedRaw.charge) ??
      asString(normalizedRaw.poids),
    tempoRaw: asString(normalizedRaw.tempo),
    restRaw:
      asString(normalizedRaw.rest) ??
      asString(normalizedRaw.rest_seconds) ??
      asString(normalizedRaw.repos) ??
      asString(normalizedRaw.recuperation),
    rirRaw: asString(normalizedRaw.rir),
    coachNotes:
      asString(normalizedRaw.coachnotes) ??
      asString(normalizedRaw.coach_notes) ??
      asString(normalizedRaw.notes),
    payload,
  };
}

function extractTemplateExercisesFromPayload(payloadInput: Record<string, unknown> | null | undefined): PlannedSessionTemplateExercise[] {
  if (!payloadInput) return [];

  const fromArrayKey = (key: "items" | "exercises"): PlannedSessionTemplateExercise[] => {
    const rawList = payloadInput[key];
    if (!Array.isArray(rawList)) return [];
    const out: PlannedSessionTemplateExercise[] = [];
    for (let idx = 0; idx < rawList.length; idx += 1) {
      const rec = asRecord(rawList[idx]);
      if (!rec) continue;
      const mapped = normalizePayloadExercise(rec, out.length);
      if (mapped) out.push(mapped);
    }
    return out.map((row, i) => ({ ...row, position: i + 1 }));
  };

  const fromItems = fromArrayKey("items");
  if (fromItems.length > 0) return fromItems;
  const fromExercises = fromArrayKey("exercises");
  if (fromExercises.length > 0) return fromExercises;

  const single = normalizePayloadExercise(payloadInput, 0);
  if (single) return [single];

  const indexed = new Map<number, Record<string, unknown>>();
  for (const [key, value] of Object.entries(payloadInput)) {
    const m = normalizeLookupKey(key).match(/^(.+)_([0-9]+)$/);
    if (!m) continue;
    const field = m[1]?.toLowerCase();
    const idx = Number(m[2]);
    if (!Number.isFinite(idx) || idx < 1) continue;
    if (!field) continue;
    const current = indexed.get(idx) ?? {};
    current[field] = value;
    indexed.set(idx, current);
  }
  if (indexed.size > 0) {
    const ordered = Array.from(indexed.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, rec], idx) => normalizePayloadExercise(rec, idx))
      .filter((x): x is PlannedSessionTemplateExercise => x !== null);
    if (ordered.length > 0) return ordered.map((row, i) => ({ ...row, position: i + 1 }));
  }

  // Legacy safety net: when only a free-text prescription exists in payload, expose it as pseudo exercises.
  const freeText =
    asString(payloadInput.text) ??
    asString(payloadInput.notes) ??
    asString(payloadInput.description) ??
    asString(payloadInput.consigne);
  if (freeText) {
    const lines = freeText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.replace(/^[•\-\u2022]+\s*/, ""));
    if (lines.length > 0) {
      return lines.slice(0, 8).map((line, i) => ({
        id: `payload-text-${i + 1}`,
        plannedSessionItemLiveId: null,
        sessionTemplateExerciseId: null,
        executedSessionExerciseId: null,
        version: null,
        position: i + 1,
        exerciseName: line,
        seriesRaw: null,
        repsRaw: null,
        loadRaw: null,
        tempoRaw: null,
        restRaw: null,
        rirRaw: null,
        coachNotes: null,
        payload: { source: "payload_text_fallback" },
      }));
    }
  }

  return [];
}

export async function getPlannedSessionById(id: string): Promise<PlannedSessionDetail | null> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("planned_sessions")
    .select(`
      id,
      user_id,
      scheduled_for,
      plan_id,
      plan_version_id,
      session_template_id,
      payload,
      session_templates:session_template_id ( name, template ),
      plans!inner ( active )
    `)
    .eq("id", id)
    .eq("plans.active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const tpl = data.session_templates as { name?: unknown; template?: unknown } | null;
  const sessionTemplateId = data.session_template_id ? String(data.session_template_id) : null;
  let templateExercises: PlannedSessionTemplateExercise[] = [];
  const { data: liveRows, error: liveErr } = await supabase
    .from("planned_session_items_live")
    .select(`
      id,
      session_template_exercise_id,
      version,
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
  if (liveErr) {
    const lower = liveErr.message.toLowerCase();
    const missingLiveTable = lower.includes("planned_session_items_live");
    if (!missingLiveTable) throw new Error(liveErr.message);
  }

  if (!liveErr && liveRows && liveRows.length > 0) {
    templateExercises = liveRows.map((row) => ({
      id: String(row.id),
      plannedSessionItemLiveId: String(row.id),
      sessionTemplateExerciseId:
        row.session_template_exercise_id !== null && row.session_template_exercise_id !== undefined
          ? String(row.session_template_exercise_id)
          : null,
      executedSessionExerciseId: null,
      version: Number(row.version ?? 1),
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

  if (templateExercises.length === 0) {
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
        plannedSessionItemLiveId: null,
        sessionTemplateExerciseId:
          row.session_template_exercise_id !== null && row.session_template_exercise_id !== undefined
            ? String(row.session_template_exercise_id)
            : null,
        executedSessionExerciseId: null,
        version: null,
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
        plannedSessionItemLiveId: null,
        sessionTemplateExerciseId: String(row.id),
        executedSessionExerciseId: null,
        version: null,
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
  }

  if (templateExercises.length === 0) {
    const templatePayloadExercises = extractTemplateExercisesFromPayload(
      tpl?.template && typeof tpl.template === "object" ? (tpl.template as Record<string, unknown>) : null,
    );
    if (templatePayloadExercises.length > 0) {
      templateExercises = templatePayloadExercises;
    } else {
      templateExercises = extractTemplateExercisesFromPayload(
        data.payload && typeof data.payload === "object" ? (data.payload as Record<string, unknown>) : null,
      );
    }
  }

  return {
    id: String(data.id),
    userId: String(data.user_id),
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
