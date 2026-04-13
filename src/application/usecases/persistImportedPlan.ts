import { supabase } from "../../infra/supabase/client";
import type { PersistedPlanImportResult, PlanImport } from "../../domain/plan/planImport";
import { planImportSchema } from "../../domain/plan/planImport.schema";

function isPostgrestErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  if ("message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return null;
}

export async function persistImportedPlan(input: PlanImport): Promise<PersistedPlanImportResult> {
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
      config_profile_id: null,
      algorithm_version_id: null,
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

