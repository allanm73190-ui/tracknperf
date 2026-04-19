import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { authSignIn, authSignInWithOtp, authSignUp, isSupabaseConfigured } from "../../auth/authActions";

type Mode = "signIn" | "signUp" | "magicLink";

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("magicLink");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const isConfigured = isSupabaseConfigured();

  const redirectTo = useMemo(() => {
    return new URL("/auth/callback", window.location.origin).toString();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      const state = location.state as { returnTo?: unknown } | null;
      const returnTo =
        typeof state?.returnTo === "string" && state.returnTo.startsWith("/") ? state.returnTo : "/today";
      try {
        window.sessionStorage.setItem("tnp:returnTo", returnTo);
      } catch {
        // Ignore if storage is blocked.
      }

      if (mode === "signUp") {
        await authSignUp(email, password, redirectTo);
        setMessage({ text: "Vérifie ton email pour confirmer ton compte.", isError: false });
        return;
      }

      if (mode === "signIn") {
        await authSignIn(email, password);
        navigate(returnTo, { replace: true });
        return;
      }

      await authSignInWithOtp(email, redirectTo);
      setMessage({ text: "Lien magique envoyé. Vérifie ta boîte mail.", isError: false });
    } catch (err) {
      const text = err instanceof Error ? err.message : "Erreur inconnue";
      setMessage({ text, isError: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 24px",
        position: "relative",
        overflow: "hidden",
        background: "#0e0e0e",
      }}
    >
      {/* Ambient blobs */}
      <div
        aria-hidden
        style={{
          position: "absolute", top: "-10%", right: "-10%",
          width: 500, height: 500,
          background: "rgba(106, 11, 170, 0.20)",
          borderRadius: "50%",
          filter: "blur(120px)",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute", bottom: "-5%", left: "-5%",
          width: 400, height: 400,
          background: "rgba(202, 253, 0, 0.10)",
          borderRadius: "50%",
          filter: "blur(100px)",
          pointerEvents: "none",
        }}
      />

      {/* Editorial watermark */}
      <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        <span
          style={{
            position: "absolute", top: 10, left: 10,
            fontFamily: "var(--font-headline)",
            fontSize: "15rem", fontWeight: 900, lineHeight: 1,
            color: "white", opacity: 0.04,
            userSelect: "none",
          }}
        >
          KP
        </span>
      </div>

      <div style={{ width: "100%", maxWidth: 440, position: "relative", zIndex: 1 }}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h1
            style={{
              fontFamily: "var(--font-headline)",
              fontSize: "3rem",
              fontWeight: 800,
              letterSpacing: "-0.04em",
              fontStyle: "italic",
              textTransform: "uppercase",
              color: "#c57eff",
              margin: 0,
            }}
          >
            TRACK'N'PERF
          </h1>
          <p
            style={{
              fontFamily: "var(--font-label)",
              fontSize: "0.7rem",
              color: "#adaaaa",
              marginTop: 8,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            Performance Hub
          </p>
        </div>

        {/* Auth card */}
        <div
          style={{
            background: "#131313",
            borderRadius: "2rem",
            padding: "2rem",
            border: "1px solid rgba(255,255,255,0.05)",
            boxShadow: "0 0 60px rgba(197, 126, 255, 0.15)",
          }}
        >
          {/* Tab switcher */}
          <div
            style={{
              display: "flex",
              padding: 4,
              background: "#262626",
              borderRadius: 999,
              marginBottom: 32,
            }}
          >
            {(["magicLink", "signIn", "signUp"] as Mode[]).map((m) => {
              const labels: Record<Mode, string> = {
                magicLink: "Lien magique",
                signIn: "Connexion",
                signUp: "Inscription",
              };
              const active = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => { setMode(m); setMessage(null); }}
                  disabled={busy}
                  style={{
                    flex: 1,
                    padding: "10px 8px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    borderRadius: 999,
                    border: 0,
                    cursor: "pointer",
                    transition: "all 150ms ease",
                    fontFamily: "var(--font-body)",
                    background: active ? "linear-gradient(45deg, #6a0baa 0%, #c57eff 100%)" : "transparent",
                    color: active ? "#ffffff" : "#adaaaa",
                  }}
                >
                  {labels[m]}
                </button>
              );
            })}
          </div>

          <form onSubmit={onSubmit} style={{ display: "grid", gap: 20 }}>
            {/* Email */}
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingInline: 4 }}>
                <label
                  htmlFor="auth-email"
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#adaaaa",
                    fontFamily: "var(--font-label)",
                  }}
                >
                  Adresse Email
                </label>
                {mode === "magicLink" && (
                  <span
                    style={{
                      fontSize: "0.6rem",
                      background: "rgba(106, 11, 170, 0.30)",
                      color: "#c57eff",
                      padding: "2px 8px",
                      borderRadius: 999,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Sans mot de passe
                  </span>
                )}
              </div>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nom@performance.com"
                disabled={busy}
                required
                autoComplete="email"
                style={{
                  width: "100%",
                  background: "#262626",
                  border: 0,
                  borderRadius: 12,
                  padding: "14px 16px",
                  color: "#ffffff",
                  fontFamily: "var(--font-body)",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Password (signIn / signUp only) */}
            {mode !== "magicLink" && (
              <div style={{ display: "grid", gap: 8 }}>
                <label
                  htmlFor="auth-password"
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#adaaaa",
                    fontFamily: "var(--font-label)",
                    paddingInline: 4,
                  }}
                >
                  Mot de passe
                </label>
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={busy}
                  autoComplete={mode === "signUp" ? "new-password" : "current-password"}
                  style={{
                    width: "100%",
                    background: "#262626",
                    border: 0,
                    borderRadius: 12,
                    padding: "14px 16px",
                    color: "#ffffff",
                    fontFamily: "var(--font-body)",
                    fontSize: "0.95rem",
                    fontWeight: 500,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            )}

            {/* Feedback message */}
            {message && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: message.isError ? "rgba(185, 41, 2, 0.20)" : "rgba(202, 253, 0, 0.10)",
                  borderLeft: `3px solid ${message.isError ? "#ff7351" : "#cafd00"}`,
                }}
              >
                <p style={{ margin: 0, fontSize: "0.8rem", fontWeight: 700, color: message.isError ? "#ffd2c8" : "#f3ffca", fontFamily: "var(--font-body)" }}>
                  {message.text}
                </p>
              </div>
            )}

            {!isConfigured && (
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: "rgba(185, 41, 2, 0.20)",
                  borderLeft: "3px solid #ff7351",
                  fontSize: "0.78rem",
                  color: "#ffd2c8",
                  fontFamily: "var(--font-body)",
                }}
              >
                Supabase non configuré — définir <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code>.
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={busy || !isConfigured}
              style={{
                width: "100%",
                background: "linear-gradient(45deg, #6a0baa 0%, #c57eff 100%)",
                border: 0,
                borderRadius: 16,
                padding: "18px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                color: "#ffffff",
                fontFamily: "var(--font-body)",
                fontWeight: 900,
                fontSize: "1rem",
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
                cursor: busy || !isConfigured ? "not-allowed" : "pointer",
                opacity: !isConfigured ? 0.45 : 1,
                transition: "transform 120ms ease, opacity 120ms ease",
                boxShadow: "0 8px 40px rgba(106, 11, 170, 0.40)",
              }}
            >
              {busy && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden style={{ animation: "spin 0.8s linear infinite" }}>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity={0.25} />
                  <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" opacity={0.75} />
                </svg>
              )}
              {busy
                ? "Chargement..."
                : mode === "magicLink"
                  ? "Envoyer le lien"
                  : mode === "signUp"
                    ? "Créer le compte"
                    : "Se connecter"}
            </button>
          </form>

          <p
            style={{
              marginTop: 32,
              textAlign: "center",
              fontSize: "0.65rem",
              color: "#adaaaa",
              lineHeight: 1.6,
              padding: "0 16px",
              fontFamily: "var(--font-label)",
            }}
          >
            En continuant, vous acceptez nos{" "}
            <span style={{ color: "#ffffff", textDecoration: "underline", cursor: "pointer" }}>Conditions d'Utilisation</span>{" "}
            et notre{" "}
            <span style={{ color: "#ffffff", textDecoration: "underline", cursor: "pointer" }}>Politique de Confidentialité</span>.
          </p>
        </div>

        {/* Social proof */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
          {[
            { value: "24/7", label: "Monitoring", color: "#f3ffca" },
            { value: "100%", label: "Crypté", color: "#c57eff" },
          ].map(({ value, label, color }) => (
            <div key={label} style={{ background: "rgba(32, 31, 31, 0.40)", padding: 16, borderRadius: 16, textAlign: "center" }}>
              <span style={{ display: "block", fontFamily: "var(--font-headline)", fontSize: "1.5rem", fontWeight: 700, color }}>{value}</span>
              <span style={{ fontSize: "0.6rem", color: "#adaaaa", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.12em", fontFamily: "var(--font-label)" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
