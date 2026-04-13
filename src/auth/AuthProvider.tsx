import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../infra/supabase/client";

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  isConfigured: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider(props: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const isConfigured = Boolean(supabase);

  useEffect(() => {
    let ignore = false;

    async function init() {
      if (!supabase) {
        if (!ignore) setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) {
        // If session retrieval fails, still allow rendering unauth UI.
        if (!ignore) setLoading(false);
        return;
      }
      if (!ignore) {
        setSession(data.session);
        setUser(data.session?.user ?? null);
        setLoading(false);
      }
    }

    void init();

    if (!supabase) return;

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (ignore) return;
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
      },
    );

    return () => {
      ignore = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      user,
      isConfigured,
      signOut: async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
      },
    }),
    [isConfigured, loading, session, user],
  );

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

