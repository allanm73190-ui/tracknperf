import { Link, useLocation } from "react-router-dom";
import { Pill } from "./Pill";
import styles from "./kit.module.css";

type NavItem = { to: string; label: string };

export function AppShell(props: {
  title?: string;
  rightSlot?: React.ReactNode;
  nav?: NavItem[];
  children: React.ReactNode;
}) {
  const location = useLocation();
  const nav = props.nav ?? [];

  return (
    <div className={styles.app}>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <div className={styles.brand}>
            <span className={styles.brandMark} />
            <div className={styles.brandText}>
              <div className={styles.brandName}>TrackNPerf</div>
              <div className={styles.brandSub}>{props.title ?? "Training OS"}</div>
            </div>
          </div>
        </div>

        <div className={styles.topbarRight}>
          {props.rightSlot ? <div className={styles.topbarSlot}>{props.rightSlot}</div> : null}
        </div>
      </header>

      {nav.length ? (
        <nav className={styles.nav}>
          {nav.map((it) => {
            const active = location.pathname === it.to;
            return (
              <Link key={it.to} to={it.to} className={active ? styles.navItemActive : styles.navItem}>
                <Pill tone={active ? "primary" : "neutral"}>{it.label}</Pill>
              </Link>
            );
          })}
        </nav>
      ) : null}

      <main className={styles.main}>{props.children}</main>
    </div>
  );
}

