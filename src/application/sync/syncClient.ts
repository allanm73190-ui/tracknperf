import { supabase } from "../../infra/supabase/client";
import { listPendingOps, markOpApplied, markOpFailed, type SyncOp } from "../../infra/offline/db";
import { createSyncNotification } from "../usecases/notifications";

function computeBackoffMs(attempts: number): number {
  const base = 1000; // 1s
  const max = 60_000; // 60s
  const pow = Math.min(6, Math.max(0, attempts)); // cap at 2^6
  const ms = base * 2 ** pow;
  return Math.min(max, ms);
}

export type SyncResult = {
  applied: number;
  failed: number;
  pendingAfter: number;
};

type SyncResponse = {
  results: Array<{
    opId: string;
    status: "applied" | "rejected" | "error";
    error?: string;
  }>;
};

export async function flushSyncQueue(): Promise<SyncResult> {
  if (!supabase) throw new Error("Supabase is not configured.");
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { applied: 0, failed: 0, pendingAfter: (await listPendingOps(9999)).length };
  }

  const ops = await listPendingOps(25);
  if (ops.length === 0) return { applied: 0, failed: 0, pendingAfter: 0 };

  const payload = {
    ops: ops.map((o) => ({
      opId: o.opId,
      idempotencyKey: o.idempotencyKey,
      opType: o.opType,
      entity: o.entity,
      payload: o.payload,
    })),
  };

  const { data, error } = await supabase.functions.invoke<SyncResponse>("sync", { body: payload });
  if (error) throw new Error(`Sync failed. (${error.message})`);
  if (!data || !Array.isArray(data.results)) throw new Error("Unexpected sync response.");

  let applied = 0;
  let failed = 0;

  const byOpId = new Map<string, SyncOp>();
  for (const op of ops) byOpId.set(op.opId, op);

  const seen = new Set<string>();
  for (const r of data.results) {
    const op = byOpId.get(r.opId);
    if (!op) continue;
    seen.add(r.opId);
    if (r.status === "applied") {
      applied++;
      await markOpApplied(op.opId);
      continue;
    }
    failed++;
    const nextAt = Date.now() + computeBackoffMs(op.attempts);
    await markOpFailed(op.opId, r.error ?? "Sync rejected.", nextAt);
  }

  // Safety: server must return one result per op. Anything missing gets retried with backoff.
  for (const op of ops) {
    if (seen.has(op.opId)) continue;
    failed++;
    const nextAt = Date.now() + computeBackoffMs(op.attempts);
    await markOpFailed(op.opId, "Sync did not return a result for this op.", nextAt);
  }

  const pendingAfter = (await listPendingOps(9999)).length;

  // Best-effort in-app notifications for sync lifecycle.
  try {
    if (failed > 0) {
      await createSyncNotification({
        title: "Incident de synchronisation",
        message: `${failed} opération(s) en échec. Réessayez lorsque la connexion est stable.`,
        dedupeKey: `sync-error:${new Date().toISOString().slice(0, 16)}`,
        payload: { failed, applied, pendingAfter },
      });
    } else if (applied > 0) {
      await createSyncNotification({
        title: "Synchronisation terminée",
        message: `${applied} opération(s) appliquée(s) avec succès.`,
        dedupeKey: `sync-ok:${new Date().toISOString().slice(0, 16)}`,
        payload: { failed, applied, pendingAfter },
      });
    }
  } catch {
    // Non-blocking notification path.
  }

  return { applied, failed, pendingAfter };
}
