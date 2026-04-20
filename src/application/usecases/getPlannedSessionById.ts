import { supabase } from "../../infra/supabase/client";

export type PlannedSessionDetail = {
  id: string;
  scheduledFor: string;
  planId: string;
  planVersionId: string | null;
  sessionTemplateId: string | null;
  templateName: string | null;
  templateDescription: string | null;
  payload: Record<string, unknown>;
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
      session_templates:session_template_id ( name )
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const tpl = data.session_templates as { name?: unknown } | null;

  return {
    id: String(data.id),
    scheduledFor: String(data.scheduled_for),
    planId: String(data.plan_id),
    planVersionId: data.plan_version_id ? String(data.plan_version_id) : null,
    sessionTemplateId: data.session_template_id ? String(data.session_template_id) : null,
    templateName: tpl && typeof tpl.name === "string" && tpl.name.trim() ? tpl.name : null,
    templateDescription: null,
    payload: data.payload && typeof data.payload === "object" ? (data.payload as Record<string, unknown>) : {},
  };
}
