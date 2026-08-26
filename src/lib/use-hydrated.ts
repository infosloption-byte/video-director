import { useEffect, useState } from "react";
import { useHelix } from "./store";

export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const unsub = useHelix.persist.onFinishHydration(() => setHydrated(true));
    if (useHelix.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);
  return hydrated;
}
