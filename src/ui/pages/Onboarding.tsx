import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { saveProfile } from "../../application/usecases/saveProfile";

export default function OnboardingPage() {
  const { user, signOut, isConfigured } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const email = user?.email ?? null;

  const canSubmit = useMemo(() => {
    return Boolean(user?.id) && displayName.trim().length > 0 && !busy;
  }, [busy, displayName, user?.id]);

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
      const msg = err instanceof Error ? err.message : "Unknown error";
      setMessage(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container">
      <h1>TrackNPerf</h1>
      <h2>Welcome</h2>
      <p style={{ marginTop: 12, maxWidth: 640 }}>
        Let’s set up your profile. You can change this later.
      </p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <input type="email" value={email ?? ""} readOnly />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Display name</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.currentTarget.value)}
            placeholder="e.g. Alex"
            autoComplete="name"
            required
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Avatar URL (optional)</span>
          <input
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.currentTarget.value)}
            placeholder="https://…"
            autoComplete="url"
          />
        </label>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="submit" disabled={!canSubmit}>
            {busy ? "Saving…" : "Continue"}
          </button>
          <button type="button" onClick={() => void signOut()} disabled={!isConfigured || busy}>
            Sign out
          </button>
        </div>

        {message ? (
          <p role="status" style={{ margin: 0 }}>
            {message}
          </p>
        ) : null}
      </form>
    </main>
  );
}

