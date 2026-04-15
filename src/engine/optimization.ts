import type {
  PlannedSession, MultidimensionalFatigue, DecisionState,
  EngineExplanation, SignalContribution, RuleFired, PlannedSessionPatch,
} from "../types/engine";
import { defaultEngineConfig } from "./config";

const DECISION_HEADLINES: Record<DecisionState, string> = {
  progress:         "Follow your plan and push forward",
  maintain:         "Follow your planned session",
  reduce_volume:    "Do your session — reduce volume to manage fatigue",
  reduce_intensity: "Do your session — reduce intensity to stay safe",
  substitute:       "Substitute today's session to avoid conflict",
  defer:            "Defer today's session — pain risk too high",
  deload_local:     "Local deload — reduce load on fatigued muscles",
  deload_global:    "Global deload week — your body needs recovery",
  rest:             "Rest day",
};

const REDUCE_TEXTS: Record<string, string> = {
  FATIGUE_HIGH:    "Fatigue is elevated — reducing load protects your adaptation.",
  LOAD_GUARD:      "You've trained a lot this week — backing off prevents overtraining.",
  READINESS_LOW:   "Readiness is low — a lighter session is safer and just as effective.",
  PAIN_RISK:       "Pain signals detected — deferring avoids injury.",
  CONFLICT_HIGH:   "Back-to-back same-type sessions create excessive stress — substituting is smarter.",
  CRITICAL_FATIGUE:"Fatigue is critical across multiple dimensions — a deload week is mandatory.",
  DATA_MISSING:    "Not enough history to assess load — conservative recommendation applied.",
  NO_PLAN_TODAY:   "No session planned for today.",
  FOLLOW_PLAN:     "Your load metrics are healthy — follow the plan.",
};

export function substituteSession(
  planned: PlannedSession,
  fatigue: MultidimensionalFatigue,
  reason: "conflict" | "pain"
): PlannedSession | null {
  if (planned.sessionType === "recovery") return null;

  if (reason === "pain") {
    return { id: `${planned.id}_sub`, sessionType: "recovery", templateName: "Récupération active", scheduledFor: planned.scheduledFor };
  }

  // conflict: swap strength ↔ endurance, or go to mixed
  const substitutes: Record<string, PlannedSession["sessionType"]> = {
    strength:  "endurance",
    endurance: "mixed",
    mixed:     "recovery",
  };
  const newType = substitutes[planned.sessionType];
  if (!newType) return null;

  return { id: `${planned.id}_sub`, sessionType: newType, templateName: `${newType.charAt(0).toUpperCase() + newType.slice(1)} (substitution)`, scheduledFor: planned.scheduledFor };
}

export function reoptimizeMicrocycle(
  week: PlannedSession[],
  fatigue: MultidimensionalFatigue
): PlannedSession[] {
  const cfg = defaultEngineConfig();
  if (fatigue.global < cfg.thresholds.fatigueGlobalHighThreshold) return [...week];

  // Remove back-to-back same types
  const result: PlannedSession[] = [];
  for (const session of week) {
    const last = result[result.length - 1];
    if (last && last.sessionType === session.sessionType && session.sessionType === "strength") {
      // Convert second to mixed to break sequence
      result.push({ ...session, sessionType: "mixed", templateName: `${session.templateName} (allégé)` });
    } else {
      result.push(session);
    }
  }
  return result;
}

export function buildExplanation(args: {
  decisionState: DecisionState;
  progressionAxis: string | null;
  patch: PlannedSessionPatch;
  fatigue: MultidimensionalFatigue;
  rulesFired: RuleFired[];
  algorithmVersion: string;
  configVersion: string;
}): EngineExplanation {
  const headline = DECISION_HEADLINES[args.decisionState] ?? "Recommendation computed";

  const signals: SignalContribution[] = [
    {
      signalId: "fatigue_global",
      rawValue: args.fatigue.global,
      normalizedValue: args.fatigue.global,
      weight: 0.4,
      direction: args.fatigue.global > 0.6 ? "down" : "neutral",
      reasonCode: args.fatigue.global > 0.7 ? "FATIGUE_HIGH" : undefined,
    },
    {
      signalId: "fatigue_muscular",
      rawValue: args.fatigue.muscular,
      normalizedValue: args.fatigue.muscular,
      weight: 0.2,
      direction: args.fatigue.muscular > 0.7 ? "down" : "neutral",
    },
    {
      signalId: "fatigue_cardiovascular",
      rawValue: args.fatigue.cardiovascular,
      normalizedValue: args.fatigue.cardiovascular,
      weight: 0.15,
      direction: args.fatigue.cardiovascular > 0.7 ? "down" : "neutral",
    },
    {
      signalId: "volume_multiplier",
      rawValue: args.patch.volumeMultiplier,
      normalizedValue: args.patch.volumeMultiplier,
      weight: 0.25,
      direction: args.patch.volumeMultiplier < 1 ? "down" : args.patch.volumeMultiplier > 1 ? "up" : "neutral",
    },
  ];

  // Build top 3 reasons from rules fired + state
  const reasonsRaw: Array<{ code: string; text: string }> = [];

  if (args.decisionState === "rest") {
    reasonsRaw.push({ code: "NO_PLAN_TODAY", text: REDUCE_TEXTS.NO_PLAN_TODAY });
    reasonsRaw.push({ code: "DATA_MISSING",  text: "Add a plan to get personalized recommendations." });
  } else {
    for (const rule of args.rulesFired) {
      const text = REDUCE_TEXTS[rule.reasonCode] ?? rule.reasonCode;
      reasonsRaw.push({ code: rule.reasonCode, text });
    }
    if (reasonsRaw.length === 0) {
      reasonsRaw.push({ code: "FOLLOW_PLAN", text: REDUCE_TEXTS.FOLLOW_PLAN });
    }
    if (args.progressionAxis) {
      reasonsRaw.push({ code: "PROGRESSION_AXIS", text: `Progressing on ${args.progressionAxis} axis this session.` });
    }
  }

  // Always ensure exactly 3
  const filler = { code: "DATA_FRESH", text: "Recommendation computed deterministically from current inputs." };
  while (reasonsRaw.length < 3) reasonsRaw.push(filler);
  const reasonsTop3 = reasonsRaw.slice(0, 3);

  return { headline, reasonsTop3, signals, rulesFired: args.rulesFired, decisionState: args.decisionState, algorithmVersion: args.algorithmVersion, configVersion: args.configVersion };
}
