import { useEffect, useState } from "react";
import { supabase } from "../infra/supabase/client";

export function useIsAdmin(userId: string | null) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function run() {
      if (!supabase || !userId) {
        if (!ignore) {
          setLoading(false);
          setIsAdmin(false);
          setError(null);
        }
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase.rpc("is_admin");
        if (ignore) return;
        if (error) throw new Error(error.message);
        setIsAdmin(Boolean(data));
      } catch (e) {
        if (!ignore) {
          setIsAdmin(false);
          setError(e instanceof Error ? e.message : "Could not check admin role.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void run();
    return () => {
      ignore = true;
    };
  }, [userId]);

  return { loading, isAdmin, error };
}

