import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TodayOverview } from "./getTodayOverview";

const mockSupabase = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
}));

vi.mock("../../infra/supabase/client", () => ({ supabase: mockSupabase }));

vi.mock("../../infra/supabase/snapshotRepository", () => ({
  getLatestFatigueSnapshot: vi.fn().mockResolvedValue(null),
  getLatestReadinessSnapshot: vi.fn().mockResolvedValue(null),
  saveLatestFatigueSnapshot: vi.fn().mockResolvedValue(undefined),
  saveLatestReadinessSnapshot: vi.fn().mockResolvedValue(undefined),
}));

import { computeAndPersistTodayRecommendation } from "./computeAndPersistTodayRecommendation";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeOverview(planned: TodayOverview["planned"] = []): TodayOverview {
  return { todayIso: "2026-04-14", planned, executed: [] };
}

const PLANNED_SESSION: TodayOverview["planned"][number] = {
  id: "ps-1",
  scheduledFor: "2026-04-14",
  planId: "plan-1",
  planVersionId: "pv-1",
  sessionTemplateId: "tpl-1",
  templateName: "Strength A",
  payload: {},
};

/** Returns a fluent Supabase chain stub; terminal resolves with `result`. */
function makeChain(terminalResult: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = [
    "select", "insert", "eq", "gte", "contains", "not",
    "order", "limit", "maybeSingle", "single",
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain["single"]!.mockResolvedValue(terminalResult);
  chain["maybeSingle"]!.mockResolvedValue(terminalResult);
  chain["limit"]!.mockResolvedValue(terminalResult);
  return chain;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("computeAndPersistTodayRecommendation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
  });

  it("returns null when there is no planned session", async () => {
    const result = await computeAndPersistTodayRecommendation(makeOverview([]));
    expect(result).toBeNull();
    expect(mockSupabase.auth.getUser).not.toHaveBeenCalled();
  });

  it("S1: planned session + no prior reco → computes, persists, returns PersistedRecommendation", async () => {
    const tables: string[] = [];

    mockSupabase.from.mockImplementation((table: string) => {
      tables.push(table);
      const n = tables.filter((t) => t === table).length;

      if (table === "recommendations" && n === 1) {
        // de-dupe select → no existing reco
        return makeChain({ data: [], error: null });
      }
      if (table === "plan_versions" && n === 1) {
        // loadEngineContext: find latest plan version
        return makeChain({ data: [{ id: "pv-1" }], error: null });
      }
      if (table === "plan_versions" && n === 2) {
        // loadEngineContext: load plan version detail
        return makeChain({
          data: { id: "pv-1", config_profile_id: null, algorithm_version_id: null },
          error: null,
        });
      }
      if (table === "session_feedback") {
        return makeChain({ data: [], error: null });
      }
      if (table === "fatigue_snapshots" || table === "readiness_snapshots") {
        return makeChain({ data: null, error: null });
      }
      if (table === "recommendations" && n === 2) {
        // insert reco
        return makeChain({
          data: { id: "reco-new", output: { action: "follow_plan" } },
          error: null,
        });
      }
      if (table === "recommendation_explanations") {
        return makeChain({
          data: { id: "exp-new", content: { summary: {} } },
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });

    const result = await computeAndPersistTodayRecommendation(
      makeOverview([PLANNED_SESSION]),
    );

    expect(result).not.toBeNull();
    expect(result?.recommendationId).toBe("reco-new");
    expect(result?.explanationId).toBe("exp-new");
    expect(typeof result?.output).toBe("object");
  });

  it("S3: existing reco today → returns cache, skips engine + insert", async () => {
    const tables: string[] = [];

    mockSupabase.from.mockImplementation((table: string) => {
      tables.push(table);
      const n = tables.filter((t) => t === table).length;

      if (table === "recommendations" && n === 1) {
        // de-dupe → cache hit
        return makeChain({
          data: [{ id: "reco-cached", output: { action: "reduce_volume" } }],
          error: null,
        });
      }
      if (table === "recommendation_explanations" && n === 1) {
        return makeChain({
          data: [{ id: "exp-cached", content: {} }],
          error: null,
        });
      }
      // Any second call to recommendations/explanations would be an unexpected insert
      return makeChain({ data: null, error: null });
    });

    const result = await computeAndPersistTodayRecommendation(
      makeOverview([PLANNED_SESSION]),
    );

    expect(result?.recommendationId).toBe("reco-cached");
    expect(result?.explanationId).toBe("exp-cached");

    // Only 1 hit each on these tables — no insert occurred
    const recoCalls = tables.filter((t) => t === "recommendations").length;
    const expCalls = tables.filter((t) => t === "recommendation_explanations").length;
    expect(recoCalls).toBe(1);
    expect(expCalls).toBe(1);
  });
});
