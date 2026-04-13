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

  useEffect(() => {
    let ignore = false;

    async function run() {
      if (!userId || !supabase) {
        if (!ignore) {
          setHasProfile(false);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (ignore) return;

      if (error) {
        // If we can't load profile for any reason, don't dead-end the user.
        setHasProfile(true);
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

  return { loading, hasProfile };
}

export default function App() {
  const { loading, user } = useAuth();
  const { loading: profileLoading, hasProfile } = useHasProfile(user?.id ?? null);

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

  if (!hasProfile) {
    if (window.location.pathname !== "/onboarding") {
      window.history.replaceState(null, "", "/onboarding");
    }
    return <OnboardingPage />;
  }

  if (window.location.pathname === "/onboarding") {
    window.history.replaceState(null, "", "/");
  }
  return <ProtectedPage />;
}

