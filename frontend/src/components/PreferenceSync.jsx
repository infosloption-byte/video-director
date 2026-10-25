import { useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext.jsx";

/**
 * Keeps saved account preferences and this device in step:
 *  - applies the saved theme once per sign-in (if the user ever chose one),
 *  - saves later theme changes (top-bar toggle or Settings) back to the account,
 *  - applies "reduce motion" app-wide.
 */
export default function PreferenceSync() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const syncedFor = useRef(null);
  const lastSaved = useRef(null);
  const reduceMotion = Boolean(user?.preferences?.reduceMotion);
  const savedTheme = user?.preferences?.theme || null;
  const userId = user?.id || null;

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = reduceMotion ? "true" : "false";
  }, [reduceMotion]);

  useEffect(() => {
    if (!userId) { syncedFor.current = null; lastSaved.current = null; return; }
    if (syncedFor.current !== userId) {
      syncedFor.current = userId;
      lastSaved.current = savedTheme;
      // oxlint-disable-next-line react(set-state-in-effect)
      if (savedTheme && savedTheme !== theme) setTheme(savedTheme);
      return;
    }
    if (theme !== lastSaved.current) {
      lastSaved.current = theme;
      fetch("/api/account/preferences", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme }) }).catch(() => {});
    }
  }, [userId, savedTheme, theme, setTheme]);

  return null;
}
