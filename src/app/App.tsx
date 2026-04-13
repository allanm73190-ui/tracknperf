import AuthPage from "../ui/pages/Auth";
import AuthCallbackPage from "../ui/pages/AuthCallback";
import OnboardingPage from "../ui/pages/Onboarding";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../infra/supabase/client";
import { useEffect, useState } from "react";

function ProtectedPage() {
  const { user, signOut, isConfigured } = useAuth();

  return (
    <main className="container">
      <h1>TrackNPerf</h1>
      <h2>Protected</h2>
      <p style={{ marginTop: 12 }}>
        Signed in as <code>{user?.email ?? user?.id ?? "unknown"}</code>
      </p>
      <button type="button" onClick={() => void signOut()} disabled={!isConfigured}>
        Sign out
      </button>
    </main>
  );
}

function useHasProfile(userId: string | null) {
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function run() {
      if (!userId || !supabase) {
        if (!ignore) {
          setHasProfile(false);
          setError(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (ignore) return;

      if (error) {
        setHasProfile(false);
        setError(typeof error === "object" && error && "message" in error ? String(error.message) : null);
        setLoading(false);
        return;
      }

      setHasProfile(Boolean(data?.id));
      setLoading(false);
    }

    void run();
    return () => {
      ignore = true;
    };
  }, [userId]);

  return { loading, hasProfile, error };
}

export default function App() {
  const { loading, user } = useAuth();
  const { loading: profileLoading, hasProfile, error: profileError } = useHasProfile(
    user?.id ?? null,
  );

  useEffect(() => {
    if (!user) return;

    if (!profileLoading && !profileError && !hasProfile && window.location.pathname !== "/onboarding") {
      window.history.replaceState(null, "", "/onboarding");
      return;
    }

    if (!profileLoading && !profileError && hasProfile && window.location.pathname === "/onboarding") {
      window.history.replaceState(null, "", "/");
    }
  }, [hasProfile, profileError, profileLoading, user]);

  if (window.location.pathname === "/auth/callback") {
    return <AuthCallbackPage />;
  }

  if (loading) {
    return (
      <main className="container">
        <h1>TrackNPerf</h1>
        <p>Loading…</p>
      </main>
    );
  }

  if (!user) return <AuthPage />;

  if (profileLoading) {
    return (
      <main className="container">
        <h1>TrackNPerf</h1>
        <p>Loading…</p>
      </main>
    );
  }

  if (profileError) {
    return (
      <main className="container">
        <h1>TrackNPerf</h1>
        <h2>Profile</h2>
        <p role="alert" style={{ maxWidth: 720 }}>
          We couldn’t load your profile right now. Please check your connection or try again.
        </p>
        <pre style={{ whiteSpace: "pre-wrap", opacity: 0.8 }}>{profileError}</pre>
      </main>
    );
  }

  if (!hasProfile) {
    return <OnboardingPage />;
  }

  return <ProtectedPage />;
}

