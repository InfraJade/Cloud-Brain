import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, loadSession, saveSession, setUnauthorizedHandler, type AuthSession, type User } from "@/lib/api";

type AuthContextValue = {
  user: User | null;
  session: AuthSession | null;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: (reason?: string) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const logout = useCallback(
    (reason?: string) => {
      saveSession(null);
      setSession(null);
      queryClient.clear();
      if (reason) toast.info(reason);
      navigate("/login", { replace: true });
    },
    [navigate, queryClient],
  );

  // Any 401 from the API ends the session.
  useEffect(() => {
    setUnauthorizedHandler(() => logout("Your session has ended. Please sign in again."));
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Expire the session client-side when the token runs out.
  useEffect(() => {
    if (!session) return;
    const ms = session.expires_at - Date.now();
    const timer = window.setTimeout(() => logout("Your session expired. Please sign in again."), Math.max(ms, 0));
    return () => window.clearTimeout(timer);
  }, [session, logout]);

  const login = useCallback(async (email: string, password: string) => {
    const next = await api.login(email, password);
    saveSession(next);
    setSession(next);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user: session?.user ?? null, session, isAdmin: session?.user.role === "admin", login, logout }),
    [session, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
