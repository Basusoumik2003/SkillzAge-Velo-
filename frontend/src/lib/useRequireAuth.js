"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function useRequireAuth() {
  const router = useRouter();

  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      // =====================================================
      // ADMIN AUTH TOKEN
      // Use ONLY skillzage_admin_token
      // =====================================================

      const token = window.localStorage.getItem(
        "skillzage_admin_token"
      );

      // =====================================================
      // NO ADMIN TOKEN
      // =====================================================

      if (!token) {
        console.log(
          "[ADMIN AUTH] No admin token found. Redirecting to login."
        );

        router.replace("/login");
        return;
      }

      // =====================================================
      // ADMIN TOKEN FOUND
      // =====================================================

      console.log(
        "[ADMIN AUTH] skillzage_admin_token found."
      );

      setReady(true);

    } catch (error) {
      console.error(
        "[ADMIN AUTH] Failed to read admin token:",
        error
      );

      router.replace("/login");
    }
  }, [router]);

  return { ready };
}