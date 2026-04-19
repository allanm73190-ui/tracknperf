import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("sanity", () => {
  it("parses with zod", () => {
    const schema = z.object({ ok: z.literal(true) });
    expect(schema.parse({ ok: true })).toEqual({ ok: true });
  });
});

