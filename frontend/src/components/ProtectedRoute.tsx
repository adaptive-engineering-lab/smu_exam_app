import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

interface Props {
  children: React.ReactNode;
  roles?: string[];
}

/** Synchronous role read from the Supabase-cached JWT in localStorage. */
export function getRole(): string | null {
  const keys = Object.keys(localStorage).filter(
    (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
  );
  for (const key of keys) {
    try {
      const session = JSON.parse(localStorage.getItem(key) ?? "{}");
      if (session?.access_token) {
        const payload = JSON.parse(atob(session.access_token.split(".")[1]));
        return payload.app_metadata?.role ?? null;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

type SessionState = "loading" | "authenticated" | "unauthenticated";

export function ProtectedRoute({ children, roles }: Props) {
  const [state, setState] = useState<SessionState>("loading");
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setRole(data.session.user.app_metadata?.role ?? null);
        setState("authenticated");
      } else {
        setState("unauthenticated");
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setRole(session.user.app_metadata?.role ?? null);
        setState("authenticated");
      } else {
        setState("unauthenticated");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (state === "loading") return null;
  if (state === "unauthenticated") return <Navigate to="/login" replace />;
  if (roles && (!role || !roles.includes(role))) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
