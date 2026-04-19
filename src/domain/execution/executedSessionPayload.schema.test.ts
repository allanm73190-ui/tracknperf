import { describe, expect, it } from "vitest";
import { executedSessionPayloadSchema } from "./executedSessionPayload.schema";

describe("executedSessionPayloadSchema", () => {
  it("accepts minimal payload", () => {
    const res = executedSessionPayloadSchema.parse({});
    expect(res).toEqual({
      durationMinutes: null,
      rpe: null,
      painScore: null,
      painLocation: null,
      mood: null,
      notes: null,
    });
  });

  it("rejects invalid rpe", () => {
    expect(() => executedSessionPayloadSchema.parse({ rpe: 0 })).toThrow();
    expect(() => executedSessionPayloadSchema.parse({ rpe: 11 })).toThrow();
  });

  it("rejects invalid painScore", () => {
    expect(() => executedSessionPayloadSchema.parse({ painScore: -1 })).toThrow();
    expect(() => executedSessionPayloadSchema.parse({ painScore: 11 })).toThrow();
  });

  it("rejects invalid mood", () => {
    expect(() => executedSessionPayloadSchema.parse({ mood: "ok" })).toThrow();
  });

  it("accepts full valid payload", () => {
    const res = executedSessionPayloadSchema.parse({
      durationMinutes: 60,
      rpe: 7,
      painScore: 2,
      painLocation: "genou gauche",
      mood: "good",
      notes: "bonne session",
    });
    expect(res.rpe).toBe(7);
    expect(res.mood).toBe("good");
    expect(res.painScore).toBe(2);
  });
});
