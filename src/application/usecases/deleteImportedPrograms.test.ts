import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabase = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
}));

vi.mock("../../infra/supabase/client", () => ({ supabase: mockSupabase }));

import { deleteAllImportedPrograms } from "./deleteImportedPrograms";

describe("deleteAllImportedPrograms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("purges mutable imported program data and deactivates plans", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    let plansCall = 0;
    let plannedSessionsCall = 0;
    let templatesCall = 0;

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "plans") {
        plansCall += 1;
        if (plansCall === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  { id: "plan-1", active: true },
                  { id: "plan-2", active: false },
                ],
                error: null,
              }),
            }),
          };
        }
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      }

      if (table === "plan_versions") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: "pv-1", plan_id: "plan-1" }],
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "planned_sessions") {
        plannedSessionsCall += 1;
        if (plannedSessionsCall === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ count: 4, error: null }),
              }),
            }),
          };
        }
        return {
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      }

      if (table === "session_templates") {
        templatesCall += 1;
        if (templatesCall === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ count: 3, error: null }),
              }),
            }),
          };
        }
        return {
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const result = await deleteAllImportedPrograms();
    expect(result).toMatchObject({
      deletedPlannedSessions: 4,
      deletedTemplates: 3,
      deactivatedPlans: 1,
      deletedPlans: 1,
    });
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

