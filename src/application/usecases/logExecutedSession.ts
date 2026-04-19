import {
  executedSessionPayloadSchema,
  type ExecutedSessionPayload,
} from "../../domain/execution/executedSessionPayload.schema";
import { enqueueSyncOp } from "../../infra/offline/db";
import { flushSyncQueue } from "../sync/syncClient";

export type LogExecutedSessionInput = {
  plannedSessionId: string | null;
  planId: string | null;
  startedAt: Date;
  endedAt: Date;
  payload: ExecutedSessionPayload;
};

export async function logExecutedSession(input: LogExecutedSessionInput): Promise<{ id: string }> {
  if (!(input.startedAt instanceof Date) || Number.isNaN(input.startedAt.getTime())) {
    throw new Error("startedAt must be a valid Date.");
  }
  if (!(input.endedAt instanceof Date) || Number.isNaN(input.endedAt.getTime())) {
    throw new Error("endedAt must be a valid Date.");
  }
  if (input.endedAt.getTime() < input.startedAt.getTime()) {
    throw new Error("endedAt must be after startedAt.");
  }

  const payload = executedSessionPayloadSchema.parse(input.payload);

  const opId = crypto.randomUUID();
  const idempotencyKey = opId;
  const executedSessionId = crypto.randomUUID();

  await enqueueSyncOp({
    opId,
    idempotencyKey,
    opType: "insert",
    entity: "executed_sessions",
    payload: {
      id: executedSessionId,
      planned_session_id: input.plannedSessionId,
      plan_id: input.planId,
      started_at: input.startedAt.toISOString(),
      ended_at: input.endedAt.toISOString(),
      payload,
    },
  });

  // Best-effort immediate flush (online path). Offline path keeps it queued.
  try {
    await flushSyncQueue();
  } catch {
    // Swallow to keep logging usable offline.
  }

  // Return the domain id so other offline entities can reference it.
  return { id: executedSessionId };
}

