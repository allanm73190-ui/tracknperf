import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../infra/supabase/client";

type Mode = "signIn" | "signUp" | "magicLink";

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isConfigured = Boolean(supabase);

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

    if (!supabase) {
      setMessage(
        "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
      );
      return;
    }

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
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        setMessage("Check your email to confirm your account (if required).");
        return;
      }

      if (mode === "signIn") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate(returnTo, { replace: true });
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setMessage("Magic link sent. Check your inbox.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setMessage(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container">
      <h1>TrackNPerf</h1>
      <h2>{heading}</h2>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        <button
          type="button"
          onClick={() => setMode("signIn")}
          aria-pressed={mode === "signIn"}
        >
          Email + password
        </button>
        <button
          type="button"
          onClick={() => setMode("signUp")}
          aria-pressed={mode === "signUp"}
        >
          Sign up
        </button>
        <button
          type="button"
          onClick={() => setMode("magicLink")}
          aria-pressed={mode === "magicLink"}
        >
          Magic link
        </button>
      </div>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10, maxWidth: 420 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
        </label>

        {mode !== "magicLink" ? (
          <label style={{ display: "grid", gap: 6 }}>
            <span>Password</span>
            <input
              type="password"
              autoComplete={mode === "signUp" ? "new-password" : "current-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
          </label>
        ) : null}

        <button type="submit" disabled={busy || !isConfigured}>
          {busy ? "Working…" : "Continue"}
        </button>

        {!isConfigured ? (
          <p role="alert" style={{ margin: 0 }}>
            Supabase is not configured. Set <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code>.
          </p>
        ) : null}

        {message ? (
          <p role="status" style={{ margin: 0 }}>
            {message}
          </p>
        ) : null}
      </form>
    </main>
  );
}

