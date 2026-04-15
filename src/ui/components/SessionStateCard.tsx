type SessionState = "planned" | "recommended" | "executed";

type Props = {
  state: SessionState;
  title: string;
  subtitle?: string;
  meta?: string;
  reasons?: string[];
  onStart?: () => void;
  onFinish?: () => void;
  recommendationId?: string;
};

export function SessionStateCard({ state, title, subtitle, meta, reasons, onStart, onFinish, recommendationId }: Props) {
  if (state === "recommended") {
    return (
      <section className="relative overflow-hidden rounded-[1.5rem] bg-surface-container-low p-8 shadow-[0_0_50px_rgba(202,253,0,0.05)]">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 bg-primary-container text-[#3a4a00] px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest mb-6">
            Recommandé
          </div>
          <h2 className="font-headline text-4xl font-bold text-on-surface leading-none tracking-tighter mb-3">
            {title}
          </h2>
          {subtitle && (
            <p className="text-on-surface-variant text-sm mb-6">{subtitle}</p>
          )}
          {reasons && reasons.length > 0 && (
            <ol className="space-y-2 mb-8">
              {reasons.slice(0, 3).map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-on-surface-variant">
                  <span className="text-primary-container font-bold shrink-0">{i + 1}.</span>
                  {r}
                </li>
              ))}
            </ol>
          )}
          <div className="flex flex-wrap gap-3 items-center">
            {onStart && (
              <button
                onClick={onStart}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm uppercase tracking-widest text-[#3a4a00] active:scale-95 transition-all"
                style={{ background: "linear-gradient(45deg, #beee00 0%, #f3ffca 100%)" }}
              >
                Démarrer
              </button>
            )}
            {recommendationId && (
              <span className="text-[10px] text-on-surface-variant">id: {recommendationId.slice(0, 8)}</span>
            )}
          </div>
        </div>
        <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-primary-container/10 blur-[100px] rounded-full pointer-events-none" />
      </section>
    );
  }

  if (state === "executed") {
    return (
      <div className="flex items-center gap-4 p-4 rounded-[1rem] bg-surface-container-highest">
        <div className="w-10 h-10 rounded-xl bg-primary-container/20 flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8l3.5 3.5L13 4" stroke="#cafd00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-headline font-bold tracking-tight truncate">{title}</div>
          {subtitle && <div className="text-on-surface-variant text-xs mt-0.5">{subtitle}</div>}
        </div>
        {meta && (
          <div className="text-[10px] font-bold text-primary-container uppercase tracking-widest shrink-0">{meta}</div>
        )}
        {onFinish && (
          <button
            onClick={onFinish}
            className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant bg-surface-container-high px-3 py-1.5 rounded-full active:scale-95 transition-all shrink-0"
          >
            Terminer
          </button>
        )}
      </div>
    );
  }

  // planned
  return (
    <div className="flex items-center gap-4 p-4 rounded-[1rem] bg-surface-container-highest">
      <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center shrink-0">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="3" y="3" width="10" height="10" rx="2" stroke="#adaaaa" strokeWidth="1.5" />
          <path d="M6 8h4M8 6v4" stroke="#adaaaa" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-headline font-bold tracking-tight text-on-surface-variant truncate">{title}</div>
        {subtitle && <div className="text-[#adaaaa]/60 text-xs mt-0.5">{subtitle}</div>}
      </div>
      {meta && (
        <div className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest shrink-0">{meta}</div>
      )}
    </div>
  );
}
