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
  totalSets: number;
  totalTonnageKg: number;
  avgSessionRpe: number | null;
};

function toNullableNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

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
    .select("payload, started_at, executed_session_metrics(total_sets, tonnage_kg, avg_rpe)")
    .gte("started_at", sinceIso);
  if (error) throw new Error(error.message);
  let executedCount = 0;
  let totalDurationMinutes = 0;
  let totalSets = 0;
  let totalTonnageKg = 0;
  let rpeSum = 0;
  let rpeCount = 0;
  for (const r of data ?? []) {
    executedCount++;
    const payload = r.payload && typeof r.payload === "object" ? (r.payload as Record<string, unknown>) : {};
    const rawMetrics = r.executed_session_metrics;
    const metrics =
      rawMetrics && typeof rawMetrics === "object" && Array.isArray(rawMetrics)
        ? ((rawMetrics[0] ?? null) as Record<string, unknown> | null)
        : rawMetrics && typeof rawMetrics === "object"
          ? (rawMetrics as Record<string, unknown>)
          : null;
    const dur = payload.durationMinutes;
    if (typeof dur === "number" && Number.isFinite(dur)) totalDurationMinutes += dur;
    const sets = toNullableNumber(metrics?.total_sets) ?? toNullableNumber(payload.totalSets);
    if (typeof sets === "number") totalSets += sets;

    const tonnage = toNullableNumber(metrics?.tonnage_kg) ?? toNullableNumber(payload.tonnageKg);
    if (typeof tonnage === "number") totalTonnageKg += tonnage;

    const rpe = toNullableNumber(metrics?.avg_rpe) ?? toNullableNumber(payload.rpe);
    if (typeof rpe === "number") {
      rpeSum += rpe;
      rpeCount += 1;
    }
  }
  return {
    executedCount,
    totalDurationMinutes,
    totalSets,
    totalTonnageKg: Math.round(totalTonnageKg * 100) / 100,
    avgSessionRpe: rpeCount > 0 ? Math.round((rpeSum / rpeCount) * 100) / 100 : null,
  };
}
