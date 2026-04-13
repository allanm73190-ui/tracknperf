import { describe, expect, it } from "vitest";
import { executedSessionPayloadSchema } from "./executedSessionPayload.schema";

describe("executedSessionPayloadSchema", () => {
  it("accepts minimal payload", () => {
    const res = executedSessionPayloadSchema.parse({});
    expect(res).toEqual({ durationMinutes: null, rpe: null, notes: null });
  });

  it("rejects invalid rpe", () => {
    expect(() => executedSessionPayloadSchema.parse({ rpe: 0 })).toThrow();
    expect(() => executedSessionPayloadSchema.parse({ rpe: 11 })).toThrow();
  });
});

