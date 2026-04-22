import { useNavigate } from "react-router-dom";

export default function AccessDeniedPage() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: "100dvh", background: "#0e0e0e", color: "#fff",
      fontFamily: "var(--font-body)", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", position: "relative",
      overflow: "hidden", padding: "24px",
    }}>
      {/* Ambient glows */}
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 500, height: 500, background: "rgba(197,126,255,0.08)", filter: "blur(120px)", borderRadius: "50%", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: 0, right: 0, width: 300, height: 300, background: "rgba(255,115,81,0.04)", filter: "blur(100px)", borderRadius: "50%", pointerEvents: "none" }} />

      {/* Corner decoration */}
      <div style={{ position: "fixed", bottom: 32, left: 32, pointerEvents: "none", opacity: 0.2 }}>
        <div style={{ fontFamily: "var(--font-headline)", fontWeight: 900, fontStyle: "italic", fontSize: 36, letterSpacing: "-0.03em", color: "#adaaaa" }}>004</div>
        <div style={{ width: 48, height: 4, background: "#c57eff", marginTop: 8, borderRadius: 2 }} />
      </div>
      <div style={{ position: "fixed", top: "50%", right: 0, transform: "translateY(-50%) rotate(90deg) translateX(50%)", pointerEvents: "none", opacity: 0.08 }}>
        <span style={{ fontFamily: "var(--font-headline)", fontSize: 11, letterSpacing: "1em", textTransform: "uppercase" }}>Unauthorized Attempt Logged</span>
      </div>

      {/* Content */}
      <section style={{ maxWidth: 480, width: "100%", textAlign: "center", position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>

        {/* Icon */}
        <div style={{ position: "relative", marginBottom: 48 }}>
          <div style={{ position: "absolute", inset: 0, background: "#c57eff", filter: "blur(40px)", opacity: 0.18, borderRadius: "50%" }} />
          <div style={{
            position: "relative", background: "#262626", padding: 40, borderRadius: 40,
            border: "1px solid rgba(72,72,71,0.15)", boxShadow: "0 0 60px rgba(197,126,255,0.08)",
          }}>
            <svg
              width="96"
              height="96"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#c57eff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ display: "block" }}
              aria-hidden
            >
              <rect x="3" y="11" width="18" height="10" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={{
            fontFamily: "var(--font-headline)", fontSize: "clamp(56px, 16vw, 80px)",
            fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 0.9,
            textTransform: "uppercase", fontStyle: "italic", margin: "0 0 16px",
          }}>
            ACCÈS<br />
            <span style={{ color: "#c57eff" }}>REFUSÉ</span>
          </h2>
          <p style={{ color: "#adaaaa", fontSize: 16, lineHeight: 1.6, maxWidth: 320, margin: "0 auto" }}>
            Vous n'avez pas les permissions nécessaires pour accéder au Panneau de Contrôle.
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={() => navigate("/today")}
          style={{
            background: "#cafd00", color: "#0e0e0e", border: "none", borderRadius: 999,
            padding: "18px 40px", fontFamily: "var(--font-headline)", fontWeight: 700,
            fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase",
            cursor: "pointer", boxShadow: "0 0 30px rgba(202,253,0,0.2)",
            transition: "transform 0.15s",
          }}
        >
          RETOUR AU TABLEAU DE BORD
        </button>

        {/* Security badge */}
        <div style={{
          marginTop: 64, display: "flex", alignItems: "center", gap: 10,
          background: "#131313", padding: "10px 24px", borderRadius: 999,
          border: "1px solid rgba(72,72,71,0.15)",
        }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#c57eff", display: "inline-block" }} />
          <span style={{ fontFamily: "var(--font-headline)", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#adaaaa" }}>
            Protocole de Sécurité Actif
          </span>
        </div>
      </section>
    </div>
  );
}
