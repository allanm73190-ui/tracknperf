import { supabase } from "../../infra/supabase/client";

export type InAppNotification = {
  id: string;
  category: "overload" | "session" | "sync" | "coach";
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  payload: Record<string, unknown>;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

export async function listInAppNotifications(limit = 30): Promise<InAppNotification[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const { data, error } = await supabase
    .from("notifications")
    .select("id, category, title, message, payload, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String((row as { id: unknown }).id),
    category: String((row as { category: unknown }).category) as InAppNotification["category"],
    title: String((row as { title: unknown }).title),
    message: String((row as { message: unknown }).message),
    createdAt: String((row as { created_at: unknown }).created_at),
    readAt: (row as { read_at?: unknown }).read_at ? String((row as { read_at: unknown }).read_at) : null,
    payload: asRecord((row as { payload?: unknown }).payload) ?? {},
  }));
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);
  if (error) throw new Error(error.message);
}

export async function createSyncNotification(args: {
  title: string;
  message: string;
  dedupeKey?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  if (!supabase) return;
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user?.id) return;

  const userId = userRes.user.id;
  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    category: "sync",
    title: args.title,
    message: args.message,
    dedupe_key: args.dedupeKey ?? null,
    payload: args.payload ?? {},
  });
  if (error && !String(error.message).toLowerCase().includes("duplicate")) {
    throw new Error(error.message);
  }
}
