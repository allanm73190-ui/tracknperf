import styles from "./kit.module.css";

export function Button(props: {
  variant?: "primary" | "ghost";
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const variant = props.variant ?? "ghost";
  return (
    <button
      type={props.type ?? "button"}
      className={variant === "primary" ? styles.btnPrimary : styles.btnGhost}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

