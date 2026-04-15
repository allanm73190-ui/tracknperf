type BadgeVariant = "success" | "warning" | "error" | "neutral";
type BadgeSize = "sm" | "md";

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; color: string }> = {
  success: { bg: "rgba(202,253,0,0.12)", color: "#cafd00" },
  warning: { bg: "rgba(197,126,255,0.12)", color: "#c57eff" },
  error:   { bg: "rgba(255,115,81,0.12)",  color: "#ff7351" },
  neutral: { bg: "rgba(255,255,255,0.08)", color: "#aaa" },
};

const SIZE_STYLES: Record<BadgeSize, { fontSize: number; padding: string }> = {
  sm: { fontSize: 10, padding: "2px 7px" },
  md: { fontSize: 12, padding: "4px 10px" },
};

export function Badge({
  variant = "neutral",
  size = "md",
  children,
}: {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: React.ReactNode;
}) {
  const v = VARIANT_STYLES[variant];
  const s = SIZE_STYLES[size];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 20,
        fontWeight: 700,
        letterSpacing: "0.04em",
        fontFamily: "Manrope, sans-serif",
        background: v.bg,
        color: v.color,
        fontSize: s.fontSize,
        padding: s.padding,
      }}
    >
      {children}
    </span>
  );
}
