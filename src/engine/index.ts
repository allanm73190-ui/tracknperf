import type { EngineInputs, EngineResult, RuleFired } from "../types/engine";
import { defaultEngineConfig } from "./config";
import {
  normalizeInputs, computeLoadState, computeMultidimensionalFatigue,
  computeSessionSpecificReadiness, computeGoalAlignment, computeConflictScore,
  computePainRisk, chooseDecisionState, chooseProgressionAxis,
} from "./rules";
import { updateNextSessionParameters } from "./adaptive";
import { buildExplanation } from "./optimization";

export function runAdaptiveEngine(rawInputs: EngineInputs): EngineResult {
  const inputs = normalizeInputs(rawInputs);
  const config = inputs.config ?? defaultEngineConfig();

  const load    = computeLoadState(inputs);
  const fatigue = computeMultidimensionalFatigue(inputs);
  const sessionType = inputs.today.plannedSession?.sessionType ?? "mixed";
  const readiness   = computeSessionSpecificReadiness(fatigue, sessionType);

  const goalAlignment  = computeGoalAlignment(inputs.athlete.goals, sessionType);
  const conflictScore  = computeConflictScore(inputs.history.recentSessions, sessionType);
  const painRisk       = computePainRisk(fatigue, inputs.today.painReports ?? []);

  const decisionState  = chooseDecisionState({
    plannedSession: inputs.today.plannedSession,
    fatigue, readiness, goalAlignment, conflictScore, painRisk,
  });

  const progressionAxis = chooseProgressionAxis({
    decisionState,
    recentAxes: inputs.history.recentAxes ?? [],
    sessionType,
    goals: inputs.athlete.goals,
  });

  const toleranceProfile = inputs.athlete.toleranceProfile ?? {
    volumeTolerance: 0.7, intensityTolerance: 0.7,
    recoverySensitivity: 0.5, confidenceScore: 0.5,
    updatedAt: inputs.today.date,
  };

  const patch = updateNextSessionParameters({
    decisionState, progressionAxis,
    currentParameters: { targetSets: 4, targetRepsPerSet: 8, targetIntensityPct: 75 },
    toleranceProfile,
  });

  // Build rules fired
  const rulesFired: RuleFired[] = [];
  if (!inputs.today.plannedSession) rulesFired.push({ ruleId: "no_plan", reasonCode: "NO_PLAN_TODAY" });
  if (fatigue.global >= config.thresholds.fatigueGlobalCriticalThreshold) rulesFired.push({ ruleId: "fatigue_critical", reasonCode: "CRITICAL_FATIGUE", detail: `global=${fatigue.global.toFixed(2)}` });
  else if (fatigue.global >= config.thresholds.fatigueGlobalHighThreshold) rulesFired.push({ ruleId: "fatigue_high", reasonCode: "FATIGUE_HIGH", detail: `global=${fatigue.global.toFixed(2)}` });
  if (load.last7dCount > config.thresholds.loadGuardLast7dMaxCount) rulesFired.push({ ruleId: "load_guard", reasonCode: "LOAD_GUARD", detail: `last7d=${load.last7dCount}` });
  if (painRisk >= config.thresholds.painRiskCriticalThreshold) rulesFired.push({ ruleId: "pain_risk", reasonCode: "PAIN_RISK", detail: `risk=${painRisk.toFixed(2)}` });
  if (conflictScore >= config.thresholds.conflictHighThreshold) rulesFired.push({ ruleId: "conflict_high", reasonCode: "CONFLICT_HIGH", detail: `conflict=${conflictScore.toFixed(2)}` });
  if (rulesFired.length === 0) rulesFired.push({ ruleId: "follow_plan", reasonCode: "FOLLOW_PLAN" });

  const explanation = buildExplanation({
    decisionState, progressionAxis, patch, fatigue, rulesFired,
    algorithmVersion: inputs.algorithmVersion,
    configVersion: config.version,
  });

  const action: "rest" | "execute_planned" | "substitute" | "defer" =
    decisionState === "rest"      ? "rest"      :
    decisionState === "substitute" ? "substitute" :
    decisionState === "defer"      ? "defer"      :
    "execute_planned";

  const recommendation = {
    scope: "today" as const,
    decisionState,
    patch: {
      action,
      plannedSessionId: inputs.today.plannedSession?.id ?? null,
      volumeMultiplier:    patch.volumeMultiplier,
      intensityMultiplier: patch.intensityMultiplier,
    },
    progressionAxis,
    algorithmVersion: inputs.algorithmVersion,
    configVersion: config.version,
  };

  return { inputs, load, fatigue, readiness, recommendation, explanation };
}
