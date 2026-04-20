import { supabase } from "../../infra/supabase/client";
import type { TodayOverview } from "./getTodayOverview";
import { computeRecommendationV1_1 } from "../../domain/engine/v1_1/computeRecommendationV1_1";
import { loadEngineContext } from "./loadEngineContext";
import type {
  CriticalDataFlagsV1_1,
  DailySignalsV1_1,
  EngineResultV1_1,
  InterferenceSignalsV1_1,
  SessionTypeV1_1,
} from "../../domain/engine/v1_1/types";
import type { ExecutedSessionSummary } from "../../domain/engine/fatigue/computeFatigueSnapshot";

export type PersistedRecommendation = {
  recommendationId: string;
  explanationId: string;
  output: unknown;
  explanation: unknown;
};

function startOfDayIso(now: Date): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function persistEngineSnapshotsBestEffort(args: {
  recommendationId: string;
  userId: string;
  planned: TodayOverview["planned"][number];
  ctxPlanVersionId: string | null;
  engineRes: EngineResultV1_1;
  dailySignals: Partial<DailySignalsV1_1>;
}): Promise<void> {
  if (!supabase) return;
  try {
    const capturedAt = new Date().toISOString();
    const { data: contextRow, error: contextErr } = await supabase
      .from("context_snapshots")
      .insert({
        plan_id: args.planned.planId,
        plan_version_id: args.ctxPlanVersionId,
        executed_session_id: null,
        recommendation_id: args.recommendationId,
        captured_at: capturedAt,
        input_quality: args.engineRes.explanation.dataQuality,
        payload: {
          source: "client_v1",
          today_iso: args.engineRes.inputs.todayIso,
          planned_session_id: args.planned.id,
          session_template_id: args.planned.sessionTemplateId,
          decision: args.engineRes.recommendation.decision,
          risk_level: args.engineRes.recommendation.risk_level,
          confidence_score: args.engineRes.recommendation.confidence_score,
          fallback_mode: args.engineRes.recommendation.fallback_mode,
          daily_signals: args.dailySignals,
        },
      })
      .select("id")
      .maybeSingle();

    if (contextErr) return;
    const contextSnapshotId = contextRow?.id ? String(contextRow.id) : null;

    await Promise.allSettled([
      supabase.from("fatigue_snapshots").insert({
        context_snapshot_id: contextSnapshotId,
        captured_at: capturedAt,
        score: args.engineRes.fatigue.score,
        dimensions: args.engineRes.fatigue.dimensions,
        data_quality_score: args.engineRes.explanation.dataQuality.completenessScore,
        algorithm_version: args.engineRes.recommendation.algorithmVersion,
        payload: {
          source: "client_v1",
          recommendation_id: args.recommendationId,
        },
      }),
      supabase.from("readiness_snapshots").insert({
        context_snapshot_id: contextSnapshotId,
        captured_at: capturedAt,
        score: args.engineRes.readiness.score,
        limiting_factor: args.engineRes.readiness.limitingFactor,
        algorithm_version: args.engineRes.recommendation.algorithmVersion,
        payload: {
          source: "client_v1",
          recommendation_id: args.recommendationId,
        },
      }),
    ]);
  } catch {
    // Non bloquant: la recommandation principale est déjà persistée.
  }
}

