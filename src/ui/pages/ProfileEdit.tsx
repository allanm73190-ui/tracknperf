import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../../auth/AuthProvider";
import { saveProfile } from "../../application/usecases/saveProfile";
import { supabase } from "../../infra/supabase/client";
import { AppShell } from "../kit/AppShell";

const schema = z.object({
  displayName: z.string().trim().min(1, "Le nom ne peut pas être vide.").max(80, "80 caractères max."),
});

function ComingSoonRow({ label, sublabel }: { label: string; sublabel: string }) {
  return (
    <div style={{ padding: "14px 18px", opacity: 0.4 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: "#f5f5f5", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: "#666" }}>{sublabel}</div>
    </div>
  );
}

export default function ProfileEditPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !user) { setLoadingProfile(false); return; }
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.display_name) setDisplayName(String(data.display_name));
      })
      .then(() => setLoadingProfile(false), () => setLoadingProfile(false));
  }, [user]);

  function validate(): boolean {
    const result = schema.safeParse({ displayName });
    if (!result.success) {
      setFieldError(result.error.issues[0]?.message ?? "Champ invalide.");
      return false;
    }
    setFieldError(null);
    return true;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!validate()) return;
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      await saveProfile({
        userId: user.id,
        email: user.email ?? null,
        displayName: displayName.trim(),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div style={{ padding: "28px 20px 0" }}>
        {/* Back + editorial header */}
        <button
          onClick={() => navigate(-1)}
          style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer", padding: "0 0 20px", display: "flex", alignItems: "center", gap: 6 }}
        >
          <span style={{ fontSize: 16 }}>←</span> Paramètres
        </button>

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: "#c57eff", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 6 }}>
            Configuration
          </div>
          <h1 style={{
            fontFamily: "Space Grotesk, sans-serif",
            fontSize: "clamp(2rem, 7vw, 3rem)",
            fontWeight: 900, margin: 0,
            letterSpacing: "-0.04em",
            textTransform: "uppercase",
            lineHeight: 1,
            color: "#f5f5f5",
          }}>
            Profil athlète.
          </h1>
        </div>

        <form onSubmit={onSubmit} style={{ paddingBottom: 80 }}>
          {/* Identité */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: "#888", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              Identité
            </div>
            <div style={{ background: "#131313", borderRadius: 16, padding: "18px" }}>
              {loadingProfile ? (
                <div style={{ height: 20, borderRadius: 6, background: "#1e1e1e" }} />
              ) : (
                <div>
                  <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 8, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    Nom d'affichage
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => { setDisplayName(e.target.value); setFieldError(null); }}
                    onBlur={validate}
                    placeholder="Ton prénom ou pseudo"
                    maxLength={80}
                    style={{
                      width: "100%", boxSizing: "border-box",
                      background: "#0e0e0e",
                      border: fieldError ? "1px solid #ff7351" : "none",
                      borderRadius: 10, padding: "14px 16px", fontSize: 15, color: "#f5f5f5",
                      outline: "none", fontFamily: "Manrope, sans-serif",
                    }}
                  />
                  {fieldError && (
                    <div style={{ fontSize: 12, color: "#ff7351", marginTop: 6 }}>{fieldError}</div>
                  )}
                  <div style={{ fontSize: 11, color: "#333", marginTop: 6, textAlign: "right" }}>
                    {displayName.length}/80
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Objectifs */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: "#888", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              Objectifs prioritaires
            </div>
            <div style={{ background: "#131313", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", gap: 1 }}>
              <ComingSoonRow label="Force maximale" sublabel="Disponible prochainement" />
              <ComingSoonRow label="Endurance" sublabel="Disponible prochainement" />
              <ComingSoonRow label="Hypertrophie" sublabel="Disponible prochainement" />
            </div>
          </div>

          {/* Contraintes */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: "#888", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              Contraintes
            </div>
            <div style={{ background: "#131313", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", gap: 1 }}>
              <ComingSoonRow label="Temps disponible / semaine" sublabel="Disponible prochainement" />
              <ComingSoonRow label="Équipements" sublabel="Disponible prochainement" />
              <ComingSoonRow label="Alertes blessures" sublabel="Disponible prochainement" />
            </div>
          </div>

          {/* Unités */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: "#888", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              Unités
            </div>
            <div style={{ background: "#131313", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", gap: 1 }}>
              <ComingSoonRow label="Distances" sublabel="km / mi — Disponible prochainement" />
              <ComingSoonRow label="Poids" sublabel="kg / lb — Disponible prochainement" />
            </div>
          </div>

          {error && (
            <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(255,115,81,0.10)", color: "#ff7351", fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(202,253,0,0.08)", color: "#cafd00", fontSize: 13, marginBottom: 16, fontWeight: 600 }}>
              Profil sauvegardé
            </div>
          )}

          <button
            type="submit"
            disabled={busy || loadingProfile}
            style={{
              width: "100%", padding: "16px", borderRadius: 14, border: "none",
              cursor: busy || loadingProfile ? "not-allowed" : "pointer",
              background: busy || loadingProfile ? "#1e1e1e" : "linear-gradient(45deg, #beee00 0%, #f3ffca 100%)",
              color: "#0e0e0e", fontWeight: 800, fontSize: 15,
              opacity: busy || loadingProfile ? 0.5 : 1,
              fontFamily: "Space Grotesk, sans-serif",
              letterSpacing: "-0.01em",
              transition: "opacity 120ms ease",
            }}
          >
            {busy ? "Sauvegarde…" : "Sauvegarder"}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
