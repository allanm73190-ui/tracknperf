import { supabase } from "../../infra/supabase/client";
import { getLatestFatigueSnapshot, getLatestReadinessSnapshot } from "../../infra/supabase/snapshotRepository";
import type { FatigueSnapshot } from "../../domain/engine/fatigue/computeFatigueSnapshot";
import type { SessionFeedback } from "../../domain/engine/fatigue/computeFatigueSnapshot";
import type { ReadinessSnapshot } from "../../domain/engine/readiness/computeReadinessSnapshot";

export type EngineContext = {
  planVersionId: string | null;
  configProfileId: string | null;
  algorithmVersionId: string | null;
  algorithmVersion: string;
  config: unknown;
  latestFatigue: FatigueSnapshot | null;
  latestReadiness: ReadinessSnapshot | null;
  recentFeedback: SessionFeedback[];
  latestInternalMetrics: Record<string, unknown> | null;
  latestExternalMetrics: Record<string, unknown> | null;
  latestDailyCheckin: Record<string, unknown> | null;
};

export async function loadEngineContext(args: {
  userId: string;
  planId: string;
  planVersionId: string | null;
}): Promise<EngineContext> {
  if (!supabase) throw new Error("Supabase is not configured.");

  let planVersionId = args.planVersionId;

  if (!planVersionId) {
    const { data, error } = await supabase
      .from("plan_versions")
      .select("id")
      .eq("plan_id", args.planId)
      .order("version", { ascending: false })
      .limit(1);
    if (error) throw new Error(`Could not load plan version. (${error.message})`);
    planVersionId = data?.[0]?.id ? String(data[0].id) : null;
  }

  if (!planVersionId) {
    const [latestFatigue, latestReadiness, recentFeedback, latestInternalMetrics, latestExternalMetrics, latestDailyCheckin] = await Promise.all([
      getLatestFatigueSnapshot(args.userId).catch(() => null),
      getLatestReadinessSnapshot(args.userId).catch(() => null),
      loadRecentFeedback(args.userId),
      loadLatestMetrics("internal_metrics", args.userId),
      loadLatestMetrics("external_metrics", args.userId),
      loadLatestDailyCheckin(args.userId),
    ]);
    return {
      planVersionId: null,
      configProfileId: null,
      algorithmVersionId: null,
      algorithmVersion: "v1.1.0",
      config: { version: "v1.1-default" },
      latestFatigue,
      latestReadiness,
      recentFeedback,
      latestInternalMetrics,
      latestExternalMetrics,
      latestDailyCheckin,
    };
  }

  const { data: pv, error: pvErr } = await supabase
    .from("plan_versions")
    .select("id, config_profile_id, algorithm_version_id")
    .eq("id", planVersionId)
    .maybeSingle();
  if (pvErr) throw new Error(`Could not load plan version metadata. (${pvErr.message})`);

  const configProfileId = pv?.config_profile_id ? String(pv.config_profile_id) : null;
  const algorithmVersionId = pv?.algorithm_version_id ? String(pv.algorithm_version_id) : null;

  let config: unknown = { version: "v1.1-default" };
  if (configProfileId) {
    const { data: cfg, error: cfgErr } = await supabase
      .from("config_profiles")
      .select("config")
      .eq("id", configProfileId)
      .maybeSingle();
    if (cfgErr) throw new Error(`Could not load config profile. (${cfgErr.message})`);
    config = cfg?.config ?? config;
  }

  let algorithmVersion = "v1.1.0";
  if (algorithmVersionId) {
    const { data: av, error: avErr } = await supabase
      .from("algorithm_versions")
      .select("version")
      .eq("id", algorithmVersionId)
      .maybeSingle();
    if (avErr) throw new Error(`Could not load algorithm version. (${avErr.message})`);
    if (av?.version) algorithmVersion = String(av.version);
  }

  const [latestFatigue, latestReadiness, recentFeedback, latestInternalMetrics, latestExternalMetrics, latestDailyCheckin] = await Promise.all([
    getLatestFatigueSnapshot(args.userId).catch(() => null),
    getLatestReadinessSnapshot(args.userId).catch(() => null),
    loadRecentFeedback(args.userId),
    loadLatestMetrics("internal_metrics", args.userId),
    loadLatestMetrics("external_metrics", args.userId),
    loadLatestDailyCheckin(args.userId),
  ]);

  return {
    planVersionId,
    configProfileId,
    algorithmVersionId,
    algorithmVersion,
    config,
    latestFatigue,
    latestReadiness,
    recentFeedback,
    latestInternalMetrics,
    latestExternalMetrics,
    latestDailyCheckin,
  };
}

async function loadRecentFeedback(userId: string): Promise<SessionFeedback[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("session_feedback")
    .select("rating, executed_sessions!inner(started_at)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(14);
  if (error || !data) return [];
  return data.map((row) => {
    const session = (row.executed_sessions as unknown) as { started_at: string } | null;
    return {
      sessionStartedAt: session?.started_at ?? new Date(0).toISOString(),
      rpe: row.rating !== null ? Number(row.rating) : null,
    };
  });
}

async function loadLatestMetrics(
  table: "internal_metrics" | "external_metrics",
  userId: string,
): Promise<Record<string, unknown> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(table)
    .select("metrics")
    .eq("user_id", userId)
    .order("captured_at", { ascending: false })
    .limit(1);
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const row = data[0];
  if (!row?.metrics || typeof row.metrics !== "object") return null;
  return row.metrics as Record<string, unknown>;
}

async function loadLatestDailyCheckin(userId: string): Promise<Record<string, unknown> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("daily_checkins")
    .select(`
      checkin_date,
      pain_score,
      pain_red_flag,
      fatigue_score,
      readiness_score,
      sleep_hours,
      sleep_quality_score,
      soreness_score,
      stress_score,
      mood_score,
      available_time_today_min,
      degraded_mode_days,
      hrv_below_baseline_days,
      rhr_delta_bpm,
      illness_flag,
      neurological_symptoms_flag,
      limp_flag,
      notes,
      payload
    `)
    .eq("user_id", userId)
    .order("checkin_date", { ascending: false })
    .limit(1);
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const row = data[0];
  if (!row || typeof row !== "object") return null;
  return row as Record<string, unknown>;
}
