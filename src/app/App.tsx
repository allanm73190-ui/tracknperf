import AuthPage from "../ui/pages/Auth";
import AuthCallbackPage from "../ui/pages/AuthCallback";
import { useAuth } from "../auth/AuthProvider";

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

export default function App() {
  const { loading, user } = useAuth();

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
  return <ProtectedPage />;
}

