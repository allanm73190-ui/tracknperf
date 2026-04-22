import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAuthClient } from "../_shared/supabase.ts";

type Action =
  | "update_item"
  | "add_item"
  | "remove_item"
  | "list_conflicts"
  | "resolve_conflict";

type LiveItem = {
  id: string;
  user_id: string;
  planned_session_id: string;
  version: number;
  position: number;
  exercise_name: string;
  series_raw: string | null;
  reps_raw: string | null;
  load_raw: string | null;
  tempo_raw: string | null;
  rest_raw: string | null;
  rir_raw: string | null;
  coach_notes: string | null;
  payload: Record<string, unknown>;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function asInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isInteger(v)) return null;
  return v;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function isPgErrorWithMessage(error: unknown, pattern: string): boolean {
  if (!error || typeof error !== "object") return false;
  if (!("message" in error)) return false;
  return String((error as { message?: unknown }).message ?? "").toUpperCase().includes(pattern.toUpperCase());
}

function parsePatch(input: unknown): Record<string, unknown> {
  const rec = asRecord(input) ?? {};
  const out: Record<string, unknown> = {};

  const setText = (key: string) => {
    if (!(key in rec)) return;
    out[key] = rec[key] === null ? null : asString(rec[key]);
  };
  setText("exercise_name");
  setText("series_raw");
  setText("reps_raw");
  setText("load_raw");
  setText("tempo_raw");
  setText("rest_raw");
  setText("rir_raw");
  setText("coach_notes");

  if ("position" in rec) {
    const p = asInt(rec.position);
    if (p !== null && p >= 1) out.position = p;
  }

  if ("payload" in rec) {
    out.payload = asRecord(rec.payload) ?? {};
  }

  return out;
}

function patchKeys(patch: Record<string, unknown>): string[] {
  return Object.keys(patch).filter((k) => k !== "payload");
}

async function getLiveItem(authClient: ReturnType<typeof createSupabaseAuthClient>, liveItemId: string): Promise<LiveItem | null> {
  const { data, error } = await authClient
    .from("planned_session_items_live")
    .select(`
      id,
      user_id,
      planned_session_id,
      version,
      position,
      exercise_name,
      series_raw,
      reps_raw,
      load_raw,
      tempo_raw,
      rest_raw,
      rir_raw,
      coach_notes,
      payload
    `)
    .eq("id", liveItemId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: String(data.id),
    user_id: String(data.user_id),
    planned_session_id: String(data.planned_session_id),
    version: Number(data.version ?? 1),
    position: Number(data.position ?? 1),
    exercise_name: String(data.exercise_name ?? "Exercice"),
    series_raw: data.series_raw ? String(data.series_raw) : null,
    reps_raw: data.reps_raw ? String(data.reps_raw) : null,
    load_raw: data.load_raw ? String(data.load_raw) : null,
    tempo_raw: data.tempo_raw ? String(data.tempo_raw) : null,
    rest_raw: data.rest_raw ? String(data.rest_raw) : null,
    rir_raw: data.rir_raw ? String(data.rir_raw) : null,
    coach_notes: data.coach_notes ? String(data.coach_notes) : null,
    payload: data.payload && typeof data.payload === "object" ? (data.payload as Record<string, unknown>) : {},
  };
}

async function canEditAthlete(
  authClient: ReturnType<typeof createSupabaseAuthClient>,
  actorId: string,
  athleteId: string,
): Promise<boolean> {
  if (actorId === athleteId) return true;

  const [{ data: isAdmin }, { data: isAssigned }] = await Promise.all([
    authClient.rpc("is_admin", { target_user_id: actorId }),
    authClient.rpc("is_assigned_coach", { coach_id: actorId, athlete_id: athleteId }),
  ]);
  return Boolean(isAdmin) || Boolean(isAssigned);
}

