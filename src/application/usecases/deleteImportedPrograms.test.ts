import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabase = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
}));

vi.mock("../../infra/supabase/client", () => ({ supabase: mockSupabase }));

import { deleteAllImportedPrograms } from "./deleteImportedPrograms";

function makeCountChain(result: { count: number | null; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockResolvedValue(result);
  return chain;
}

function makeDeleteChain(result: { error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockResolvedValue(result);
  return chain;
}

describe("deleteAllImportedPrograms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes all plans for the authenticated user and returns deleted count", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    let call = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      expect(table).toBe("plans");
      call += 1;
      if (call === 1) return makeCountChain({ count: 3, error: null });
      return makeDeleteChain({ error: null });
    });

    const result = await deleteAllImportedPrograms();
    expect(result.deletedPlans).toBe(3);
    expect(mockSupabase.from).toHaveBeenCalledTimes(2);
  });

  it("throws when no authenticated user is available", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(deleteAllImportedPrograms()).rejects.toThrow(/authentifi/i);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });
});

