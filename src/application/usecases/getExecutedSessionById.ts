import { supabase } from "../../infra/supabase/client";

export type ExecutedSessionDetail = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  plannedSessionId: string | null;
  planId: string | null;
  payload: Record<string, unknown>;
};

export async function getExecutedSessionById(sessionId: string): Promise<ExecutedSessionDetail | null> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("executed_sessions")
    .select("id, started_at, ended_at, planned_session_id, plan_id, payload")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: String(data.id),
    startedAt: String(data.started_at),
    endedAt: data.ended_at ? String(data.ended_at) : null,
    plannedSessionId: data.planned_session_id ? String(data.planned_session_id) : null,
    planId: data.plan_id ? String(data.plan_id) : null,
    payload: data.payload && typeof data.payload === "object" ? (data.payload as Record<string, unknown>) : {},
  };
}
