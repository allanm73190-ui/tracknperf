import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { authSignIn, authSignInWithOtp, authSignUp, isSupabaseConfigured } from "../../auth/authActions";
import { Button } from "../kit/Button";
import { Card } from "../kit/Card";
import { Input } from "../kit/Input";
import { Pill } from "../kit/Pill";

type Mode = "signIn" | "signUp" | "magicLink";

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isConfigured = isSupabaseConfigured();

  const heading = useMemo(() => {
    switch (mode) {
      case "signIn":
        return "Sign in";
      case "signUp":
        return "Create account";
      case "magicLink":
        return "Magic link";
    }
  }, [mode]);

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
        setMessage("Check your email to confirm your account (if required).");
        return;
      }

      if (mode === "signIn") {
        await authSignIn(email, password);
        navigate(returnTo, { replace: true });
        return;
      }

      await authSignInWithOtp(email, redirectTo);
      setMessage("Magic link sent. Check your inbox.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setMessage(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container" style={{ maxWidth: 920, paddingTop: 64 }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <h1 className="h1" style={{ fontSize: 46 }}>
            TrackNPerf
          </h1>
          <div className="muted" style={{ marginTop: 8 }}>
            Performance Hub · Hybrid training OS
          </div>
        </div>

        <Card tone="low">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <h2 className="h2">{heading}</h2>
            <Pill tone="secondary">Secure</Pill>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant={mode === "signIn" ? "primary" : "ghost"} onClick={() => setMode("signIn")} disabled={busy}>
              Sign in
            </Button>
            <Button variant={mode === "signUp" ? "primary" : "ghost"} onClick={() => setMode("signUp")} disabled={busy}>
              Sign up
            </Button>
            <Button
              variant={mode === "magicLink" ? "primary" : "ghost"}
              onClick={() => setMode("magicLink")}
              disabled={busy}
            >
              Magic link
            </Button>
          </div>

          <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
            <Input label="Email" value={email} onChange={setEmail} type="email" placeholder="you@domain.com" disabled={busy} />

            {mode !== "magicLink" ? (
              <Input
                label="Password"
                value={password}
                onChange={setPassword}
                type="password"
                placeholder="••••••••"
                disabled={busy}
              />
            ) : null}

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Button variant="primary" type="submit" disabled={busy || !isConfigured}>
                {busy ? "Working…" : mode === "magicLink" ? "Send link" : "Continue"}
              </Button>
              {!isConfigured ? <Pill tone="error">Supabase not configured</Pill> : null}
            </div>

            {!isConfigured ? (
              <div className="muted" style={{ fontSize: 13 }}>
                Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.
              </div>
            ) : null}

            {message ? (
              <Card tone="highest">
                <div style={{ whiteSpace: "pre-wrap" }}>{message}</div>
              </Card>
            ) : null}
          </form>
        </Card>
      </div>
    </main>
  );
}
