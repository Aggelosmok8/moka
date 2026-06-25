import { useEffect, useState } from "react";
import { fetchEntitlements, fetchCatalogLeagues } from "../lib/catalogApi";

// Resolves the caller's role + the set of leagues they can access, from the
// backend (anonymous resolves to FREE). Drives all FREE/PRO UI gating.
export function useEntitlements() {
  const [role, setRole] = useState("free");
  const [accessibleIds, setAccessibleIds] = useState(new Set());
  const [refreshSeconds, setRefreshSeconds] = useState(300);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const [ent, lg] = await Promise.all([
        fetchEntitlements().catch(() => null),
        fetchCatalogLeagues().catch(() => null),
      ]);
      if (!active) return;
      if (ent?.entitlements?.role) setRole(ent.entitlements.role);
      if (lg?.leagues) {
        setAccessibleIds(new Set(lg.leagues.map((l) => l.id)));
        if (lg.refresh_seconds) setRefreshSeconds(lg.refresh_seconds);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return { role, accessibleIds, refreshSeconds, loading };
}
