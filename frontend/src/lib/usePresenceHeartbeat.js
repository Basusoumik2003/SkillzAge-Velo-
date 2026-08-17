"use client";

import { useEffect } from "react";
import { getStoredToken } from "@/lib/authStorage";
import { sendPresenceHeartbeat } from "@/lib/dashboard";

export default function usePresenceHeartbeat(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let inFlight = false;

    const beat = async () => {
      if (!active || inFlight || !getStoredToken()) return;
      inFlight = true;
      try {
        await sendPresenceHeartbeat();
      } catch {
        // Presence is best-effort; auth/API failures should not disturb the page.
      } finally {
        inFlight = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };

    beat();
    const intervalId = window.setInterval(beat, 45000);
    window.addEventListener("focus", beat);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", beat);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
}
