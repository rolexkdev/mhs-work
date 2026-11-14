"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Opening the same page again within this window is not logged again. */
const REPEAT_WINDOW_MS = 5 * 60 * 1000;
const STORAGE_KEY = "activity:last-page-views";

function readLastViews(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeLastViews(views: Record<string, number>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    // storage unavailable (private mode) — just log more often
  }
}

/**
 * Records page views in user_activity (0021) so admins can see who actually
 * uses the app. Renders nothing; failures are ignored on purpose.
 */
export function ActivityTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;

    const now = Date.now();
    const views = readLastViews();
    if (now - (views[pathname] ?? 0) < REPEAT_WINDOW_MS) return;
    views[pathname] = now;
    writeLastViews(views);

    const supabase = createClient();
    void supabase
      .from("user_activity")
      .insert({ kind: "page_view", path: pathname })
      .then(() => undefined);
  }, [pathname]);

  return null;
}