async function createConflict(
  authClient: ReturnType<typeof createSupabaseAuthClient>,
  args: {
    athleteId: string;
    actorId: string;
    entity: string;
    entityId: string;
    patch: Record<string, unknown>;
    expectedVersion: number;
    currentVersion: number;
    serverRow: Record<string, unknown>;
    autoResolved?: boolean;
  },
): Promise<string | null> {
  const { data, error } = await authClient
    .from("sync_conflicts")
    .insert({
      user_id: args.athleteId,
      entity: args.entity,
      entity_id: args.entityId,
      field: patchKeys(args.patch).join(","),
      local_value: { patch: args.patch },
      server_value: args.serverRow,
      local_version: args.expectedVersion,
      server_version: args.currentVersion,
      status: args.autoResolved ? "resolved_auto" : "pending",
      resolution: args.autoResolved ? "local" : null,
      resolved_at: args.autoResolved ? new Date().toISOString() : null,
      resolved_by: args.autoResolved ? args.actorId : null,
      payload: {
        reason: "VERSION_CONFLICT",
      },
    })
    .select("id")
    .single();
  if (error || !data?.id) return null;
  return String(data.id);
}

async function tryAutoMerge(
  authClient: ReturnType<typeof createSupabaseAuthClient>,
  liveItem: LiveItem,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const { data: latestChange } = await authClient
    .from("planned_session_item_changes")
    .select("fields_changed")
    .eq("planned_session_item_live_id", liveItem.id)
    .order("changed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const changedFields = Array.isArray(latestChange?.fields_changed)
    ? latestChange.fields_changed.map((x) => String(x))
    : [];
  const overlap = patchKeys(patch).some((k) => changedFields.includes(k));
  if (overlap) return false;

  const { error } = await authClient
    .from("planned_session_items_live")
    .update(patch)
    .eq("id", liveItem.id)
    .eq("version", liveItem.version);
  return !error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const authClient = createSupabaseAuthClient(req);
  const { data: userRes, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userRes?.user?.id) {
    return json(401, { error: "UNAUTHORIZED" });
  }
  const actorId = userRes.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "INVALID_JSON" });
  }
  const payload = asRecord(body);
  const action = asString(payload?.action) as Action | null;
  if (!action) return json(400, { error: "MISSING_ACTION" });

  try {
    if (action === "update_item") {
      const liveItemId = asString(payload?.liveItemId);
      const expectedVersion = asInt(payload?.expectedVersion);
      const patch = parsePatch(payload?.patch);
      if (!liveItemId || expectedVersion === null) {
        return json(400, { error: "INVALID_INPUT" });
      }

      const liveItem = await getLiveItem(authClient, liveItemId);
      if (!liveItem) return json(404, { error: "ITEM_NOT_FOUND" });

      const allowed = await canEditAthlete(authClient, actorId, liveItem.user_id);
      if (!allowed) return json(403, { error: "FORBIDDEN_SCOPE" });

      if (liveItem.version !== expectedVersion) {
        const autoMerged = await tryAutoMerge(authClient, liveItem, patch);
        const refreshed = await getLiveItem(authClient, liveItem.id);
        const conflictId = await createConflict(authClient, {
          athleteId: liveItem.user_id,
          actorId,
          entity: "planned_session_items_live",
          entityId: liveItem.id,
          patch,
          expectedVersion,
          currentVersion: liveItem.version,
          serverRow: refreshed ?? liveItem,
          autoResolved: autoMerged,
        });
        if (autoMerged) {
          const mergedRow = await getLiveItem(authClient, liveItem.id);
          return json(200, {
            status: "applied",
            autoMerged: true,
            conflictId,
            row: mergedRow,
          });
        }
        return json(409, {
          error: "VERSION_CONFLICT",
          conflictId,
          currentVersion: liveItem.version,
        });
      }

      const { data: updated, error } = await authClient
        .from("planned_session_items_live")
        .update(patch)
        .eq("id", liveItem.id)
        .eq("version", expectedVersion)
        .select("id, version")
        .maybeSingle();

      if (error) {
        if (isPgErrorWithMessage(error, "ITEM_REALIZED_LOCKED")) {
          return json(403, { error: "ITEM_REALIZED_LOCKED" });
        }
        if (isPgErrorWithMessage(error, "FORBIDDEN_SCOPE")) {
          return json(403, { error: "FORBIDDEN_SCOPE" });
        }
        return json(500, { error: "UPDATE_FAILED", detail: String(error.message ?? "unknown") });
      }
      if (!updated?.id) {
        const current = await getLiveItem(authClient, liveItem.id);
        const conflictId = await createConflict(authClient, {
          athleteId: liveItem.user_id,
          actorId,
          entity: "planned_session_items_live",
          entityId: liveItem.id,
          patch,
          expectedVersion,
          currentVersion: current?.version ?? expectedVersion,
          serverRow: current ?? liveItem,
        });
        return json(409, {
          error: "VERSION_CONFLICT",
          conflictId,
          currentVersion: current?.version ?? expectedVersion,
        });
      }

      const row = await getLiveItem(authClient, liveItem.id);
      return json(200, { status: "applied", row });
    }

    if (action === "add_item") {
      const plannedSessionId = asString(payload?.plannedSessionId);
      if (!plannedSessionId) return json(400, { error: "INVALID_INPUT" });

      const { data: session, error: sessionErr } = await authClient
        .from("planned_sessions")
        .select("id, user_id")
        .eq("id", plannedSessionId)
        .maybeSingle();
      if (sessionErr) return json(500, { error: "SESSION_LOOKUP_FAILED", detail: sessionErr.message });
      if (!session?.id || !session?.user_id) return json(404, { error: "SESSION_NOT_FOUND" });

      const athleteId = String(session.user_id);
      const allowed = await canEditAthlete(authClient, actorId, athleteId);
      if (!allowed) return json(403, { error: "FORBIDDEN_SCOPE" });

      const { data: maxPosRow } = await authClient
        .from("planned_session_items_live")
        .select("position")
        .eq("planned_session_id", plannedSessionId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextPosition = Number(maxPosRow?.position ?? 0) + 1;

      const patch = parsePatch(payload?.item);
      const { data: inserted, error } = await authClient
        .from("planned_session_items_live")
        .insert({
          user_id: athleteId,
          planned_session_id: plannedSessionId,
          position: nextPosition,
          exercise_name: asString(patch.exercise_name) ?? "Nouvel exercice",
          series_raw: patch.series_raw ?? null,
          reps_raw: patch.reps_raw ?? null,
          load_raw: patch.load_raw ?? null,
          tempo_raw: patch.tempo_raw ?? null,
          rest_raw: patch.rest_raw ?? null,
          rir_raw: patch.rir_raw ?? null,
          coach_notes: patch.coach_notes ?? null,
          payload: asRecord(patch.payload) ?? {},
        })
        .select("id")
        .single();
      if (error || !inserted?.id) {
        if (isPgErrorWithMessage(error, "FORBIDDEN_SCOPE")) {
          return json(403, { error: "FORBIDDEN_SCOPE" });
        }
        return json(500, { error: "INSERT_FAILED", detail: String(error?.message ?? "unknown") });
      }
      const row = await getLiveItem(authClient, String(inserted.id));
      return json(200, { status: "applied", row });
    }

    if (action === "remove_item") {
      const liveItemId = asString(payload?.liveItemId);
      const expectedVersion = asInt(payload?.expectedVersion);
      if (!liveItemId || expectedVersion === null) return json(400, { error: "INVALID_INPUT" });

      const liveItem = await getLiveItem(authClient, liveItemId);
      if (!liveItem) return json(404, { error: "ITEM_NOT_FOUND" });

      const allowed = await canEditAthlete(authClient, actorId, liveItem.user_id);
      if (!allowed) return json(403, { error: "FORBIDDEN_SCOPE" });

      if (liveItem.version !== expectedVersion) {
        const conflictId = await createConflict(authClient, {
          athleteId: liveItem.user_id,
          actorId,
          entity: "planned_session_items_live",
          entityId: liveItem.id,
          patch: { delete: true },
          expectedVersion,
          currentVersion: liveItem.version,
          serverRow: liveItem,
        });
        return json(409, {
          error: "VERSION_CONFLICT",
          conflictId,
          currentVersion: liveItem.version,
        });
      }

      const { error } = await authClient
        .from("planned_session_items_live")
        .delete()
        .eq("id", liveItem.id)
        .eq("version", expectedVersion);
      if (error) {
        if (isPgErrorWithMessage(error, "ITEM_REALIZED_LOCKED")) {
          return json(403, { error: "ITEM_REALIZED_LOCKED" });
        }
        if (isPgErrorWithMessage(error, "FORBIDDEN_SCOPE")) {
          return json(403, { error: "FORBIDDEN_SCOPE" });
        }
        return json(500, { error: "DELETE_FAILED", detail: String(error.message ?? "unknown") });
      }
      return json(200, { status: "applied", id: liveItem.id });
    }

    if (action === "list_conflicts") {
      const athleteId = asString(payload?.athleteId) ?? actorId;
      const allowed = await canEditAthlete(authClient, actorId, athleteId);
      if (!allowed) return json(403, { error: "FORBIDDEN_SCOPE" });

      const { data, error } = await authClient
        .from("sync_conflicts")
        .select("*")
        .eq("user_id", athleteId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) return json(500, { error: "CONFLICT_LIST_FAILED", detail: error.message });
      return json(200, { conflicts: data ?? [] });
    }

    if (action === "resolve_conflict") {
      const conflictId = asString(payload?.conflictId);
      const resolution = asString(payload?.resolution);
      if (!conflictId || !resolution || !["local", "server"].includes(resolution)) {
        return json(400, { error: "INVALID_INPUT" });
      }

      const { data: conflict, error: conflictErr } = await authClient
        .from("sync_conflicts")
        .select("*")
        .eq("id", conflictId)
        .maybeSingle();
      if (conflictErr) return json(500, { error: "CONFLICT_LOOKUP_FAILED", detail: conflictErr.message });
      if (!conflict?.id) return json(404, { error: "CONFLICT_NOT_FOUND" });

      const athleteId = String(conflict.user_id);
      const allowed = await canEditAthlete(authClient, actorId, athleteId);
      if (!allowed) return json(403, { error: "FORBIDDEN_SCOPE" });

      if (resolution === "local" && conflict.entity === "planned_session_items_live" && conflict.entity_id) {
        const patch = asRecord(asRecord(conflict.local_value)?.patch) ?? {};
        const liveItem = await getLiveItem(authClient, String(conflict.entity_id));
        if (liveItem) {
          const { error: mergeErr } = await authClient
            .from("planned_session_items_live")
            .update(patch)
            .eq("id", liveItem.id)
            .eq("version", liveItem.version);
          if (mergeErr && isPgErrorWithMessage(mergeErr, "ITEM_REALIZED_LOCKED")) {
            return json(403, { error: "ITEM_REALIZED_LOCKED" });
          }
          if (mergeErr) {
            return json(500, { error: "LOCAL_RESOLUTION_FAILED", detail: mergeErr.message });
          }
        }
      }

      const { error: resolveErr } = await authClient
        .from("sync_conflicts")
        .update({
          status: "resolved_user",
          resolution,
          resolved_at: new Date().toISOString(),
          resolved_by: actorId,
        })
        .eq("id", conflictId);
      if (resolveErr) return json(500, { error: "CONFLICT_RESOLUTION_FAILED", detail: resolveErr.message });

      return json(200, { status: "resolved", conflictId, resolution });
    }

    return json(400, { error: "UNSUPPORTED_ACTION" });
  } catch (error) {
    return json(500, {
      error: "UNEXPECTED_ERROR",
      detail: error instanceof Error ? error.message : "unknown",
    });
  }
});
