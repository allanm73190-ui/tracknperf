import type { ExplanationV1_1 } from "../../domain/engine/v1_1/types";
import { getReasonCodeFR } from "../i18n/reasonCodes.fr";

const DECISION_LABEL: Record<string, string> = {
  progress: "Progression recommandée",
  maintain: "Maintien recommandé",
  reduce: "Réduction recommandée",
  rest: "Repos recommandé",
};

type Props = {
  explanation: ExplanationV1_1 | null | undefined;
};

export function RecommendationExplanationCard({ explanation }: Props) {
  if (!explanation) {
    return (
      <div className="rounded-[1.5rem] bg-surface-container-low p-8 text-center">
        <div className="text-on-surface-variant text-sm">Pas encore de recommandation.</div>
      </div>
    );
  }

  const decision = DECISION_LABEL[explanation.decisionState] ?? explanation.decisionState;
  const top3 = explanation.summary.reasonsTop3.slice(0, 3);
  const completeness = Math.round((explanation.dataQuality.completenessScore ?? 0) * 100);

  return (
    <div className="rounded-[1.5rem] bg-surface-container-low p-6 grid gap-8">
      {/* Header: decision + headline */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: "#c57eff", boxShadow: "0 0 8px #c57eff88" }}
          />
          <span className="text-[10px] font-bold uppercase tracking-widest text-secondary">{decision}</span>
        </div>
        <h2 className="font-headline font-bold text-3xl leading-tight tracking-tighter text-on-surface">
          {explanation.summary.headline}
        </h2>
      </div>

      {/* Reasons */}
      {top3.length > 0 && (
        <div className="grid gap-8">
          <div className="text-[10px] font-bold uppercase tracking-widest text-secondary">
            Pourquoi cette recommandation ?
          </div>
          {top3.map((reason, i) => (
            <div key={reason.code} className="relative pl-8">
              {/* Editorial numbering */}
              <div className="absolute left-0 top-0 font-headline font-black text-4xl leading-none opacity-15 text-primary-container select-none">
                {String(i + 1).padStart(2, "0")}
              </div>
              <p className="text-lg font-headline font-bold text-on-surface leading-tight mb-1">
                {getReasonCodeFR(reason.code)}
              </p>
              {reason.text && (
                <p className="text-sm text-on-surface-variant leading-relaxed">{reason.text}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Data quality */}
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            Qualité des données
          </span>
          <span
            className="font-headline font-bold text-sm tabular-nums"
            style={{ color: completeness >= 70 ? "#cafd00" : completeness >= 40 ? "#c57eff" : "#ff7351" }}
          >
            {completeness}%
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-surface-container-highest overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${completeness}%`,
              background: completeness >= 70
                ? "linear-gradient(90deg, #cafd00, #beee00)"
                : completeness >= 40
                ? "#c57eff"
                : "#ff7351",
            }}
          />
        </div>
        {explanation.dataQuality.missingFields.length > 0 && (
          <div className="text-[10px] text-on-surface-variant mt-1">
            Manquant : {explanation.dataQuality.missingFields.join(", ")}
          </div>
        )}
      </div>

      {/* Footer: algorithm version */}
      <div className="text-[9px] text-on-surface-variant/50 uppercase tracking-widest border-t border-surface-container-highest pt-3">
        Moteur {explanation.algorithmVersion} · config {explanation.configVersion}
      </div>
    </div>
  );
}
