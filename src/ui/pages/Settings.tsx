import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { useIsAdmin } from "../../auth/useIsAdmin";
import { useEffect, useState } from "react";
import { supabase } from "../../infra/supabase/client";
import { AppShell } from "../kit/AppShell";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 10, fontWeight: 900, color: "#888", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ background: "#131313", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", gap: 1 }}>
        {children}
      </div>
    </div>
  );
}

function SettingsRow({
  label,
  sublabel,
  onClick,
  danger,
  chevron = true,
}: {
  label: string;
  sublabel?: string;
  onClick?: () => void;
  danger?: boolean;
  chevron?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", background: onClick ? "transparent" : "transparent",
        border: "none", cursor: onClick ? "pointer" : "default",
        padding: "16px 18px", display: "flex", justifyContent: "space-between", alignItems: "center",
        color: danger ? "#ff7351" : "#f5f5f5", textAlign: "left",
        transition: "background 120ms ease",
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
        {sublabel && <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{sublabel}</div>}
      </div>
      {chevron && onClick && (
        <span style={{ color: "#444", fontSize: 18, lineHeight: 1 }}>›</span>
      )}
    </button>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isAdmin } = useIsAdmin(user?.id ?? null);
  const [signingOut, setSigningOut] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !user) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => { if (data?.display_name) setDisplayName(String(data.display_name)); });
  }, [user]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      navigate("/auth", { replace: true });
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <AppShell>
      <div style={{ padding: "28px 20px 0" }}>
        {/* Editorial header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: "#c57eff", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 6 }}>
            Préférences
          </div>
          <h1 style={{
            fontFamily: "Space Grotesk, sans-serif",
            fontSize: "clamp(2.2rem, 8vw, 3.5rem)",
            fontWeight: 900, margin: 0,
            letterSpacing: "-0.04em",
            textTransform: "uppercase",
            lineHeight: 1,
            color: "#f5f5f5",
          }}>
            Réglages.
          </h1>
        </div>

        {/* Profile card */}
        <button
          onClick={() => navigate("/settings/profile")}
          style={{
            width: "100%", background: "#131313", border: "none", cursor: "pointer",
            borderRadius: 20, padding: "20px 18px", display: "flex", alignItems: "center",
            gap: 16, marginBottom: 28, textAlign: "left",
            transition: "background 120ms ease",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#1a1a1a"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#131313"; }}
        >
          <div style={{
            width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
            background: "linear-gradient(135deg, #6a0baa 0%, #c57eff 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, fontWeight: 900, color: "#fff",
            fontFamily: "Space Grotesk, sans-serif",
          }}>
            {(displayName ?? user?.email ?? "?")[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#f5f5f5", marginBottom: 2 }}>
              {displayName ?? "Profil athlète"}
            </div>
            <div style={{ fontSize: 12, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.email}
            </div>
          </div>
          <span style={{ color: "#333", fontSize: 20 }}>›</span>
        </button>

        {/* Profil athlète */}
        <Section title="Profil athlète">
          <SettingsRow
            label="Objectifs & contraintes"
            sublabel="Sports, disponibilité, équipements"
            onClick={() => navigate("/settings/profile")}
          />
          <SettingsRow
            label="Unités"
            sublabel="km / mi · kg / lb"
            onClick={() => navigate("/settings/units")}
          />
        </Section>

        {/* Affichage */}
        <Section title="Affichage">
          <SettingsRow
            label="Thème"
            sublabel="Hyperflux Dark"
            chevron={false}
          />
          <SettingsRow
            label="Langue"
            sublabel="Français"
            chevron={false}
          />
        </Section>

        {/* Données */}
        <Section title="Données">
          <SettingsRow
            label="Importer un plan"
            sublabel="CSV, Excel, JSON"
            onClick={() => navigate("/import-plan")}
          />
          <SettingsRow
            label="Exporter mes données"
            sublabel="Historique, logs"
            onClick={() => navigate("/history")}
          />
        </Section>

        {/* Admin (visible si admin) */}
        {isAdmin && (
          <Section title="Administration">
            <SettingsRow
              label="Hub admin"
              sublabel="Moteur, configuration"
              onClick={() => navigate("/admin")}
            />
          </Section>
        )}

        {/* Compte */}
        <Section title="Compte">
          {user && (
            <div style={{ padding: "14px 18px", background: "#0e0e0e" }}>
              <div style={{ fontSize: 11, color: "#444", marginBottom: 2 }}>Connecté en tant que</div>
              <div style={{ fontSize: 13, color: "#777" }}>{user.email}</div>
            </div>
          )}
          <button
            disabled={signingOut}
            onClick={handleSignOut}
            style={{
              width: "100%", background: "none", border: "none",
              cursor: signingOut ? "not-allowed" : "pointer",
              padding: "16px 18px", display: "flex", alignItems: "center", gap: 8,
              color: "#ff7351", fontSize: 14, fontWeight: 600,
              opacity: signingOut ? 0.5 : 1,
              textAlign: "left",
            }}
          >
            {signingOut ? "Déconnexion…" : "Se déconnecter"}
          </button>
        </Section>

        <div style={{ textAlign: "center", fontSize: 11, color: "#2a2a2a", paddingTop: 8, paddingBottom: 32 }}>
          Track'n'Perf · v1
        </div>
      </div>
    </AppShell>
  );
}
