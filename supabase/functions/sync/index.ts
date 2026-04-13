import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAuthClient } from "../_shared/supabase.ts";

type SyncOpIn = {
  opId: string;
  idempotencyKey: string;
  opType: string;
  entity: string;
  payload: Record<string, unknown>;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function badRequest(msg: string) {
  return json(400, { error: msg });
}

function asString(x: unknown): string | null {
  return typeof x === "string" && x.trim().length ? x : null;
}

async function insertIdempotency(authClient: ReturnType<typeof createSupabaseAuthClient>, op: SyncOpIn) {
  const { error } = await authClient.from("sync_ops").insert({
    device_id: null,
    idempotency_key: op.idempotencyKey,
    op_type: op.opType,
    entity: op.entity,
    payload: op.payload,
    applied_at: null,
    result: null,
  });

  if (error && (error as { code?: string }).code === "23505") return { ok: true as const, duplicate: true as const };
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, duplicate: false as const };
}

async function markApplied(authClient: ReturnType<typeof createSupabaseAuthClient>, idempotencyKey: string) {
  await authClient
    .from("sync_ops")
    .update({ applied_at: new Date().toISOString() })
    .eq("idempotency_key", idempotencyKey);
}

async function markAppliedWithResult(
  authClient: ReturnType<typeof createSupabaseAuthClient>,
  idempotencyKey: string,
  result: Record<string, unknown>,
) {
  await authClient
    .from("sync_ops")
    .update({ applied_at: new Date().toISOString(), result })
    .eq("idempotency_key", idempotencyKey);
}

