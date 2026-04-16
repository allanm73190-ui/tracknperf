import { useEffect, useMemo, useState } from "react";
import { getExecutedSessionStats } from "../../application/usecases/getExecutedSessions";
import { AppShell } from "../kit/AppShell";

type Stats = {
  executedCount: number;
  totalDurationMinutes: number;
};

const RANGE_OPTIONS = [7, 14, 30, 90] as const;
const BAR_HEIGHTS = [40, 65, 50, 90, 70, 30, 20];
const BAR_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export default function StatsPage() {
  const [days, setDays] = useState<(typeof RANGE_OPTIONS)[number]>(14);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({ executedCount: 0, totalDurationMinutes: 0 });

  const sinceIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }, [days]);

  useEffect(() => {
    let ignore = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const data = await getExecutedSessionStats(sinceIso);
        if (!ignore) setStats(data);
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : "Erreur de chargement.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void run();
    return () => { ignore = true; };
  }, [sinceIso]);

  const hours = Math.round(stats.totalDurationMinutes / 60);

  return (
    <AppShell
      title="Stats"
      nav={[
        { to: "/today", label: "Today" },
        { to: "/history", label: "History" },
        { to: "/stats", label: "Stats" },
        { to: "/admin", label: "Admin" },
      ]}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40 }}>

        {/* Hero */}
        <section>
          <p style={{
            fontFamily: "var(--font-headline)",
            color: "#c57eff",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            marginBottom: 6,
          }}>
            Performance Globale
          </p>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{
              fontFamily: "var(--font-headline)",
              fontSize: "clamp(56px, 16vw, 80px)",
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1,
            }}>
              {loading ? "\u2014" : stats.executedCount}
            </span>
            <span style={{ fontFamily: "var(--font-headline)", fontSize: 28, fontWeight: 700, color: "#c57eff" }}>
              \u00e9ances
            </span>
          </div>
          <p style={{ color: "#adaaaa", fontSize: 13, marginTop: 8, maxWidth: 320 }}>
            {loading ? "Chargement\u2026" : `${stats.totalDurationMinutes} minutes enregistr\u00e9es sur les ${days} derniers jours.`}
          </p>
        </section>

        {/* Range selector */}
        <div style={{ display: "flex", gap: 8 }}>
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => setDays(opt)}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.05em",
                background: days === opt ? "linear-gradient(45deg, #6a0baa 0%, #c57eff 100%)" : "rgba(255,255,255,0.06)",
                color: days === opt ? "#ffffff" : "#adaaaa",
                transition: "all 0.15s",
              }}
            >
              {opt}j
            </button>
          ))}
        </div>

        {error && (
          <div style={{
            background: "rgba(255,115,81,0.08)",
            border: "1px solid rgba(255,115,81,0.25)",
            borderRadius: 12,
            padding: "12px 16px",
            color: "#ff7351",
            fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* Bento grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

          {/* Bar chart */}
          <div style={{
            gridColumn: "1 / -1",
            background: "#131313",
            borderRadius: 16,
            padding: "24px 20px",
            border: "1px solid rgba(255,255,255,0.05)",
            position: "relative",
            overflow: "hidden",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div>
                <h3 style={{ fontFamily: "var(--font-headline)", fontSize: 18, fontWeight: 700, margin: 0 }}>
                  Activit\u00e9 Hebdomadaire
                </h3>
                <p style={{ color: "#adaaaa", fontSize: 12, margin: "4px 0 0" }}>Minutes d'intensit\u00e9</p>
              </div>
              <div style={{
                background: "rgba(106,11,170,0.25)",
                border: "1px solid rgba(197,126,255,0.2)",
                borderRadius: 999,
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 700,
                color: "#c57eff",
              }}>
                +24% vs Moy.
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
              {BAR_HEIGHTS.map((h, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%" }}>
                  <div style={{
                    width: "100%",
                    marginTop: "auto",
                    height: `${h}%`,
                    background: h === 90 ? "#c57eff" : `rgba(197,126,255,${(h / 100 * 0.5).toFixed(2)})`,
                    borderRadius: "4px 4px 0 0",
                    boxShadow: h === 90 ? "0 0 16px rgba(197,126,255,0.4)" : "none",
                  }} />
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: h === 90 ? "#c57eff" : "#adaaaa",
                  }}>
                    {BAR_LABELS[i]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Metric: sessions */}
          <div style={{ background: "#1a1a1a", borderRadius: 16, padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ fontSize: 22, color: "#c57eff" }}>\u26a1</span>
            <div>
              <p style={{ color: "#adaaaa", fontSize: 12, margin: 0 }}>S\u00e9ances compl\u00e8tes</p>
              <p style={{ fontFamily: "var(--font-headline)", fontSize: 36, fontWeight: 900, letterSpacing: "-0.04em", margin: "4px 0 0", lineHeight: 1 }}>
                {loading ? "\u2014" : stats.executedCount}
              </p>
              <p style={{ color: "#c57eff", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 8 }}>
                {days} derniers jours
              </p>
            </div>
          </div>

          {/* Metric: time */}
          <div style={{ background: "#1a1a1a", borderRadius: 16, padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ fontSize: 22, color: "#c57eff" }}>\u2665</span>
            <div>
              <p style={{ color: "#adaaaa", fontSize: 12, margin: 0 }}>Temps total</p>
              <p style={{ fontFamily: "var(--font-headline)", fontSize: 36, fontWeight: 900, letterSpacing: "-0.04em", margin: "4px 0 0", lineHeight: 1 }}>
                {loading ? "\u2014" : hours}<span style={{ fontSize: 16, fontWeight: 600, marginLeft: 4 }}>h</span>
              </p>
              <div style={{ width: "100%", height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 999, marginTop: 12, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, (hours / 20) * 100)}%`, height: "100%", background: "#c57eff", borderRadius: 999 }} />
              </div>
            </div>
          </div>

          {/* Recovery chart */}
          <div style={{ gridColumn: "1 / -1", background: "#131313", borderRadius: 16, padding: "24px 20px", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ fontFamily: "var(--font-headline)", fontSize: 18, fontWeight: 700, margin: 0 }}>Indice de R\u00e9cup\u00e9ration</h3>
              <div style={{ display: "flex", gap: 16 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#c57eff", textTransform: "uppercase", borderBottom: "2px solid #c57eff", paddingBottom: 2 }}>7 Jours</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#adaaaa", textTransform: "uppercase" }}>30 Jours</span>
              </div>
            </div>
            <div style={{ position: "relative", height: 120 }}>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
                <defs>
                  <linearGradient id="line-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style={{ stopColor: "rgba(197,126,255,0.4)", stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: "rgba(197,126,255,0)", stopOpacity: 0 }} />
                  </linearGradient>
                </defs>
                <path d="M 0,80 Q 20,70 40,85 T 80,40 T 100,20 L 100,100 L 0,100 Z" fill="url(#line-grad)" />
                <path d="M 0,80 Q 20,70 40,85 T 80,40 T 100,20" fill="none" stroke="#c57eff" strokeWidth="2" />
                <circle cx="80" cy="40" r="2.5" fill="#c57eff" />
                <circle cx="100" cy="20" r="2.5" fill="#c57eff" />
              </svg>
              <div style={{ position: "absolute", top: "12%", right: "8%", background: "#c57eff", color: "#0e0e0e", padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>88%</div>
            </div>
          </div>
        </div>

        {/* Insights */}
        <section>
          <h5 style={{ fontFamily: "var(--font-headline)", fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Insights</h5>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { icon: "\ud83d\udca1", bg: "rgba(197,126,255,0.1)", color: "#c57eff", title: "Optimisation du Sommeil", body: "Votre phase de sommeil profond \u00e9tait 15% plus courte que d'habitude. Envisagez une s\u00e9ance de mobilit\u00e9 douce ce soir." },
              { icon: "\u26a1", bg: "rgba(202,253,0,0.08)", color: "#cafd00", title: "Pic de Puissance", body: "Votre endurance musculaire progresse de mani\u00e8re lin\u00e9aire. Continuez sur cette lanc\u00e9e." },
            ].map((ins) => (
              <div key={ins.title} style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(12px)", borderRadius: 14, padding: "16px", border: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ padding: "8px", background: ins.bg, borderRadius: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 18, color: ins.color }}>{ins.icon}</span>
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 14, margin: "0 0 4px" }}>{ins.title}</p>
                  <p style={{ color: "#adaaaa", fontSize: 12, margin: 0, lineHeight: 1.5 }}>{ins.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </AppShell>
  );
}
