type SessionState = "planned" | "executed";

type Props = {
  state: SessionState;
  title: string;
  subtitle?: string;
  meta?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function SessionStateCard({ state, title, subtitle, meta, actionLabel, onAction }: Props) {
  const icon = state === "executed" ? "✓" : "○";
  const toneClass =
    state === "executed"
      ? "bg-primary-container/15 text-primary"
      : "bg-surface-container text-on-surface-variant";

  return (
    <div className="rounded-[1rem] bg-surface-container-highest p-4 flex items-center gap-3">
      <div
        className={`w-9 h-9 rounded-[0.8rem] flex items-center justify-center text-sm font-black shrink-0 ${toneClass}`}
        aria-hidden
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-headline font-bold tracking-tight truncate">{title}</div>
        {subtitle ? <div className="text-xs text-on-surface-variant mt-0.5">{subtitle}</div> : null}
      </div>
      {meta ? (
        <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant shrink-0">{meta}</div>
      ) : null}
      {onAction && actionLabel ? (
        <button
          type="button"
          onClick={onAction}
          className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant bg-surface-container px-3 py-1.5 rounded-full active:scale-95 transition-all shrink-0"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