async function getExistingResult(
  authClient: ReturnType<typeof createSupabaseAuthClient>,
  idempotencyKey: string,
): Promise<{ appliedAt: string | null; result: Record<string, unknown> | null } | null> {
  const { data } = await authClient
    .from("sync_ops")
    .select("applied_at, result")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (!data) return null;
  const appliedAt = data.applied_at ? String(data.applied_at) : null;
  const result = data.result && typeof data.result === "object" ? (data.result as Record<string, unknown>) : null;
  return { appliedAt, result };
}
 
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return badRequest("Method not allowed.");

  const authClient = createSupabaseAuthClient(req);
  const { data: userRes, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userRes?.user?.id) {
    return json(401, { error: "Unauthorized." });
  }
  const userId = userRes.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  if (!body || typeof body !== "object" || !("ops" in body)) return badRequest("Missing ops.");
  const opsRaw = (body as { ops: unknown }).ops;
  if (!Array.isArray(opsRaw)) return badRequest("ops must be an array.");
  if (opsRaw.length > 25) return badRequest("Too many ops (max 25).");

  const ops: SyncOpIn[] = [];
  for (const o of opsRaw) {
    if (!o || typeof o !== "object") continue;
    const opId = asString((o as { opId?: unknown }).opId);
    const idempotencyKey = asString((o as { idempotencyKey?: unknown }).idempotencyKey);
    const opType = asString((o as { opType?: unknown }).opType);
    const entity = asString((o as { entity?: unknown }).entity);
    const payload = (o as { payload?: unknown }).payload;
    if (!opId || !idempotencyKey || !opType || !entity) continue;
    if (!payload || typeof payload !== "object") continue;
    ops.push({ opId, idempotencyKey, opType, entity, payload: payload as Record<string, unknown> });
  }

  const results: Array<{ opId: string; status: "applied" | "rejected" | "error"; error?: string }> = [];

  for (const op of ops) {
    try {
      if (op.opType !== "insert") {
        results.push({ opId: op.opId, status: "rejected", error: "Unsupported opType." });
        continue;
      }

      const idem = await insertIdempotency(authClient, op);
      if (!idem.ok) {
        results.push({ opId: op.opId, status: "error", error: idem.error });
        continue;
      }
      if (idem.duplicate) {
        const existing = await getExistingResult(authClient, op.idempotencyKey);
        // If we have a stored result, we can safely return applied.
        if (existing?.appliedAt) {
          results.push({ opId: op.opId, status: "applied" });
          continue;
        }
        // Otherwise retry applying (previous attempt may have crashed mid-flight).
        // We do NOT treat this as applied until we can store applied_at.
      }

      if (op.entity === "executed_sessions") {
        const id = asString(op.payload.id);
        const startedAt = asString(op.payload.started_at);
        const endedAt = asString(op.payload.ended_at);
        if (!id || !startedAt || !endedAt) {
          results.push({ opId: op.opId, status: "rejected", error: "Missing id/started_at/ended_at." });
          continue;
        }

        const { data: inserted, error: insErr } = await authClient
          .from("executed_sessions")
          .upsert({
            id,
            plan_id: op.payload.plan_id ?? null,
            planned_session_id: op.payload.planned_session_id ?? null,
            recommendation_id: null,
            started_at: startedAt,
            ended_at: endedAt,
            payload: op.payload.payload ?? {},
          })
          .select("id, planned_session_id, plan_id")
          .single();

        if (insErr || !inserted?.id) {
          results.push({ opId: op.opId, status: "error", error: insErr?.message ?? "Insert failed." });
          continue;
        }

        // Server-side recalc (V1.1 minimal): create a recommendation+explanation tied to the plan version config.
        if (inserted.planned_session_id) {
          const plannedId = String(inserted.planned_session_id);
          const { data: ps } = await authClient
            .from("planned_sessions")
            .select("id, plan_id, plan_version_id, session_template_id, scheduled_for")
            .eq("id", plannedId)
            .maybeSingle();

          if (ps?.plan_id) {
            const planId = String(ps.plan_id);
            const planVersionId = ps.plan_version_id ? String(ps.plan_version_id) : null;

            let configProfileId: string | null = null;
            let algorithmVersionId: string | null = null;
            let algorithmVersion = "v1.1.0";
            let config: unknown = { version: "v1.1-default" };

            if (planVersionId) {
              const { data: pv } = await authClient
                .from("plan_versions")
                .select("config_profile_id, algorithm_version_id")
                .eq("id", planVersionId)
                .maybeSingle();
              if (pv?.config_profile_id) configProfileId = String(pv.config_profile_id);
              if (pv?.algorithm_version_id) algorithmVersionId = String(pv.algorithm_version_id);
            }

            if (configProfileId) {
              const { data: cfg } = await authClient
                .from("config_profiles")
                .select("config")
                .eq("id", configProfileId)
                .maybeSingle();
              if (cfg?.config) config = cfg.config;
            }
            if (algorithmVersionId) {
              const { data: av } = await authClient
                .from("algorithm_versions")
                .select("version")
                .eq("id", algorithmVersionId)
                .maybeSingle();
              if (av?.version) algorithmVersion = String(av.version);
            }

            const output = {
              scope: "today",
              decisionState: "maintain",
              patch: {
                action: "execute_planned",
                planned_session_id: plannedId,
                session_template_id: ps.session_template_id ? String(ps.session_template_id) : null,
                volume_multiplier: 1,
                intensity_multiplier: 1,
              },
              reasonCodes: ["FOLLOW_PLAN"],
              algorithmVersion,
              configVersion: typeof config === "object" && config && "version" in (config as Record<string, unknown>) ? String((config as Record<string, unknown>).version) : "v1.1-default",
            };

            const { data: recoRow } = await authClient
              .from("recommendations")
              .insert({
                plan_id: planId,
                session_id: null,
                algorithm_version_id: algorithmVersionId,
                config_profile_id: configProfileId,
                input: {
                  planned_session_id: plannedId,
                  plan_id: planId,
                  plan_version_id: planVersionId,
                  executed_session_id: String(inserted.id),
                  algorithm_version: algorithmVersion,
                },
                output,
              })
              .select("id")
              .single();

            if (recoRow?.id) {
              await authClient.from("recommendation_explanations").insert({
                recommendation_id: String(recoRow.id),
                content: {
                  summary: { headline: "Follow your planned session", reasonsTop3: [{ code: "FOLLOW_PLAN", text: "You have a planned session for today." }] },
                  algorithmVersion,
                  configVersion: output.configVersion,
                },
              });
            }
          }
        }

        await markAppliedWithResult(authClient, op.idempotencyKey, { executed_session_id: String(inserted.id) });
        results.push({ opId: op.opId, status: "applied" });
        continue;
      }

      if (op.entity === "session_feedback") {
        const executedSessionId = asString(op.payload.executed_session_id);
        if (!executedSessionId) {
          results.push({ opId: op.opId, status: "rejected", error: "Missing executed_session_id." });
          continue;
        }
        const { error } = await authClient.from("session_feedback").insert({
          executed_session_id: executedSessionId,
          rating: typeof op.payload.rating === "number" ? op.payload.rating : null,
          soreness: typeof op.payload.soreness === "number" ? op.payload.soreness : null,
          notes: typeof op.payload.notes === "string" ? op.payload.notes : null,
          payload: typeof op.payload.payload === "object" && op.payload.payload ? op.payload.payload : {},
        });
        if (error) {
          results.push({ opId: op.opId, status: "error", error: error.message });
          continue;
        }
        await markApplied(authClient, op.idempotencyKey);
        results.push({ opId: op.opId, status: "applied" });
        continue;
      }

      if (op.entity === "context_snapshots") {
        const { error } = await authClient.from("context_snapshots").insert({
          plan_id: op.payload.plan_id ?? null,
          plan_version_id: op.payload.plan_version_id ?? null,
          executed_session_id: op.payload.executed_session_id ?? null,
          recommendation_id: op.payload.recommendation_id ?? null,
          captured_at: op.payload.captured_at ?? null,
          input_quality: typeof op.payload.input_quality === "object" && op.payload.input_quality ? op.payload.input_quality : {},
          payload: typeof op.payload.payload === "object" && op.payload.payload ? op.payload.payload : {},
        });
        if (error) {
          results.push({ opId: op.opId, status: "error", error: error.message });
          continue;
        }
        await markApplied(authClient, op.idempotencyKey);
        results.push({ opId: op.opId, status: "applied" });
        continue;
      }

      results.push({ opId: op.opId, status: "rejected", error: "Unsupported entity." });
    } catch (e) {
      results.push({ opId: op.opId, status: "error", error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return json(200, { results });
});

