import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type SyncOpStatus = "pending" | "applied" | "failed";

export type SyncOp = {
  opId: string;
  idempotencyKey: string;
  opType: string;
  entity: string;
  payload: Record<string, unknown>;
  status: SyncOpStatus;
  attempts: number;
  nextAttemptAt: number; // epoch ms
  lastError: string | null;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
};

type TrackNPerfDb = DBSchema & {
  sync_ops: {
    key: string;
    value: SyncOp;
    indexes: {
      by_status: SyncOpStatus;
      by_next_attempt_at: number;
    };
  };
};

let dbPromise: Promise<IDBPDatabase<TrackNPerfDb>> | null = null;

function getDb(): Promise<IDBPDatabase<TrackNPerfDb>> {
  if (!dbPromise) {
    dbPromise = openDB<TrackNPerfDb>("tracknperf", 1, {
      upgrade(db) {
        const store = db.createObjectStore("sync_ops", { keyPath: "opId" });
        store.createIndex("by_status", "status");
        store.createIndex("by_next_attempt_at", "nextAttemptAt");
      },
    });
  }
  return dbPromise;
}

export async function enqueueSyncOp(op: Omit<SyncOp, "status" | "attempts" | "nextAttemptAt" | "lastError" | "createdAt" | "updatedAt">): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const row: SyncOp = {
    ...op,
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.put("sync_ops", row);
}

export async function listPendingOps(limit = 25): Promise<SyncOp[]> {
  const db = await getDb();
  const now = Date.now();
  const tx = db.transaction("sync_ops", "readonly");
  const idx = tx.store.index("by_next_attempt_at");
  const ops: SyncOp[] = [];
  let cursor = await idx.openCursor();
  while (cursor && ops.length < limit) {
    const row = cursor.value;
    if (row.status === "pending" && row.nextAttemptAt <= now) ops.push(row);
    cursor = await cursor.continue();
  }
  await tx.done;
  return ops;
}

export async function markOpApplied(opId: string): Promise<void> {
  const db = await getDb();
  const row = await db.get("sync_ops", opId);
  if (!row) return;
  const now = Date.now();
  await db.put("sync_ops", { ...row, status: "applied", updatedAt: now, lastError: null });
}

export async function markOpFailed(opId: string, error: string, nextAttemptAt: number): Promise<void> {
  const db = await getDb();
  const row = await db.get("sync_ops", opId);
  if (!row) return;
  const now = Date.now();
  await db.put("sync_ops", {
    ...row,
    status: "pending",
    attempts: row.attempts + 1,
    lastError: error,
    nextAttemptAt,
    updatedAt: now,
  });
}

export async function getQueueStats(): Promise<{ pending: number; applied: number }> {
  const db = await getDb();
  const tx = db.transaction("sync_ops", "readonly");
  const all = await tx.store.getAll();
  await tx.done;
  let pending = 0;
  let applied = 0;
  for (const r of all) {
    if (r.status === "pending") pending++;
    if (r.status === "applied") applied++;
  }
  return { pending, applied };
}

export async function listRecentOps(limit = 50): Promise<SyncOp[]> {
  const db = await getDb();
  const tx = db.transaction("sync_ops", "readonly");
  const all = await tx.store.getAll();
  await tx.done;
  return all
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, Math.max(1, Math.min(200, limit)));
}

