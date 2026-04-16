import { useNavigate } from "react-router-dom";
import { AppShell } from "../kit/AppShell";

const REASONS = [
  {
    n: "01",
    title: "Saturation du Glycogène Musculaire",
    body: "Vos données de nutrition et d'activité indiquent une fenêtre métabolique optimale pour l'oxydation des graisses sans épuisement des réserves critiques.",
  },
  {
    n: "02",
    title: "Réponse VRC Positive",
    body: "La stabilisation de votre variabilité de fréquence cardiaque permet une charge de travail modérée sans risque de surentraînement systémique.",
  },
  {
    n: "03",
    title: "Optimisation Neuromusculaire",
    body: "Une intensité contrôlée favorisera la résorption de l'acide lactique résiduel de votre séance de force de mardi.",
  },
];

export default function RecommendationDetailPage() {
  const navigate = useNavigate();

  return (
    <AppShell
      title="Analyse IA"
      nav={[
        { to: "/today", label: "Today" },
        { to: "/history", label: "History" },
        { to: "/stats", label: "Stats" },
      ]}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 48, paddingBottom: 40 }}>

        {/* Hero */}
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ color: "#cafd00", fontSize: 14 }}>⚡</span>
            <span style={{ fontFamily: "var(--font-headline)", fontWeight: 700, fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "#cafd00" }}>
              Session Recommandée
            </span>
          </div>
          <h2 style={{
            fontFamily: "var(--font-headline)", fontSize: "clamp(40px, 12vw, 64px)",
            fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 0.9, margin: "0 0 16px",
          }}>
            ENDURANCE FONDAMENTALE
          </h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span style={{ background: "#cafd00", color: "#0e0e0e", borderRadius: 999, padding: "4px 14px", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-headline)" }}>
              65 MIN
            </span>
            <span style={{ background: "#1a1a1a", color: "#f3ffca", borderRadius: 999, padding: "4px 14px", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-headline)" }}>
              Z2 — RÉCUPÉRATION ACTIVE
            </span>
          </div>
        </section>

        {/* Why */}
        <section>
          <h3 style={{ fontFamily: "var(--font-headline)", fontSize: 11, fontWeight: 700, letterSpacing: "0.25em", textTransform: "uppercase", color: "#c57eff", marginBottom: 32 }}>
            POURQUOI CETTE SESSION ?
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
            {REASONS.map((r) => (
              <div key={r.n} style={{ position: "relative", paddingLeft: 32 }}>
                <div style={{
                  position: "absolute", left: 0, top: 0, fontFamily: "var(--font-headline)",
                  fontSize: 40, fontWeight: 900, color: "#cafd00", opacity: 0.2, lineHeight: 1,
                }}>
                  {r.n}
                </div>
                <p style={{ fontFamily: "var(--font-headline)", fontSize: 22, fontWeight: 700, lineHeight: 1.2, margin: "0 0 10px" }}>
                  {r.title}
                </p>
                <p style={{ color: "#adaaaa", fontSize: 13, lineHeight: 1.6, margin: 0, maxWidth: 400 }}>
                  {r.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Scientific bento */}
        <section>
          <h3 style={{ fontFamily: "var(--font-headline)", fontSize: 11, fontWeight: 700, letterSpacing: "0.25em", textTransform: "uppercase", color: "#c57eff", marginBottom: 20 }}>
            DÉTAILS SCIENTIFIQUES
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

            {/* VRC full-width */}
            <div style={{ gridColumn: "1 / -1", background: "#131313", borderRadius: 16, padding: 24, borderLeft: "4px solid #cafd00" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <span style={{ fontSize: 20, color: "#cafd00" }}>📈</span>
                <span style={{ fontFamily: "var(--font-headline)", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#adaaaa" }}>Variabilité (VRC)</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontFamily: "var(--font-headline)", fontSize: 56, fontWeight: 900, color: "#f3ffca", letterSpacing: "-0.04em", lineHeight: 1 }}>78</span>
                <span style={{ fontFamily: "var(--font-headline)", fontSize: 16, fontWeight: 700, color: "#adaaaa", textTransform: "uppercase" }}>ms</span>
              </div>
              <p style={{ color: "#adaaaa", fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
                Augmentation de +12% par rapport à votre moyenne sur 7 jours. Capacité de résilience élevée.
              </p>
            </div>

            {/* Fatigue */}
            <div style={{ background: "#1a1a1a", borderRadius: 16, padding: 20 }}>
              <span style={{ fontSize: 22, color: "#c57eff", display: "block", marginBottom: 12 }}>🔋</span>
              <p style={{ fontFamily: "var(--font-headline)", fontSize: 26, fontWeight: 900, letterSpacing: "-0.03em", margin: "0 0 4px" }}>BASSE</p>
              <p style={{ fontFamily: "var(--font-headline)", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#adaaaa", margin: 0 }}>Niveau de Fatigue</p>
              <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 999, marginTop: 14, overflow: "hidden" }}>
                <div style={{ width: "25%", height: "100%", background: "#c57eff", borderRadius: 999 }} />
              </div>
            </div>

            {/* Sleep */}
            <div style={{ background: "#1a1a1a", borderRadius: 16, padding: 20 }}>
              <span style={{ fontSize: 22, color: "#fce047", display: "block", marginBottom: 12 }}>🌙</span>
              <p style={{ fontFamily: "var(--font-headline)", fontSize: 26, fontWeight: 900, letterSpacing: "-0.03em", margin: "0 0 4px" }}>8h12</p>
              <p style={{ fontFamily: "var(--font-headline)", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#adaaaa", margin: 0 }}>Sommeil Profond</p>
              <p style={{ color: "#adaaaa", fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>Qualité réparatrice validée par 3 cycles REM complets.</p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <button
          onClick={() => navigate("/today")}
          style={{
            width: "100%", background: "#cafd00", color: "#0e0e0e", border: "none",
            borderRadius: 16, padding: "20px 24px", fontFamily: "var(--font-headline)",
            fontWeight: 900, fontSize: 18, letterSpacing: "-0.02em", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          }}
        >
          LANCER LA SESSION ▶
        </button>
      </div>
    </AppShell>
  );
}
