import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { saveProfile } from "../../application/usecases/saveProfile";
import { Button } from "../kit/Button";
import { Card } from "../kit/Card";
import { Input } from "../kit/Input";
import { Pill } from "../kit/Pill";

export default function OnboardingPage() {
  const { user, signOut, isConfigured } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const email = user?.email ?? null;

  const canSubmit = useMemo(() => {
    return Boolean(user?.id) && isConfigured && displayName.trim().length > 0 && !busy;
  }, [busy, displayName, isConfigured, user?.id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!user) {
      setMessage("You must be signed in to continue.");
      return;
    }

    if (!isConfigured) {
      setMessage("Supabase is not configured.");
      return;
    }

    setBusy(true);
    try {
      await saveProfile({
        userId: user.id,
        email,
        displayName: displayName.trim(),
        avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : null,
      });

      window.location.replace("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setMessage(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container" style={{ maxWidth: 920, paddingTop: 64 }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <h1 className="h1" style={{ fontSize: 46 }}>
            TrackNPerf
          </h1>
          <div className="muted" style={{ marginTop: 8 }}>
            Profile setup · takes 30 seconds
          </div>
        </div>

        <Card tone="low">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <h2 className="h2">Welcome</h2>
            <Pill tone="primary">Start</Pill>
          </div>

          <div className="muted" style={{ maxWidth: 520 }}>
            Tell us who you are. This unlocks your dashboard and recommendations.
          </div>

          <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                }}
              >
                Email
              </span>
              <input
                type="email"
                value={email ?? ""}
                readOnly
                style={{
                  border: 0,
                  borderRadius: "var(--radius-md)",
                  background: "rgba(38, 38, 38, 0.7)",
                  color: "var(--text)",
                  padding: "12px 12px",
                  fontFamily: "var(--font-body)",
                  opacity: 0.9,
                }}
              />
            </label>

            <Input
              label="Display name"
              value={displayName}
              onChange={setDisplayName}
              placeholder="e.g. Alex"
              disabled={busy}
            />

            <Input
              label="Avatar URL (optional)"
              value={avatarUrl}
              onChange={setAvatarUrl}
              placeholder="https://…"
              disabled={busy}
              type="url"
            />

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Button variant="primary" type="submit" disabled={!canSubmit}>
                {busy ? "Saving…" : "Continue"}
              </Button>
              <Button variant="ghost" onClick={() => void signOut()} disabled={!isConfigured || busy}>
                Sign out
              </Button>
              {!isConfigured ? <Pill tone="error">Supabase not configured</Pill> : null}
            </div>

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

