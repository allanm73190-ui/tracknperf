import { useEffect, useState } from "react";
import { supabase } from "../infra/supabase/client";

export type UserRole = "admin" | "member" | "coach" | "athlete" | null;

export function useUserRole(userId: string | null) {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function run() {
      if (!supabase || !userId) {
        if (!ignore) {
          setRole(null);
          setError(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (ignore) return;
      if (error) {
        setRole(null);
        setError(error.message);
        setLoading(false);
        return;
      }

      const nextRole = typeof data?.role === "string" ? (data.role as UserRole) : null;
      setRole(nextRole);
      setLoading(false);
    }

    void run();
    return () => {
      ignore = true;
    };
  }, [userId]);

  return { loading, role, error };
}
