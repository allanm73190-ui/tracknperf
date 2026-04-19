import { reasonCodes } from "./reasonCodes";
import type { EngineConfig, EngineInput, EngineResult, Explanation, RecommendationOutput } from "./types";

function defaultConfig(): EngineConfig {
  return { conservativeByDefault: true };
}

function buildExplanation(args: {
  headline: string;
  reasonsTop3: Array<{ code: keyof typeof reasonCodes; text: string }>;
  dataQuality: Explanation["dataQuality"];
  rulesFired: Explanation["rulesFired"];
}): Explanation {
  return {
    summary: {
      headline: args.headline,
      reasonsTop3: args.reasonsTop3.map((r) => ({ code: reasonCodes[r.code], text: r.text })),
    },
    dataQuality: args.dataQuality,
    rulesFired: args.rulesFired,
  };
}

export function computeRecommendationV1(input: EngineInput, config: EngineConfig = defaultConfig()): EngineResult {
  // Deterministic V1 baseline:
  // - If a planned session exists today => recommend following the plan.
  // - Else => recommend rest / recovery.
  const plannedPresent = Boolean(input.plannedSession?.id);
  const dataQuality = {
    plannedSessionPresent: plannedPresent,
    hasRecentExecutionHistory: input.recentExecutedSessionsCount > 0,
  };

  let output: RecommendationOutput;
  let explanation: Explanation;

  if (plannedPresent && input.plannedSession) {
    output = {
      kind: "follow_plan",
      plannedSessionId: input.plannedSession.id,
      recommendedTemplateName: input.plannedSession.templateName,
      patch: {
        action: "execute_planned",
        planned_session_id: input.plannedSession.id,
        session_template_id: input.plannedSession.sessionTemplateId,
      },
    };

    explanation = buildExplanation({
      headline: "Follow your planned session",
      reasonsTop3: [
        { code: "FOLLOW_PLAN", text: "You have a planned session for today." },
        {
          code: "CONSERVATIVE_DEFAULT",
          text: config.conservativeByDefault
            ? "Defaulting to the plan until we have enough signals to adapt safely."
            : "Using plan as the baseline recommendation.",
        },
        {
          code: "DATA_MISSING",
          text: dataQuality.hasRecentExecutionHistory
            ? "Some training signals are not connected yet, so we keep the recommendation simple."
            : "No recent execution history yet, so we keep the recommendation simple.",
        },
      ],
      dataQuality,
      rulesFired: [
        { code: reasonCodes.FOLLOW_PLAN, detail: "planned_session_present" },
        { code: reasonCodes.CONSERVATIVE_DEFAULT, detail: "baseline_policy" },
      ],
    });
  } else {
    output = {
      kind: "rest",
      plannedSessionId: null,
      recommendedTemplateName: "Rest",
      patch: { action: "rest" },
    };

    explanation = buildExplanation({
      headline: "Rest day",
      reasonsTop3: [
        { code: "NO_PLAN_TODAY", text: "No planned session found for today." },
        { code: "CONSERVATIVE_DEFAULT", text: "We default to a safe recovery recommendation." },
        { code: "DATA_MISSING", text: "Add a plan to unlock personalized recommendations." },
      ],
      dataQuality,
      rulesFired: [{ code: reasonCodes.NO_PLAN_TODAY, detail: "no_planned_session" }],
    });
  }

  return { input, output, explanation };
}

