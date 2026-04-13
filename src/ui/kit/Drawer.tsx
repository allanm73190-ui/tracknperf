import { useEffect } from "react";
import styles from "./kit.module.css";

export function Drawer(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!props.open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") props.onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props]);

  if (!props.open) return null;

  return (
    <div className={styles.drawerOverlay} role="presentation" onMouseDown={() => props.onClose()}>
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label={props.title} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.drawerHeader}>
          <div className={styles.drawerTitle}>{props.title}</div>
          <button type="button" className={styles.drawerClose} onClick={() => props.onClose()}>
            Close
          </button>
        </div>
        <div className={styles.drawerBody}>{props.children}</div>
      </aside>
    </div>
  );
}