async function persistEngineDecisionBestEffort(args: {
  recommendationId: string;
  userId: string;
  planned: TodayOverview["planned"][number];
  ctxPlanVersionId: string | null;
  engineRes: EngineResultV1_1;
}): Promise<void> {
  if (!supabase) return;
  try {
    const reco = args.engineRes.recommendation;
    await supabase
      .from("engine_decisions")
      .upsert(
        {
          recommendation_id: args.recommendationId,
          user_id: args.userId,
          plan_id: args.planned.planId,
          plan_version_id: args.ctxPlanVersionId,
          planned_session_id: args.planned.id,
          executed_session_id: null,
          decision: reco.decision,
          decision_state: reco.decisionState,
          confidence_score: reco.confidence_score,
          risk_level: reco.risk_level,
          reason_codes: Array.isArray(reco.reasonCodes) ? reco.reasonCodes : [],
          rules_triggered: Array.isArray(reco.rules_triggered) ? reco.rules_triggered : [],
          human_validation_required: reco.human_validation_required === true,
          fallback_mode: reco.fallback_mode === true,
          forbidden_action_blocked: Array.isArray(reco.forbidden_action_blocked) ? reco.forbidden_action_blocked : [],
          algorithm_version: reco.algorithmVersion,
          config_version: reco.configVersion,
          payload: {
            patch: reco.patch,
            session_adjustments: reco.session_adjustments,
            reasons: reco.reasons,
          },
        },
        { onConflict: "user_id,recommendation_id" },
      );
  } catch {
    // Non bloquant: la recommandation principale est déjà persistée.
  }
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim().replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toBoolean(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "oui"].includes(s)) return true;
    if (["false", "0", "no", "non"].includes(s)) return false;
  }
  return null;
}

function toString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function inferSessionTypeFromPayload(payload: Record<string, unknown>): SessionTypeV1_1 {
  const explicit = toString(payload.sessionType) ?? toString(payload.session_type) ?? toString(payload.type);
  if (explicit) {
    const e = explicit.toLowerCase();
    if (e.includes("strength") || e.includes("force") || e.includes("hypert")) return "strength";
    if (e.includes("endurance") || e.includes("course") || e.includes("run") || e.includes("trail")) return "endurance";
    if (e.includes("recovery") || e.includes("recup")) return "recovery";
    if (e.includes("rest") || e.includes("repos")) return "rest";
    if (e.includes("mixed") || e.includes("hybrid")) return "mixed";
  }
  return "mixed";
}

function isLowerBodyHeavy(payload: Record<string, unknown>, sessionType: SessionTypeV1_1): boolean {
  const explicit = toBoolean(payload.isLowerBodyHeavy) ?? toBoolean(payload.is_lower_body_heavy);
  if (explicit !== null) return explicit;
  const tags = Array.isArray(payload.stressTags) ? payload.stressTags : Array.isArray(payload.stress_tags) ? payload.stress_tags : [];
  if (tags.some((t) => typeof t === "string" && /lower|legs|jambes|squat|deadlift|plyo|sprint|hill/.test(t.toLowerCase()))) {
    return true;
  }
  return sessionType === "strength";
}

function isIntenseRun(payload: Record<string, unknown>, sessionType: SessionTypeV1_1): boolean {
  const explicit = toBoolean(payload.isIntenseRun) ?? toBoolean(payload.is_intense_run);
  if (explicit !== null) return explicit;
  const zone = toNumber(payload.zone) ?? toNumber(payload.hrZone) ?? toNumber(payload.hr_zone);
  const rpe = toNumber(payload.rpe);
  if (sessionType !== "endurance") return false;
  if (zone !== null && zone >= 4) return true;
  return rpe !== null && rpe >= 8;
}

function isLongRun(payload: Record<string, unknown>, sessionType: SessionTypeV1_1): boolean {
  const explicit = toBoolean(payload.isLongRun) ?? toBoolean(payload.is_long_run);
  if (explicit !== null) return explicit;
  const duration = toNumber(payload.durationMinutes) ?? toNumber(payload.duration_minutes);
  return sessionType === "endurance" && duration !== null && duration >= 75;
}

