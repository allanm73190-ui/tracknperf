import { supabase } from "../../infra/supabase/client";

export type ExecutedSessionRow = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  planId: string | null;
  payload: Record<string, unknown>;
};

export type ExecutedSessionStats = {
  executedCount: number;
  totalDurationMinutes: number;
};

export async function getExecutedSessionHistory(sinceIso: string): Promise<ExecutedSessionRow[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("executed_sessions")
    .select("id, started_at, ended_at, plan_id, payload")
    .gte("started_at", sinceIso)
    .order("started_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    startedAt: String(r.started_at),
    endedAt: r.ended_at ? String(r.ended_at) : null,
    planId: r.plan_id ? String(r.plan_id) : null,
    payload: r.payload && typeof r.payload === "object" ? (r.payload as Record<string, unknown>) : {},
  }));
}

export async function getExecutedSessionStats(sinceIso: string): Promise<ExecutedSessionStats> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("executed_sessions")
    .select("payload, started_at")
    .gte("started_at", sinceIso);
  if (error) throw new Error(error.message);
  let executedCount = 0;
  let totalDurationMinutes = 0;
  for (const r of data ?? []) {
    executedCount++;
    const payload = r.payload && typeof r.payload === "object" ? (r.payload as Record<string, unknown>) : {};
    const dur = payload.durationMinutes;
    if (typeof dur === "number" && Number.isFinite(dur)) totalDurationMinutes += dur;
  }
  return { executedCount, totalDurationMinutes };
}
