import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { enqueueSyncOp, getQueueStats, listPendingOps } from "./db";

describe("offline db (sync_ops)", () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase("tracknperf");
  });

  it("enqueues ops and lists pending", async () => {
    await enqueueSyncOp({
      opId: "op1",
      idempotencyKey: "op1",
      opType: "insert",
      entity: "executed_sessions",
      payload: { foo: "bar" },
    });

    const ops = await listPendingOps(10);
    expect(ops.map((o) => o.opId)).toEqual(["op1"]);

    const stats = await getQueueStats();
    expect(stats.pending).toBe(1);
  });
});