function extractDailySignals(
  latestInternalMetrics: Record<string, unknown> | null,
  latestExternalMetrics: Record<string, unknown> | null,
  latestDailyCheckin: Record<string, unknown> | null,
): Partial<DailySignalsV1_1> {
  const checkinPayload =
    latestDailyCheckin && typeof latestDailyCheckin.payload === "object" && latestDailyCheckin.payload
      ? (latestDailyCheckin.payload as Record<string, unknown>)
      : {};
  const merged = {
    ...(latestExternalMetrics ?? {}),
    ...(latestInternalMetrics ?? {}),
    ...checkinPayload,
    ...(latestDailyCheckin ?? {}),
  } as Record<string, unknown>;

  const pain = toNumber(merged.pain_score) ?? toNumber(merged.pain) ?? toNumber(merged.douleur);
  const fatigue = toNumber(merged.fatigue_score) ?? toNumber(merged.fatigue);
  const readiness = toNumber(merged.readiness_score) ?? toNumber(merged.readiness);
  const sleepLastNight =
    toNumber(merged.sleep_last_night_h) ??
    toNumber(merged.sleep_hours_last_night) ??
    toNumber(merged.sleep_hours) ??
    toNumber(merged.sleepHoursLastNight);
  const sleep2dAvg =
    toNumber(merged.sleep_2d_avg_h) ??
    toNumber(merged.sleep_2d_avg) ??
    toNumber(merged.sleepHours2dAvg);

  return {
    painScore: pain,
    painRedFlag:
      toBoolean(merged.pain_red_flag) ??
      toBoolean(merged.painRedFlag) ??
      false,
    fatigueSelfScore: fatigue,
    readinessSelfScore: readiness,
    sleepHoursLastNight: sleepLastNight,
    sleepHours2dAvg: sleep2dAvg,
    hrvBelowBaselineDays:
      toNumber(merged.hrv_below_baseline_days) ??
      toNumber(merged.hrvBelowBaselineDays),
    rhrDeltaBpm:
      toNumber(merged.rhr_delta_bpm) ??
      toNumber(merged.rhrDeltaBpm),
    illnessFlag:
      toBoolean(merged.illness_flag) ??
      toBoolean(merged.illness) ??
      false,
    neurologicalSymptomsFlag:
      toBoolean(merged.neurological_symptoms_flag) ??
      toBoolean(merged.neurologicalSymptomsFlag) ??
      false,
    limpFlag:
      toBoolean(merged.limp_flag) ??
      toBoolean(merged.limp) ??
      false,
    availableTimeTodayMin:
      toNumber(merged.available_time_today_min) ??
      toNumber(merged.availableTimeTodayMin),
    degradedModeDays:
      toNumber(merged.degraded_mode_days) ??
      toNumber(merged.degradedModeDays),
  };
}

