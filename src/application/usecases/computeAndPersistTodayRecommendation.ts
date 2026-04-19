import { supabase } from "../../infra/supabase/client";
import type { TodayOverview } from "./getTodayOverview";
import { computeRecommendationV1_1 } from "../../domain/engine/v1_1/computeRecommendationV1_1";
import { loadEngineContext } from "./loadEngineContext";

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
  const engineRes = computeRecommendationV1_1({
    todayIso: overview.todayIso,
    plannedSession: planned,
    recentExecutedSessionsCount: overview.executed.length,
    last7dExecutedCount: overview.executed.length, // V1.1 pragmatic until History aggregation exists
    config: ctx.config,
    algorithmVersion: ctx.algorithmVersion,
    feedback: ctx.recentFeedback,
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

  return {
    recommendationId,
    explanationId: (expRow as { id: string }).id,
    output: (recoRow as { output: unknown }).output,
    explanation: (expRow as { content: unknown }).content,
  };
}
