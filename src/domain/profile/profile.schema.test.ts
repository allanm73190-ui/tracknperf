import { describe, expect, it } from "vitest";
import { saveProfileInputSchema } from "./profile.schema";

describe("saveProfileInputSchema", () => {
  it("rejects empty displayName", () => {
    const result = saveProfileInputSchema.safeParse({
      userId: "00000000-0000-0000-0000-000000000000",
      displayName: "   ",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a minimal valid payload", () => {
    const result = saveProfileInputSchema.safeParse({
      userId: "00000000-0000-0000-0000-000000000000",
      displayName: "Alex",
    });

    expect(result.success).toBe(true);
  });
});

