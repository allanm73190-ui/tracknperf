import { supabase } from "../../infra/supabase/client";

export type TodayPlannedSession = {
  id: string;
  scheduledFor: string;
  planId: string;
  planVersionId: string | null;
  sessionTemplateId: string | null;
  templateName: string | null;
  payload: Record<string, unknown>;
};

export type TodayExecutedSession = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  plannedSessionId: string | null;
  recommendationId: string | null;
  planId: string | null;
  payload: Record<string, unknown>;
};

export type TodayOverview = {
  todayIso: string;
  planned: TodayPlannedSession[];
  executed: TodayExecutedSession[];
};

function toIsoDate(d: Date): string {
  // Local date → YYYY-MM-DD
  const yyyy = String(d.getFullYear()).padStart(4, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function getTodayOverview(now = new Date()): Promise<TodayOverview> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const todayIso = toIsoDate(now);

  const { data: plannedRows, error: plannedErr } = await supabase
    .from("planned_sessions")
    .select(
      `
      id,
      scheduled_for,
      plan_id,
      plan_version_id,
      session_template_id,
      payload,
      session_templates:session_template_id ( name )
    `,
    )
    .eq("scheduled_for", todayIso)
    .order("created_at", { ascending: true });

  if (plannedErr) {
    throw new Error(`Could not load planned sessions. (${plannedErr.message})`);
  }

  const planned: TodayPlannedSession[] = (plannedRows ?? []).map((r) => {
    const templateName =
      r &&
      typeof r === "object" &&
      "session_templates" in r &&
      r.session_templates &&
      typeof r.session_templates === "object" &&
      "name" in r.session_templates
        ? String((r.session_templates as { name: unknown }).name)
        : null;

    return {
      id: String((r as { id: unknown }).id),
      scheduledFor: String((r as { scheduled_for: unknown }).scheduled_for),
      planId: String((r as { plan_id: unknown }).plan_id),
      planVersionId:
        (r as { plan_version_id?: unknown }).plan_version_id === null ||
        (r as { plan_version_id?: unknown }).plan_version_id === undefined
          ? null
          : String((r as { plan_version_id: unknown }).plan_version_id),
      sessionTemplateId:
        (r as { session_template_id?: unknown }).session_template_id === null ||
        (r as { session_template_id?: unknown }).session_template_id === undefined
          ? null
          : String((r as { session_template_id: unknown }).session_template_id),
      templateName: templateName && templateName.trim().length ? templateName : null,
      payload:
        r && typeof r === "object" && "payload" in r && r.payload && typeof r.payload === "object"
          ? (r.payload as Record<string, unknown>)
          : {},
    };
  });

  // "Today" executed sessions: by started_at date in local time is tricky; keep it simple V1:
  // query last 24h and filter client-side by local date prefix.
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data: executedRows, error: executedErr } = await supabase
    .from("executed_sessions")
    .select("id, started_at, ended_at, planned_session_id, recommendation_id, plan_id, payload")
    .gte("started_at", since)
    .order("started_at", { ascending: false });

  if (executedErr) {
    throw new Error(`Could not load executed sessions. (${executedErr.message})`);
  }

  const executed: TodayExecutedSession[] = (executedRows ?? [])
    .map((r) => ({
      id: String((r as { id: unknown }).id),
      startedAt: String((r as { started_at: unknown }).started_at),
      endedAt:
        (r as { ended_at?: unknown }).ended_at === null || (r as { ended_at?: unknown }).ended_at === undefined
          ? null
          : String((r as { ended_at: unknown }).ended_at),
      plannedSessionId:
        (r as { planned_session_id?: unknown }).planned_session_id === null ||
        (r as { planned_session_id?: unknown }).planned_session_id === undefined
          ? null
          : String((r as { planned_session_id: unknown }).planned_session_id),
      recommendationId:
        (r as { recommendation_id?: unknown }).recommendation_id === null ||
        (r as { recommendation_id?: unknown }).recommendation_id === undefined
          ? null
          : String((r as { recommendation_id: unknown }).recommendation_id),
      planId:
        (r as { plan_id?: unknown }).plan_id === null || (r as { plan_id?: unknown }).plan_id === undefined
          ? null
          : String((r as { plan_id: unknown }).plan_id),
      payload:
        r && typeof r === "object" && "payload" in r && r.payload && typeof r.payload === "object"
          ? (r.payload as Record<string, unknown>)
          : {},
    }))
    .filter((x) => x.startedAt.slice(0, 10) === todayIso);

  return { todayIso, planned, executed };
}

