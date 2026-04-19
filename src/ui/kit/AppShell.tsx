import { Link, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Pill } from "./Pill";
import styles from "./kit.module.css";
import { getQueueStats } from "../../infra/offline/db";
import { SyncDetailDrawer, SyncOp } from "../components/SyncDetailDrawer";

type NavItem = { to: string; label: string };

const BOTTOM_NAV: { to: string; label: string; icon: React.ReactNode }[] = [
  {
    to: "/today",
    label: "Aujourd'hui",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    to: "/stats",
    label: "Stats",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    to: "/history",
    label: "Historique",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    to: "/settings",
    label: "Profil",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

function useSyncPendingCount() {
  const [count, setCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const stats = await getQueueStats();
        if (!cancelled) setCount(stats.pending);
      } catch {
        // IndexedDB unavailable — ignore
      }
    }
    check();
    timerRef.current = setInterval(check, 5000);
    return () => {
      cancelled = true;
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
  }, []);

  return count;
}

export function AppShell(props: {
  title?: string;
  rightSlot?: React.ReactNode;
  nav?: NavItem[];
  children: React.ReactNode;
}) {
  const location = useLocation();
  const nav = props.nav ?? [];
  const pendingCount = useSyncPendingCount();
  const [syncDrawerOpen, setSyncDrawerOpen] = useState(false);

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

      <main
        className={styles.main}
        style={{ paddingBottom: "calc(72px + 22px)" }}
      >
        {props.children}
      </main>

      {/* Bottom navigation — mobile only */}
      <nav
        aria-label="Navigation principale"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          display: "flex",
          alignItems: "stretch",
          background: "rgba(19,19,19,0.88)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          boxShadow: "0 -8px 40px rgba(197,126,255,0.10)",
          height: 72,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
        className="bottom-nav-mobile"
      >
        {BOTTOM_NAV.map((item) => {
          const isSettings = item.to === "/settings";
          const active =
            location.pathname === item.to ||
            (item.to !== "/" && location.pathname.startsWith(item.to));
          const showBadge = isSettings && pendingCount > 0;

          return (
            <Link
              key={item.to}
              to={item.to}
              aria-label={item.label}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                textDecoration: "none",
                color: active ? "#cafd00" : "rgba(255,255,255,0.38)",
                transition: "color 120ms ease",
                position: "relative",
                minWidth: 0,
              }}
            >
              {/* Lime glow blob behind active icon */}
              {active && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -60%)",
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "rgba(202,253,0,0.10)",
                    filter: "blur(10px)",
                    pointerEvents: "none",
                  }}
                />
              )}

              {/* Icon + optional sync badge */}
              <span
                style={{ position: "relative", display: "inline-flex" }}
                onClick={showBadge ? (e) => { e.preventDefault(); setSyncDrawerOpen(true); } : undefined}
              >
                {item.icon}
                {showBadge && (
                  <span
                    aria-label={`${pendingCount} opérations en attente de sync`}
                    style={{
                      position: "absolute",
                      top: -4,
                      right: -6,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 8,
                      background: "#ff7351",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 900,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 3px",
                      lineHeight: 1,
                    }}
                  >
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </span>

              {/* Label */}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  fontFamily: "var(--font-body)",
                  lineHeight: 1,
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  paddingLeft: 4,
                  paddingRight: 4,
                }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Hide bottom nav on desktop */}
      <style>{`
        @media (min-width: 768px) {
          .bottom-nav-mobile { display: none !important; }
        }
        @media (max-width: 767px) {
          .bottom-nav-mobile { display: flex !important; }
        }
      `}</style>

      <SyncDetailDrawer
        isOpen={syncDrawerOpen}
        onClose={() => setSyncDrawerOpen(false)}
        syncStatus={{ pending: pendingCount, applied: 0 }}
        recentOps={[] as SyncOp[]}
        onForceSync={() => {}}
      />
    </div>
  );
}
