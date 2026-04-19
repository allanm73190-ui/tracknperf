import { useNavigate } from "react-router-dom";
import { AppShell } from "../kit/AppShell";

export default function SettingsUnitsPage() {
  const navigate = useNavigate();

  return (
    <AppShell>
      <div style={{ padding: "28px 20px 0" }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: "none", border: "none", color: "#c57eff", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 24, padding: 0 }}
        >
          ← Retour
        </button>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: "#c57eff", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 6 }}>
            Préférences
          </div>
          <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "clamp(2rem, 8vw, 3rem)", fontWeight: 900, margin: 0, letterSpacing: "-0.04em", textTransform: "uppercase", lineHeight: 1, color: "#f5f5f5" }}>
            Unités.
          </h1>
        </div>

        <div style={{ background: "#131313", borderRadius: 16, padding: "20px 18px", color: "#555", fontSize: 13, textAlign: "center" }}>
          Bientôt disponible — choix km/mi · kg/lb
        </div>
      </div>
    </AppShell>
  );
}
