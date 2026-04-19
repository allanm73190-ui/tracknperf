// Hyperflux Dark / Kinetic Pulse — design tokens
// Source of truth for inline styles and JS-side theming.
// CSS counterpart: src/styles.css @theme block.

export const COLOR = {
  background: "#0e0e0e",
  surface: "#0e0e0e",
  surfaceContainerLowest: "#000000",
  surfaceContainerLow: "#131313",
  surfaceContainer: "#1a1919",
  surfaceContainerHigh: "#201f1f",
  surfaceContainerHighest: "#262626",
  surfaceBright: "#2c2c2c",
  inverseSurface: "#fcf9f8",

  onBackground: "#ffffff",
  onSurface: "#ffffff",
  onSurfaceVariant: "#adaaaa",
  outline: "#767575",
  outlineVariant: "#484847",

  primary: "#f3ffca",
  primaryContainer: "#cafd00",
  primaryDim: "#beee00",
  onPrimary: "#516700",
  onPrimaryContainer: "#4a5e00",

  secondary: "#c57eff",
  secondaryContainer: "#6a0baa",
  onSecondary: "#340058",
  onSecondaryContainer: "#e6c3ff",

  tertiary: "#ffeea5",
  tertiaryContainer: "#fce047",
  onTertiary: "#665800",

  error: "#ff7351",
  errorContainer: "#b92902",
  onError: "#450900",
  onErrorContainer: "#ffd2c8",
} as const;

export const FONT = {
  headline: '"Space Grotesk", ui-sans-serif, system-ui, -apple-system',
  body: '"Manrope", ui-sans-serif, system-ui, -apple-system',
} as const;

export const RADIUS = {
  sm: "10px",
  md: "14px",
  lg: "18px",
  xl: "24px",
  full: "9999px",
} as const;

export const SHADOW = {
  ambientPurple: "0 24px 80px rgba(197, 126, 255, 0.12)",
  ambientLime: "0 24px 80px rgba(202, 253, 0, 0.09)",
  glowLime: "0 0 18px rgba(202, 253, 0, 0.35)",
  glowPurple: "0 0 18px rgba(197, 126, 255, 0.30)",
} as const;

export const GRADIENT = {
  aero: "linear-gradient(45deg, #beee00 0%, #f3ffca 100%)",
  bodyBg:
    "radial-gradient(900px 500px at 85% 20%, rgba(197, 126, 255, 0.12), transparent 60%), " +
    "radial-gradient(700px 400px at 20% 75%, rgba(202, 253, 0, 0.10), transparent 65%), " +
    "#0e0e0e",
} as const;

export type ColorToken = keyof typeof COLOR;
