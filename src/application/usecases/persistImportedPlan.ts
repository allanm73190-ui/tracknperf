import { supabase } from "../../infra/supabase/client";
import type { PersistedPlanImportResult, PlanImport } from "../../domain/plan/planImport";
import { planImportSchema } from "../../domain/plan/planImport.schema";

type TemplateExerciseRow = {
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

function isPostgrestErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  if ("message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return null;
}

function toNullableString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const s = v.trim();
    return s.length ? s : null;
  }
  return String(v);
}

function extractTemplateExercises(template: Record<string, unknown>): TemplateExerciseRow[] {
  const rawItems = template.items;
  if (!Array.isArray(rawItems)) return [];

  const out: TemplateExerciseRow[] = [];
  for (const rawItem of rawItems) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const item = rawItem as Record<string, unknown>;
    const exerciseName =
      toNullableString(item.exercise) ??
      toNullableString(item.exercice) ??
      toNullableString(item.name) ??
      toNullableString(item.title);
    if (!exerciseName) continue;

    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(item)) {
      if (
        k === "exercise" ||
        k === "exercice" ||
        k === "name" ||
        k === "title" ||
        k === "series" ||
        k === "reps" ||
        k === "load" ||
        k === "tempo" ||
        k === "rest" ||
        k === "rir" ||
        k === "coachNotes" ||
        k === "coach_notes" ||
        k === "notes"
      ) {
        continue;
      }
      payload[k] = v;
    }

    out.push({
      exerciseName,
      seriesRaw: toNullableString(item.series),
      repsRaw: toNullableString(item.reps),
      loadRaw: toNullableString(item.load),
      tempoRaw: toNullableString(item.tempo),
      restRaw: toNullableString(item.rest),
      rirRaw: toNullableString(item.rir),
      coachNotes:
        toNullableString(item.coachNotes) ??
        toNullableString(item.coach_notes) ??
        toNullableString(item.notes),
      payload,
    });
  }
  return out;
}

export async function persistImportedPlan(input: PlanImport): Promise<PersistedPlanImportResult> {
  return persistImportedPlanWithEngineContext(input, { configProfileId: null, algorithmVersionId: null });
}

export async function persistImportedPlanWithEngineContext(
  input: PlanImport,
  engineContext: { configProfileId: string | null; algorithmVersionId: string | null },
): Promise<PersistedPlanImportResult> {
  const parsed = planImportSchema.parse(input);

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data: planRow, error: planError } = await supabase
    .from("plans")
    .insert({
      name: parsed.plan.name,
      description: parsed.plan.description ?? null,
      active: true,
    })
    .select("id")
    .single();

  if (planError || !planRow?.id) {
    const details = isPostgrestErrorMessage(planError);
    throw new Error(details ? `Could not create plan. (${details})` : "Could not create plan.");
  }

  const { data: pvRow, error: pvError } = await supabase
    .from("plan_versions")
    .insert({
      plan_id: planRow.id,
      version: parsed.planVersion.version,
      payload: parsed.planVersion.payload,
      config_profile_id: engineContext.configProfileId,
      algorithm_version_id: engineContext.algorithmVersionId,
    })
    .select("id")
    .single();

  if (pvError || !pvRow?.id) {
    const details = isPostgrestErrorMessage(pvError);
    throw new Error(details ? `Could not create plan version. (${details})` : "Could not create plan version.");
  }

  const sessionTemplateIdsByName: Record<string, string> = {};
  if (parsed.sessionTemplates.length > 0) {
    const { data: templateRows, error: templateError } = await supabase
      .from("session_templates")
      .insert(
        parsed.sessionTemplates.map((t) => ({
          plan_version_id: pvRow.id,
          name: t.name,
          template: t.template,
        })),
      )
      .select("id,name");

    if (templateError || !templateRows) {
      const details = isPostgrestErrorMessage(templateError);
      throw new Error(details ? `Could not create session templates. (${details})` : "Could not create session templates.");
    }

    for (const r of templateRows) {
      if (r?.id && r?.name) sessionTemplateIdsByName[String(r.name)] = String(r.id);
    }

    const exerciseRows: Array<{
      session_template_id: string;
      position: number;
      exercise_name: string;
      series_raw: string | null;
      reps_raw: string | null;
      load_raw: string | null;
      tempo_raw: string | null;
      rest_raw: string | null;
      rir_raw: string | null;
      coach_notes: string | null;
      payload: Record<string, unknown>;
    }> = [];

    for (const t of parsed.sessionTemplates) {
      const sessionTemplateId = sessionTemplateIdsByName[t.name];
      if (!sessionTemplateId) continue;
      const items = extractTemplateExercises(t.template);
      for (let idx = 0; idx < items.length; idx += 1) {
        const item = items[idx]!;
        exerciseRows.push({
          session_template_id: sessionTemplateId,
          position: idx + 1,
          exercise_name: item.exerciseName,
          series_raw: item.seriesRaw,
          reps_raw: item.repsRaw,
          load_raw: item.loadRaw,
          tempo_raw: item.tempoRaw,
          rest_raw: item.restRaw,
          rir_raw: item.rirRaw,
          coach_notes: item.coachNotes,
          payload: item.payload,
        });
      }
    }

    if (exerciseRows.length > 0) {
      const { error: exErr } = await supabase
        .from("session_template_exercises")
        .insert(exerciseRows);
      if (exErr) {
        const details = isPostgrestErrorMessage(exErr);
        throw new Error(
          details
            ? `Could not create session template exercises. (${details})`
            : "Could not create session template exercises.",
        );
      }
    }
  }

  const plannedSessionIds: string[] = [];
  if (parsed.plannedSessions.length > 0) {
    const nameToIdLower = new Map<string, string>();
    for (const [name, id] of Object.entries(sessionTemplateIdsByName)) {
      nameToIdLower.set(name.toLowerCase(), id);
    }

    const { data: plannedRows, error: plannedError } = await supabase
      .from("planned_sessions")
      .insert(
        parsed.plannedSessions.map((s) => {
          const templateId =
            s.templateName && nameToIdLower.has(s.templateName.toLowerCase())
              ? nameToIdLower.get(s.templateName.toLowerCase())!
              : null;
          return {
            plan_id: planRow.id,
            plan_version_id: pvRow.id,
            session_template_id: templateId,
            scheduled_for: s.scheduledFor,
            payload: s.payload,
          };
        }),
      )
      .select("id");

    if (plannedError || !plannedRows) {
      const details = isPostgrestErrorMessage(plannedError);
      throw new Error(details ? `Could not create planned sessions. (${details})` : "Could not create planned sessions.");
    }

    for (const r of plannedRows) if (r?.id) plannedSessionIds.push(String(r.id));
  }

  return {
    planId: String(planRow.id),
    planVersionId: String(pvRow.id),
    sessionTemplateIdsByName,
    plannedSessionIds,
  };
}
