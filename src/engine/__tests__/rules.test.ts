import { describe, it, expect } from "vitest";
import {
  normalizeInputs,
  computeLoadState,
  computeMultidimensionalFatigue,
  computeSessionSpecificReadiness,
  computeGoalAlignment,
  computeConflictScore,
  computePainRisk,
  chooseDecisionState,
  chooseProgressionAxis,
} from "../rules";
import type { EngineInputs, MultidimensionalFatigue, ReadinessState } from "../../types/engine";

function makeInputs(overrides: Partial<EngineInputs> = {}): EngineInputs {
  return {
    athlete: { userId: "u1", level: "intermediate", goals: ["strength"] },
    today: { date: "2026-04-15", plannedSession: null },
    history: { recentSessions: [], last7dCount: 0 },
    algorithmVersion: "v2.0.0",
    ...overrides,
  };
}

function makeFatigue(overrides: Partial<MultidimensionalFatigue> = {}): MultidimensionalFatigue {
  return { muscular: 0.2, cardiovascular: 0.2, neural: 0.2, articular: 0.2, global: 0.2, dataQualityScore: 0.9, ...overrides };
}

function makeReadiness(overrides: Partial<ReadinessState> = {}): ReadinessState {
  return { score: 0.8, limitingFactor: "none", ...overrides };
}

describe("normalizeInputs", () => {
  it("clamps negative session counts to 0", () => {
    expect(normalizeInputs(makeInputs({ history: { recentSessions: [], last7dCount: -3 } })).history.last7dCount).toBe(0);
  });
  it("floors fractional session counts", () => {
    expect(normalizeInputs(makeInputs({ history: { recentSessions: [], last7dCount: 4.9 } })).history.last7dCount).toBe(4);
  });
  it("preserves other fields", () => {
    const r = normalizeInputs(makeInputs());
    expect(r.athlete.userId).toBe("u1");
    expect(r.algorithmVersion).toBe("v2.0.0");
  });
});

describe("computeLoadState", () => {
  it("monotony = last7dCount / 7", () => {
    const load = computeLoadState(normalizeInputs(makeInputs({ history: { recentSessions: [], last7dCount: 7 } })));
    expect(load.monotonyProxy).toBeCloseTo(1.0);
  });
  it("strain = last7dCount * monotony", () => {
    const load = computeLoadState(normalizeInputs(makeInputs({ history: { recentSessions: [], last7dCount: 7 } })));
    expect(load.strainProxy).toBeCloseTo(7.0);
  });
  it("zero sessions → zero strain", () => {
    const load = computeLoadState(normalizeInputs(makeInputs()));
    expect(load.strainProxy).toBe(0);
  });
});

describe("computeMultidimensionalFatigue", () => {
  it("low global fatigue with no sessions", () => {
    expect(computeMultidimensionalFatigue(normalizeInputs(makeInputs())).global).toBeLessThanOrEqual(0.2);
  });
  it("muscular > cardiovascular after strength sessions", () => {
    const sessions = [1,2,3].map(d => ({ id:`s${d}`, startedAt:`2026-04-${String(15-d).padStart(2,"0")}T10:00:00Z`, durationMinutes:90, rpe:9, sessionType:"strength" as const, volumeMultiplierApplied: 1, intensityMultiplierApplied: 1 }));
    const f = computeMultidimensionalFatigue(normalizeInputs(makeInputs({ history: { recentSessions: sessions, last7dCount: 3 } })));
    expect(f.muscular).toBeGreaterThan(f.cardiovascular);
  });
  it("cardiovascular > muscular after endurance sessions", () => {
    const sessions = [1,2,3].map(d => ({ id:`s${d}`, startedAt:`2026-04-${String(15-d).padStart(2,"0")}T10:00:00Z`, durationMinutes:90, rpe:8, sessionType:"endurance" as const, volumeMultiplierApplied: 1, intensityMultiplierApplied: 1 }));
    const f = computeMultidimensionalFatigue(normalizeInputs(makeInputs({ history: { recentSessions: sessions, last7dCount: 3 } })));
    expect(f.cardiovascular).toBeGreaterThan(f.muscular);
  });
  it("dataQualityScore < 0.3 with fewer than 3 sessions", () => {
    const f = computeMultidimensionalFatigue(normalizeInputs(makeInputs({ history: { recentSessions: [{ id:"s1", startedAt:"2026-04-14T10:00:00Z", durationMinutes:60, rpe:6, sessionType:"mixed" , volumeMultiplierApplied: 1, intensityMultiplierApplied: 1}], last7dCount: 1 } })));
    expect(f.dataQualityScore).toBeLessThan(0.3);
  });
  it("all dimensions in [0,1]", () => {
    const sessions = [1,2,3,4,5].map(d => ({ id:`s${d}`, startedAt:`2026-04-${String(15-d).padStart(2,"0")}T10:00:00Z`, durationMinutes:120, rpe:10, sessionType:"mixed" as const, volumeMultiplierApplied: 1, intensityMultiplierApplied: 1 }));
    const f = computeMultidimensionalFatigue(normalizeInputs(makeInputs({ history: { recentSessions: sessions, last7dCount: 5 } })));
    for (const dim of [f.muscular, f.cardiovascular, f.neural, f.articular, f.global]) {
      expect(dim).toBeGreaterThanOrEqual(0);
      expect(dim).toBeLessThanOrEqual(1);
    }
  });
});