async function loadRecentExecutionSignals(userId: string, now: Date): Promise<{
  recentSessions: ExecutedSessionSummary[];
  recentExecutedSessionsCount: number;
  last7dExecutedCount: number;
  interferenceSignals: Partial<InterferenceSignalsV1_1>;
}> {
  if (!supabase) {
    return {
      recentSessions: [],
      recentExecutedSessionsCount: 0,
      last7dExecutedCount: 0,
      interferenceSignals: {},
    };
  }

  const since14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const since7Ms = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  const { data, error } = await supabase
    .from("executed_sessions")
    .select("started_at, payload")
    .eq("user_id", userId)
    .gte("started_at", since14)
    .order("started_at", { ascending: false })
    .limit(80);

  if (error || !data) {
    return {
      recentSessions: [],
      recentExecutedSessionsCount: 0,
      last7dExecutedCount: 0,
      interferenceSignals: {},
    };
  }

  const recentSessions: ExecutedSessionSummary[] = [];
  let last7dExecutedCount = 0;

  let lastLowerBodyHeavyHoursAgo: number | null = null;
  let lastIntenseRunHoursAgo: number | null = null;
  let lastLongRunHoursAgo: number | null = null;
  let lowerBodyHighStressCount7d = 0;
  const lowerHeavyByDay = new Set<string>();
  const intenseRunByDay = new Set<string>();

  for (const row of data) {
    const startedAt = String(row.started_at);
    const startedMs = new Date(startedAt).getTime();
    const payload = row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {};
    const durationMinutes = toNumber(payload.durationMinutes) ?? toNumber(payload.duration_minutes);
    const rpe = toNumber(payload.rpe);
    recentSessions.push({
      startedAt,
      durationMinutes,
      rpe,
    });

    if (startedMs >= since7Ms) {
      last7dExecutedCount += 1;
      const sessionType = inferSessionTypeFromPayload(payload);
      const lowerHeavy = isLowerBodyHeavy(payload, sessionType);
      const intenseRun = isIntenseRun(payload, sessionType);
      const longRun = isLongRun(payload, sessionType);
      if (lowerHeavy || intenseRun || longRun) lowerBodyHighStressCount7d += 1;

      const hoursAgo = Math.max(0, (now.getTime() - startedMs) / 3_600_000);
      if (lowerHeavy && (lastLowerBodyHeavyHoursAgo === null || hoursAgo < lastLowerBodyHeavyHoursAgo)) {
        lastLowerBodyHeavyHoursAgo = hoursAgo;
      }
      if (intenseRun && (lastIntenseRunHoursAgo === null || hoursAgo < lastIntenseRunHoursAgo)) {
        lastIntenseRunHoursAgo = hoursAgo;
      }
      if (longRun && (lastLongRunHoursAgo === null || hoursAgo < lastLongRunHoursAgo)) {
        lastLongRunHoursAgo = hoursAgo;
      }

      const day = startedAt.slice(0, 10);
      if (lowerHeavy) lowerHeavyByDay.add(day);
      if (intenseRun) intenseRunByDay.add(day);
    }
  }

  const sameDayForbiddenComboDetected = [...lowerHeavyByDay].some((day) => intenseRunByDay.has(day));

  return {
    recentSessions,
    recentExecutedSessionsCount: recentSessions.length,
    last7dExecutedCount,
    interferenceSignals: {
      lastLowerBodyHeavyHoursAgo,
      lastIntenseRunHoursAgo,
      lastLongRunHoursAgo,
      lowerBodyHighStressCount7d,
      sameDayForbiddenComboDetected,
    },
  };
}

