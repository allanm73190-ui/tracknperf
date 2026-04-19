import styles from "./kit.module.css";

export function Card(props: { children: React.ReactNode; tone?: "low" | "highest"; className?: string }) {
  const tone = props.tone ?? "low";
  const cls =
    (tone === "highest" ? styles.cardHighest : styles.cardLow) + (props.className ? ` ${props.className}` : "");
  return <section className={cls}>{props.children}</section>;
}

