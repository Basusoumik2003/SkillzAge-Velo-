"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Not part of the exported InternzBee source; added only so the (out of
// scope) adminDashboard page resolves at build time. Minimal client-side
// gate: redirects to /login when no admin token is present.
export default function useRequireAuth() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const token = window.localStorage.getItem("internlabs_admin_token") || window.localStorage.getItem("internlabs_token");
      if (!token) {
        router.replace("/login");
        return;
      }
    } catch {
      // ignore storage access errors
    }
    setReady(true);
  }, [router]);

  return { ready };
}
