import { createContext, useContext, useEffect, useMemo, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  async function refresh() {
    setError("");
    try {
      const response = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to load account session.");
      setUser(data.user || null);
      setStatus("ready");
      return data;
    } catch (err) {
      setUser(null);
      setStatus("ready");
      setError(err.message || "Unable to load account session.");
      return { authenticated: false, user: null };
    }
  }

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST", credentials: "include" }).catch(() => {});
    setUser(null);
  }

  // The initial session refresh is an intentional external-system synchronization.
  // oxlint-disable-next-line react(set-state-in-effect)
  useEffect(() => {
    void refresh();
  }, []);

  const value = useMemo(() => ({ user, status, error, refresh, signOut }), [user, status, error]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// oxlint-disable-next-line react(only-export-components)
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

// oxlint-disable-next-line react(only-export-components)
export function authRequired() {
  return String(import.meta.env.VITE_AUTH_REQUIRED || "false").toLowerCase() === "true";
}
