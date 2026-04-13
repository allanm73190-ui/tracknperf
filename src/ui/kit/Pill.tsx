import styles from "./kit.module.css";

export function Pill(props: { tone?: "neutral" | "primary" | "secondary" | "error"; children: React.ReactNode }) {
  const tone = props.tone ?? "neutral";
  const cls =
    tone === "primary"
      ? styles.pillPrimary
      : tone === "secondary"
        ? styles.pillSecondary
        : tone === "error"
          ? styles.pillError
          : styles.pillNeutral;
  return <span className={cls}>{props.children}</span>;
}