export async function computeAndPersistTodayRecommendation(
  overview: TodayOverview,
  now = new Date(),
): Promise<PersistedRecommendation | null> {
  if (!supabase) throw new Error("Supabase is not configured.");

  // V1: pick first planned session as the recommendation target.
  const planned = overview.planned[0] ?? null;
  if (!planned) return null;

  // Resolve authenticated user
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error("User not authenticated.");
  const userId = user.id;

  // Best-effort de-dupe: if we already computed a recommendation for this planned session today,
  // reuse the latest one.
  const { data: existing, error: existingErr } = await supabase
    .from("recommendations")
    .select("id, output")
    .eq("plan_id", planned.planId)
    .gte("created_at", startOfDayIso(now))
    .contains("input", { planned_session_id: planned.id })
    .order("created_at", { ascending: false })
    .limit(1);

  if (!existingErr && existing && existing.length > 0 && existing[0] && typeof existing[0].id === "string") {
    const recoId = existing[0].id as string;
    const { data: expRows, error: expErr } = await supabase
      .from("recommendation_explanations")
      .select("id, content")
      .eq("recommendation_id", recoId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!expErr && expRows && expRows.length > 0 && expRows[0] && typeof expRows[0].id === "string") {
      return {
        recommendationId: recoId,
        explanationId: expRows[0].id as string,
        output: existing[0].output,
        explanation: expRows[0].content,
      };
    }
  }

  const ctx = await loadEngineContext({ userId, planId: planned.planId, planVersionId: planned.planVersionId });

  const recentExec = await loadRecentExecutionSignals(userId, now);
  const dailySignals = extractDailySignals(
    ctx.latestInternalMetrics,
    ctx.latestExternalMetrics,
    ctx.latestDailyCheckin,
  );
  if (dailySignals.fatigueSelfScore === null && ctx.latestFatigue) {
    dailySignals.fatigueSelfScore = Math.round(ctx.latestFatigue.score * 10);
  }
  if (dailySignals.readinessSelfScore === null && ctx.latestReadiness) {
    dailySignals.readinessSelfScore = Math.round(ctx.latestReadiness.score * 10);
  }

  const criticalData: Partial<CriticalDataFlagsV1_1> = {
    hasBlockGoal:
      typeof planned.payload?.blockPrimaryGoal === "string" ||
      typeof planned.payload?.block_primary_goal === "string" ||
      typeof planned.payload?.primaryGoal === "string",
    hasSessionType:
      typeof planned.payload?.sessionType === "string" ||
      typeof planned.payload?.session_type === "string" ||
      !!planned.templateName,
    hasPainState:
      dailySignals.painScore !== null ||
      dailySignals.painRedFlag === true,
    hasRecentLoad: recentExec.last7dExecutedCount > 0,
    hasCalendarAvailability: true,
  };

  const engineRes = computeRecommendationV1_1({
    todayIso: overview.todayIso,
    plannedSession: planned,
    recentExecutedSessionsCount: recentExec.recentExecutedSessionsCount,
    last7dExecutedCount: recentExec.last7dExecutedCount,
    config: ctx.config,
    algorithmVersion: ctx.algorithmVersion,
    recentSessions: recentExec.recentSessions,
    feedback: ctx.recentFeedback,
    latestFatigue: ctx.latestFatigue,
    latestReadiness: ctx.latestReadiness,
    dailySignals,
    interferenceSignals: recentExec.interferenceSignals,
    criticalData,
  });

  const { data: recoRow, error: recoErr } = await supabase
    .from("recommendations")
    .insert({
      plan_id: planned.planId,
      session_id: null,
      algorithm_version_id: ctx.algorithmVersionId,
      config_profile_id: ctx.configProfileId,
      input: {
        today_iso: overview.todayIso,
        planned_session_id: planned.id,
        plan_id: planned.planId,
        plan_version_id: ctx.planVersionId,
        session_template_id: planned.sessionTemplateId,
        data_quality_score: engineRes.explanation.dataQuality.completenessScore,
        fallback_mode: engineRes.recommendation.fallback_mode,
        daily_signals: dailySignals,
      },
      output: engineRes.recommendation,
    })
    .select("id, output")
    .single();

  if (recoErr) throw new Error(`Could not persist recommendation. (${recoErr.message})`);
  if (!recoRow || typeof recoRow !== "object" || typeof (recoRow as { id?: unknown }).id !== "string") {
    throw new Error("Unexpected recommendation response from server.");
  }
  const recommendationId = (recoRow as { id: string }).id;

  const { data: expRow, error: expErr } = await supabase
    .from("recommendation_explanations")
    .insert({
      recommendation_id: recommendationId,
      content: engineRes.explanation,
    })
    .select("id, content")
    .single();

  if (expErr) throw new Error(`Could not persist explanation. (${expErr.message})`);
  if (!expRow || typeof expRow !== "object" || typeof (expRow as { id?: unknown }).id !== "string") {
    throw new Error("Unexpected explanation response from server.");
  }

  await persistEngineSnapshotsBestEffort({
    recommendationId,
    userId,
    planned,
    ctxPlanVersionId: ctx.planVersionId,
    engineRes,
    dailySignals,
  });

  await persistEngineDecisionBestEffort({
    recommendationId,
    userId,
    planned,
    ctxPlanVersionId: ctx.planVersionId,
    engineRes,
  });

  return {
    recommendationId,
    explanationId: (expRow as { id: string }).id,
    output: (recoRow as { output: unknown }).output,
    explanation: (expRow as { content: unknown }).content,
  };
}
