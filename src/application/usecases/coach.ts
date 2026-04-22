import { supabase } from "../../infra/supabase/client";

export type CoachAthlete = {
  athleteId: string;
  displayName: string | null;
  email: string | null;
  assignedAt: string;
  notes: string | null;
};

export type CoachPlannedSession = {
  id: string;
  athleteId: string;
  scheduledFor: string;
  templateName: string | null;
};

export type CoachConflict = {
  id: string;
  userId: string;
  entity: string;
  entityId: string | null;
  field: string | null;
  localVersion: number | null;
  serverVersion: number | null;
  status: "pending" | "resolved_auto" | "resolved_user";
  resolution: "local" | "server" | null;
  localValue: Record<string, unknown> | null;
  serverValue: Record<string, unknown> | null;
  createdAt: string;
};

export type PlannedSessionChangeTimelineRow = {
  id: string;
  changeType: "insert" | "update" | "delete";
  changedAt: string;
  changedBy: string | null;
  changedByName: string | null;
  fieldsChanged: string[];
  reason: string | null;
  source: string;
};

export class CoachApiError extends Error {
  code: string;
  status: number;
  detail: string | null;

  constructor(args: { code: string; status: number; detail?: string | null }) {
    super(args.code);
    this.code = args.code;
    this.status = args.status;
    this.detail = args.detail ?? null;
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

async function getCurrentUserId(): Promise<string> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) throw new Error("Utilisateur non authentifié.");
  return data.user.id;
}

export async function getCoachRoster(): Promise<CoachAthlete[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const coachId = await getCurrentUserId();

  const { data: assignments, error } = await supabase
    .from("coach_athlete_assignments")
    .select("athlete_user_id, assigned_at, notes")
    .eq("coach_user_id", coachId)
    .eq("active", true)
    .order("assigned_at", { ascending: false });
  if (error) throw new Error(error.message);

  const athleteIds = (assignments ?? [])
    .map((row) => asString(row.athlete_user_id))
    .filter((id): id is string => Boolean(id));
  if (athleteIds.length === 0) return [];

  const { data: profiles, error: profileErr } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", athleteIds);
  if (profileErr) throw new Error(profileErr.message);

  const profileById = new Map<string, { displayName: string | null; email: string | null }>();
  for (const row of profiles ?? []) {
    const id = asString((row as { id?: unknown }).id);
    if (!id) continue;
    profileById.set(id, {
      displayName: asString((row as { display_name?: unknown }).display_name),
      email: asString((row as { email?: unknown }).email),
    });
  }

  return (assignments ?? [])
    .map((row) => {
      const athleteId = asString((row as { athlete_user_id?: unknown }).athlete_user_id);
      if (!athleteId) return null;
      const profile = profileById.get(athleteId);
      return {
        athleteId,
        displayName: profile?.displayName ?? null,
        email: profile?.email ?? null,
        assignedAt: String((row as { assigned_at?: unknown }).assigned_at ?? new Date().toISOString()),
        notes: asString((row as { notes?: unknown }).notes),
      } satisfies CoachAthlete;
    })
    .filter((x): x is CoachAthlete => x !== null);
}

export async function getAthletePlannedSessions(args: {
  athleteId: string;
  from?: string;
  to?: string;
}): Promise<CoachPlannedSession[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  let query = supabase
    .from("planned_sessions")
    .select(`
      id,
      user_id,
      scheduled_for,
      session_templates:session_template_id ( name ),
      plans!inner ( active )
    `)
    .eq("user_id", args.athleteId)
    .eq("plans.active", true)
    .order("scheduled_for", { ascending: true });

  if (args.from) query = query.gte("scheduled_for", args.from);
  if (args.to) query = query.lte("scheduled_for", args.to);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const templateObj = asRecord((row as { session_templates?: unknown }).session_templates);
    return {
      id: String((row as { id: unknown }).id),
      athleteId: String((row as { user_id: unknown }).user_id),
      scheduledFor: String((row as { scheduled_for: unknown }).scheduled_for),
      templateName: asString(templateObj?.name),
    };
  });
}