describe("computeSessionSpecificReadiness", () => {
  it("high readiness when fatigue is low", () => {
    expect(computeSessionSpecificReadiness(makeFatigue({ global: 0.1 }), "strength").score).toBeGreaterThan(0.7);
  });
  it("low readiness when fatigue is high", () => {
    expect(computeSessionSpecificReadiness(makeFatigue({ global:0.9, muscular:0.9, cardiovascular:0.9, neural:0.9, articular:0.9 }), "strength").score).toBeLessThan(0.4);
  });
  it("limitingFactor = 'data' when dataQualityScore is low", () => {
    expect(computeSessionSpecificReadiness(makeFatigue({ dataQualityScore: 0.1 }), "mixed").limitingFactor).toBe("data");
  });
  it("limitingFactor = 'muscular' for strength with high muscular fatigue", () => {
    expect(computeSessionSpecificReadiness(makeFatigue({ muscular: 0.95, global: 0.6 }), "strength").limitingFactor).toBe("muscular");
  });
  it("limitingFactor = 'cardiovascular' for endurance with high cardio fatigue", () => {
    expect(computeSessionSpecificReadiness(makeFatigue({ cardiovascular: 0.95, global: 0.6 }), "endurance").limitingFactor).toBe("cardiovascular");
  });
  it("score in [0,1]", () => {
    const r = computeSessionSpecificReadiness(makeFatigue({ global: 0.5 }), "mixed");
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });
});

describe("computeGoalAlignment", () => {
  it("1.0 when session type matches primary goal", () => {
    expect(computeGoalAlignment(["strength"], "strength")).toBe(1.0);
  });
  it("between 0 and 1 for partial match", () => {
    const s = computeGoalAlignment(["strength","endurance"], "endurance");
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(1.0);
  });
  it("< 0.5 when session type doesn't match goals", () => {
    expect(computeGoalAlignment(["strength"], "endurance")).toBeLessThan(0.5);
  });
  it(">= 0.3 for mixed sessions", () => {
    expect(computeGoalAlignment(["strength"], "mixed")).toBeGreaterThanOrEqual(0.3);
  });
});

