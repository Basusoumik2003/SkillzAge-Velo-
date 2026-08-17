"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "internlabs_cookie_consent_v1";

// Minimal stub: the original InternzBee cookie-consent banner was not part
// of the exported source. This preserves the import contract used by
// src/app/layout.js with a small, self-contained implementation.
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(STORAGE_KEY)) {
        setVisible(true);
      }
    } catch {
      // ignore storage access errors
    }
  }, []);

  if (!visible) return null;

  const accept = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore storage access errors
    }
    setVisible(false);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-xl flex-col gap-3 rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-[#374151]">
        We use cookies to keep you signed in and improve your workspace experience.
      </p>
      <button
        type="button"
        onClick={accept}
        className="shrink-0 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1D4ED8]"
      >
        Got it
      </button>
    </div>
  );
}
