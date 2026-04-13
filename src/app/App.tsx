import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useIsAdmin } from "../auth/useIsAdmin";
import { useHasProfile } from "../auth/useHasProfile";
import AdminPage from "../ui/pages/Admin";
import AuthPage from "../ui/pages/Auth";
import AuthCallbackPage from "../ui/pages/AuthCallback";
import HistoryPage from "../ui/pages/History";
import OnboardingPage from "../ui/pages/Onboarding";
import SessionDetailPage from "../ui/pages/SessionDetail";
import StatsPage from "../ui/pages/Stats";
import TodayPage from "../ui/pages/Today";

function AppLoading(props: { title?: string }) {
  return (
    <main className="container">
      <h1>TrackNPerf</h1>
      <p>{props.title ?? "Loading…"} </p>
    </main>
  );
}

function RequireAuth() {
  const { loading, user } = useAuth();
  const location = useLocation();

  if (loading) return <AppLoading />;
  if (!user) return <Navigate to="/auth" replace state={{ returnTo: location.pathname + location.search }} />;
  return <Outlet />;
}

function RequireProfile() {
  const { user } = useAuth();
  const location = useLocation();
  const { loading, hasProfile, error } = useHasProfile(user?.id ?? null);

  if (!user) return <Navigate to="/auth" replace state={{ returnTo: location.pathname + location.search }} />;
  if (loading) return <AppLoading />;
  if (error) {
    return (
      <main className="container">
        <h1>TrackNPerf</h1>
        <h2>Profile</h2>
        <p role="alert" style={{ maxWidth: 720 }}>
          We couldn’t load your profile right now. Please check your connection or try again.
        </p>
        <pre style={{ whiteSpace: "pre-wrap", opacity: 0.8 }}>{error}</pre>
      </main>
    );
  }
  if (!hasProfile) return <Navigate to="/onboarding" replace state={{ returnTo: location.pathname + location.search }} />;
  return <Outlet />;
}

function RequireAdmin() {
  const { user } = useAuth();
  const { loading, isAdmin, error } = useIsAdmin(user?.id ?? null);

  if (!user) return <Navigate to="/auth" replace />;
  if (loading) return <AppLoading />;
  if (!isAdmin) {
    return (
      <main className="container">
        <h1>TrackNPerf</h1>
        <h2>Admin</h2>
        <p role="alert" style={{ maxWidth: 720 }}>
          You don’t have access to this page.
        </p>
        {error ? <pre style={{ whiteSpace: "pre-wrap", opacity: 0.8 }}>{error}</pre> : null}
      </main>
    );
  }
  return <Outlet />;
}

function IndexRedirect() {
  // We want `/` to go to the primary screen, but only after auth/profile is resolved.
  return <Navigate to="/today" replace />;
}

function NotFound() {
  return (
    <main className="container">
      <h1>TrackNPerf</h1>
      <h2>Not found</h2>
      <p style={{ opacity: 0.85 }}>This page doesn’t exist.</p>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/onboarding" element={<OnboardingPage />} />

        <Route element={<RequireProfile />}>
          <Route path="/" element={<IndexRedirect />} />
          <Route path="/today" element={<TodayPage />} />
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/session/:sessionId" element={<SessionDetailPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

