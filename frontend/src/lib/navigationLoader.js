"use client";

// Not part of the exported InternzBee source; added only so the (out of
// scope) adminDashboard page and root layout resolve at build time.

export function useNavigationLoader() {
  return { loading: false, start: () => {}, done: () => {} };
}