describe("computeConflictScore", () => {
  it("0 with no recent sessions", () => {
    expect(computeConflictScore([], "strength")).toBe(0);
  });
  it("> 0.5 when same type done yesterday", () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    expect(computeConflictScore([{ id:"s1", startedAt: yesterday, durationMinutes:90, rpe:8, sessionType:"strength" as const , volumeMultiplierApplied: 1, intensityMultiplierApplied: 1}], "strength")).toBeGreaterThan(0.5);
  });
  it("< 0.3 when different types interleaved", () => {
    expect(computeConflictScore([{ id:"s1", startedAt:"2026-04-14T10:00:00Z", durationMinutes:60, rpe:6, sessionType:"endurance" as const , volumeMultiplierApplied: 1, intensityMultiplierApplied: 1}], "strength")).toBeLessThan(0.3);
  });
  it("in [0,1]", () => {
    const s = computeConflictScore([{ id:"s1", startedAt:"2026-04-14T10:00:00Z", durationMinutes:90, rpe:9, sessionType:"strength" as const , volumeMultiplierApplied: 1, intensityMultiplierApplied: 1}], "strength");
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});

describe("computePainRisk", () => {
  it("low risk with low articular fatigue and no history", () => {
    expect(computePainRisk(makeFatigue({ articular: 0.1 }), [])).toBeLessThan(0.3);
  });
  it("high risk with high articular fatigue", () => {
    expect(computePainRisk(makeFatigue({ articular: 0.9 }), [])).toBeGreaterThan(0.6);
  });
  it("higher risk with recent pain report", () => {
    const base = computePainRisk(makeFatigue({ articular: 0.4 }), []);
    const recentPainDate = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const withPain = computePainRisk(
      makeFatigue({ articular: 0.4 }),
      [{ reportedAt: recentPainDate, bodyZone: "knee", severity: 3 }],
    );
    expect(withPain).toBeGreaterThan(base);
  });
  it("in [0,1]", () => {
    const r = computePainRisk(makeFatigue({ articular: 0.5 }), []);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
  });
});

describe("chooseDecisionState", () => {
  it("'rest' when no planned session", () => {
    expect(chooseDecisionState({ plannedSession:null, fatigue:makeFatigue(), readiness:makeReadiness(), goalAlignment:1.0, conflictScore:0, painRisk:0 })).toBe("rest");
  });
  it("'progress' when readiness high, fatigue low, alignment high", () => {
    expect(chooseDecisionState({ plannedSession:{id:"ps1",sessionType:"strength"}, fatigue:makeFatigue({global:0.1}), readiness:makeReadiness({score:0.9}), goalAlignment:1.0, conflictScore:0, painRisk:0 })).toBe("progress");
  });
  it("'deload_global' when global fatigue critical", () => {
    expect(chooseDecisionState({ plannedSession:{id:"ps1",sessionType:"strength"}, fatigue:makeFatigue({global:0.92,muscular:0.92,cardiovascular:0.85,neural:0.88,articular:0.7}), readiness:makeReadiness({score:0.15}), goalAlignment:0.8, conflictScore:0.3, painRisk:0.2 })).toBe("deload_global");
  });
  it("reduce/deload when fatigue elevated", () => {
    const state = chooseDecisionState({ plannedSession:{id:"ps1",sessionType:"strength"}, fatigue:makeFatigue({global:0.78,muscular:0.8}), readiness:makeReadiness({score:0.35}), goalAlignment:0.9, conflictScore:0.1, painRisk:0.1 });
    expect(["reduce_volume","reduce_intensity","deload_local"]).toContain(state);
  });
  it("'defer' when pain risk critical", () => {
    expect(chooseDecisionState({ plannedSession:{id:"ps1",sessionType:"strength"}, fatigue:makeFatigue({articular:0.6}), readiness:makeReadiness({score:0.6}), goalAlignment:0.8, conflictScore:0.2, painRisk:0.95 })).toBe("defer");
  });
  it("'substitute' when conflict very high", () => {
    expect(chooseDecisionState({ plannedSession:{id:"ps1",sessionType:"strength"}, fatigue:makeFatigue({global:0.5}), readiness:makeReadiness({score:0.5}), goalAlignment:0.9, conflictScore:0.9, painRisk:0.1 })).toBe("substitute");
  });
});

describe("chooseProgressionAxis", () => {
  it("returns one valid axis when progressing", () => {
    const axis = chooseProgressionAxis({ decisionState:"progress", recentAxes:[], sessionType:"strength", goals:["strength"]});
    expect(["volume","intensity","density","complexity"]).toContain(axis);
  });
  it("avoids repeating last axis", () => {
    const axis = chooseProgressionAxis({ decisionState:"progress", recentAxes:["volume"], sessionType:"strength", goals:["strength"]});
    expect(axis).not.toBe("volume");
  });
  it("null for reduce_volume", () => {
    expect(chooseProgressionAxis({ decisionState:"reduce_volume", recentAxes:[], sessionType:"strength", goals:["strength"]})).toBeNull();
  });
  it("null for rest", () => {
    expect(chooseProgressionAxis({ decisionState:"rest", recentAxes:[], sessionType:"strength", goals:["strength"]})).toBeNull();
  });
});