export async function getPlannedSessionChangeTimeline(
  plannedSessionId: string,
): Promise<PlannedSessionChangeTimelineRow[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("planned_session_item_changes")
    .select(`
      id,
      change_type,
      changed_at,
      changed_by,
      fields_changed,
      reason,
      source
    `)
    .eq("planned_session_id", plannedSessionId)
    .order("changed_at", { ascending: false });
  if (error) throw new Error(error.message);

  const actorIds = (data ?? [])
    .map((row) => asString((row as { changed_by?: unknown }).changed_by))
    .filter((id): id is string => Boolean(id));
  const uniqueActorIds = Array.from(new Set(actorIds));

  const actorNameById = new Map<string, string>();
  if (uniqueActorIds.length > 0) {
    const { data: actors } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", uniqueActorIds);
    for (const actor of actors ?? []) {
      const id = asString((actor as { id?: unknown }).id);
      if (!id) continue;
      actorNameById.set(id, asString((actor as { display_name?: unknown }).display_name) ?? "Utilisateur");
    }
  }

  return (data ?? []).map((row) => {
    const changedBy = asString((row as { changed_by?: unknown }).changed_by);
    const fields = Array.isArray((row as { fields_changed?: unknown }).fields_changed)
      ? ((row as { fields_changed: unknown[] }).fields_changed.map((x) => String(x)))
      : [];
    return {
      id: String((row as { id: unknown }).id),
      changeType: String((row as { change_type: unknown }).change_type) as "insert" | "update" | "delete",
      changedAt: String((row as { changed_at: unknown }).changed_at),
      changedBy,
      changedByName: changedBy ? actorNameById.get(changedBy) ?? null : null,
      fieldsChanged: fields,
      reason: asString((row as { reason?: unknown }).reason),
      source: asString((row as { source?: unknown }).source) ?? "application",
    };
  });
}

type CoachFunctionResponse = Record<string, unknown>;

async function invokeCoachFunction(
  action: string,
  payload: Record<string, unknown>,
): Promise<CoachFunctionResponse> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.functions.invoke<CoachFunctionResponse>("coach-edit", {
    body: { action, ...payload },
  });
  if (!error) return asRecord(data) ?? {};

  const status = Number((error as { context?: { status?: unknown } }).context?.status ?? 500);
  let code = "COACH_API_ERROR";
  let detail: string | null = error.message ?? null;

  const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
  if (context?.json) {
    try {
      const body = await context.json();
      const rec = asRecord(body);
      code = asString(rec?.error) ?? code;
      detail = asString(rec?.detail) ?? detail;
    } catch {
      // ignore parse errors
    }
  }

  throw new CoachApiError({ code, status, detail });
}

export async function coachUpdateLiveItem(args: {
  liveItemId: string;
  expectedVersion: number;
  patch: Record<string, unknown>;
}): Promise<CoachFunctionResponse> {
  return invokeCoachFunction("update_item", args);
}

export async function coachAddLiveItem(args: {
  plannedSessionId: string;
  item: Record<string, unknown>;
}): Promise<CoachFunctionResponse> {
  return invokeCoachFunction("add_item", args);
}

export async function coachRemoveLiveItem(args: {
  liveItemId: string;
  expectedVersion: number;
}): Promise<CoachFunctionResponse> {
  return invokeCoachFunction("remove_item", args);
}

export async function coachListConflicts(athleteId: string): Promise<CoachConflict[]> {
  const res = await invokeCoachFunction("list_conflicts", { athleteId });
  const conflicts = Array.isArray(res.conflicts) ? res.conflicts : [];
  return conflicts.map((row) => {
    const rec = asRecord(row) ?? {};
    return {
      id: asString(rec.id) ?? "",
      userId: asString(rec.user_id) ?? "",
      entity: asString(rec.entity) ?? "",
      entityId: asString(rec.entity_id),
      field: asString(rec.field),
      localVersion: typeof rec.local_version === "number" ? rec.local_version : null,
      serverVersion: typeof rec.server_version === "number" ? rec.server_version : null,
      status: (asString(rec.status) ?? "pending") as CoachConflict["status"],
      resolution: (asString(rec.resolution) as CoachConflict["resolution"]) ?? null,
      localValue: asRecord(rec.local_value),
      serverValue: asRecord(rec.server_value),
      createdAt: asString(rec.created_at) ?? "",
    };
  });
}

export async function coachResolveConflict(args: {
  conflictId: string;
  resolution: "local" | "server";
}): Promise<void> {
  await invokeCoachFunction("resolve_conflict", args);
}
