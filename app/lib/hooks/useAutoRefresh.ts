"use client";

import { useEffect, useRef } from "react";

interface UseAutoRefreshOptions {
  /** How often to refresh while the tab is visible. Default: 60s. */
  intervalMs?: number;
  /**
   * Set to false to pause polling entirely — e.g. while a form on the page
   * has unsaved edits, or a modal is open. Refresh-worthy list/overview
   * pages should leave this true; anything with an editable form in place
   * should wire this to "no unsaved changes."
   */
  enabled?: boolean;
}

/**
 * Polls `refresh` on an interval, but only while the tab is actually
 * visible — and re-runs it immediately when the tab regains focus, so data
 * isn't stale for up to a full interval after switching back. Does not
 * fetch anything itself; pass in whatever function already loads this
 * page's data (a fetch call, a server action, router.refresh(), etc).
 */
export function useAutoRefresh(
  refresh: () => void | Promise<void>,
  { intervalMs = 60_000, enabled = true }: UseAutoRefreshOptions = {}
) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (document.visibilityState === "visible") {
        refreshRef.current();
      }
    };

    const id = setInterval(tick, intervalMs);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, enabled]);
}