import { useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { saveProfile } from "../../application/usecases/saveProfile";
import { Button } from "../kit/Button";
import { Input } from "../kit/Input";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? "/today";
  const { user, signOut, isConfigured } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const email = user?.email ?? null;

  const canSubmit = useMemo(() => {
    return Boolean(user?.id) && isConfigured && displayName.trim().length > 0 && !busy;
  }, [busy, displayName, isConfigured, user?.id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!user) { setMessage("Vous devez être connecté."); return; }
    if (!isConfigured) { setMessage("Supabase non configuré."); return; }
    setBusy(true);
    try {
      await saveProfile({
        userId: user.id,
        email,
        displayName: displayName.trim(),
        avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : null,
      });
      setDone(true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main style={{
        minHeight: "100dvh",
        background: "#0e0e0e",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: "-20%", right: "-10%", width: 400, height: 400, borderRadius: "50%", background: "rgba(202,253,0,0.12)", filter: "blur(120px)", pointerEvents: "none" }} />
        <div style={{ textAlign: "center", maxWidth: 480 }}>
          <div style={{
            width: 96, height: 96,
            borderRadius: "50%",
            background: "#cafd00",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 32px",
            boxShadow: "0 0 50px rgba(202,253,0,0.4)",
          }}>
            <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#0e0e0e", display: "inline-block" }} />
          </div>
          <h2 style={{
            fontFamily: "var(--font-headline)",
            fontSize: "clamp(40px, 12vw, 64px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            textTransform: "uppercase",
            marginBottom: 16,
          }}>
            PRÊT À BOUGER
          </h2>
          <p style={{ color: "#adaaaa", fontSize: 16, lineHeight: 1.6, marginBottom: 40 }}>
            Votre profil est configuré. La performance n'attend pas.
          </p>
          <button
            onClick={() => navigate(returnTo, { replace: true })}
            style={{
              background: "#ffffff",
              color: "#0e0e0e",
              border: "none",
              borderRadius: 999,
              padding: "16px 40px",
              fontFamily: "var(--font-body)",
              fontWeight: 900,
              fontSize: 13,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            ACCÉDER AU DASHBOARD
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{
      minHeight: "100dvh",
      background: "#0e0e0e",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Ambient blobs */}
      <div style={{ position: "absolute", top: "-15%", right: "-10%", width: 500, height: 500, borderRadius: "50%", background: "rgba(106,11,170,0.20)", filter: "blur(120px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-20%", left: "-15%", width: 500, height: 500, borderRadius: "50%", background: "rgba(202,253,0,0.10)", filter: "blur(100px)", pointerEvents: "none" }} />

      {/* Watermark */}
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        fontFamily: "var(--font-headline)",
        fontSize: "clamp(120px, 30vw, 200px)",
        fontWeight: 900,
        color: "rgba(255,255,255,0.04)",
        letterSpacing: "-0.06em",
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 0,
      }}>
        KP
      </div>

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 440 }}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{
            fontFamily: "var(--font-headline)",
            fontStyle: "italic",
            fontWeight: 800,
            fontSize: "clamp(22px, 6vw, 28px)",
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            color: "#c57eff",
            margin: 0,
          }}>
            TRACK'N'PERF
          </h1>
          <p style={{ color: "#adaaaa", fontSize: 13, marginTop: 8 }}>
            Configuration du profil · 30 secondes
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: "rgba(19,19,19,0.80)",
          backdropFilter: "blur(24px)",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.06)",
          padding: "32px 28px",
        }}>
          <h2 style={{
            fontFamily: "var(--font-headline)",
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            margin: "0 0 6px",
          }}>
            Bienvenue
          </h2>
          <p style={{ color: "#adaaaa", fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
            Dites-nous qui vous êtes. Cela active votre dashboard et vos recommandations.
          </p>

          <form onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>
            {/* Email (read-only) */}
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#adaaaa", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>
                Email
              </span>
              <input
                type="email"
                value={email ?? ""}
                readOnly
                style={{
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  background: "rgba(38,38,38,0.5)",
                  color: "rgba(255,255,255,0.5)",
                  padding: "12px 14px",
                  fontFamily: "var(--font-body)",
                  fontSize: 14,
                }}
              />
            </label>

            <Input
              label="Nom d'affichage"
              value={displayName}
              onChange={setDisplayName}
              placeholder="ex. Alex"
              disabled={busy}
            />

            <Input
              label="URL Avatar (optionnel)"
              value={avatarUrl}
              onChange={setAvatarUrl}
              placeholder="https://…"
              disabled={busy}
              type="url"
            />

            {message && (
              <div style={{
                background: "rgba(255,115,81,0.08)",
                border: "1px solid rgba(255,115,81,0.25)",
                borderRadius: 10,
                padding: "10px 14px",
                color: "#ff7351",
                fontSize: 13,
              }}>
                {message}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
              <button
                type="submit"
                disabled={!canSubmit}
                style={{
                  flex: 1,
                  padding: "14px",
                  borderRadius: 12,
                  border: "none",
                  background: canSubmit ? "linear-gradient(45deg, #6a0baa 0%, #c57eff 100%)" : "rgba(255,255,255,0.08)",
                  color: canSubmit ? "#ffffff" : "#adaaaa",
                  fontFamily: "var(--font-body)",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: canSubmit ? "pointer" : "not-allowed",
                  transition: "opacity 0.15s",
                }}
              >
                {busy ? "Enregistrement…" : "Continuer"}
              </button>
              <Button variant="ghost" onClick={() => void signOut()} disabled={!isConfigured || busy}>
                Déconnexion
              </Button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
