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
import PlannedSessionDetailPage from "../ui/pages/PlannedSessionDetail";
import ProgrammePage from "../ui/pages/Programme";
import StatsPage from "../ui/pages/Stats";
import ImportPlanPage from "../ui/pages/ImportPlan";
import ProfileEditPage from "../ui/pages/ProfileEdit";
import SettingsUnitsPage from "../ui/pages/SettingsUnits";
import SettingsPage from "../ui/pages/Settings";
import TodayPage from "../ui/pages/Today";

function AppLoading(props: { title?: string }) {
  return (
    <main className="container">
      <h1>TrackNPerf</h1>
      <p>{props.title ?? "Chargement…"} </p>
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
        <h2>Profil</h2>
        <p role="alert" style={{ maxWidth: 720 }}>
          Impossible de charger votre profil. Vérifiez votre connexion et réessayez.
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
          Vous n’avez pas accès à cette page.
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
      <h2>Page introuvable</h2>
      <p style={{ opacity: 0.85 }}>Cette page n’existe pas.</p>
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
          <Route path="/planned-session/:sessionId" element={<PlannedSessionDetailPage />} />
          <Route path="/programme" element={<ProgrammePage />} />
          <Route path="/import-plan" element={<ImportPlanPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/profile" element={<ProfileEditPage />} />
          <Route path="/settings/units" element={<SettingsUnitsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

