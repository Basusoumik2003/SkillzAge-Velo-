"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
import ThemeOverlay from "./ThemeOverlay";
import ThemeWebsitePreviewEditor from "./ThemeWebsitePreviewEditor";

const ThemeContext = createContext(null);
export function useTheme() { return useContext(ThemeContext); }

export default function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(null);
  const [savingPreview, setSavingPreview] = useState(false);
  const [previewMessage, setPreviewMessage] = useState("");
  const searchParams = useSearchParams();
  const router = useRouter();
  const previewId = searchParams.get("theme_preview");
  const getApiRoot = () => String(API_BASE_URL || "").replace(/\/+$/, "");
  useEffect(() => {
    let cancelled = false;
    // Theme APIs are served by the gateway, not by the Next.js app server.
      const apiRoot = getApiRoot();
    const token = typeof window !== "undefined" ? localStorage.getItem("internlabs_token") : "";
    const endpoint = previewId ? `${apiRoot}/api/themes/preview/${encodeURIComponent(previewId)}` : `${apiRoot}/api/themes/active`;
    fetch(endpoint, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((response) => response.ok ? response.json() : { theme: null })
      .then((data) => { if (!cancelled) setTheme(data?.theme || null); })
      .catch(() => { if (!cancelled) setTheme(null); });
    return () => { cancelled = true; };
  }, [previewId]);
  const movePreviewDecoration = (index, dx, dy) => setTheme((current) => current ? { ...current, decorations: current.decorations.map((item, itemIndex) => itemIndex === index || item.id === index ? { ...item, offset_x: Math.round(Number(item.offset_x || 0) + Number(dx || 0)), offset_y: Math.round(Number(item.offset_y || 0) + Number(dy || 0)) } : item) } : current);
  const savePreview = async () => {
    if (!theme || !previewId) return;
    setSavingPreview(true); setPreviewMessage("");
    try {
      // Theme APIs are served by the gateway, not by the Next.js app server.
      const apiRoot = getApiRoot();
      const token = localStorage.getItem("internlabs_token") || "";
      const config = { name: theme.name, description: theme.description || "", start_date: theme.start_date || "", end_date: theme.end_date || "", status: theme.status, banners: (theme.assets || []).filter((item) => item.asset_type === "banner").map((item) => ({ page: item.page, asset_id: item.asset_id, file_url: item.file_url, alt_text: item.alt_text || "" })), decorations: (theme.decorations || []).map((item) => ({ ...item, asset_id: item.asset_id, file_url: item.image_url })) };
      const body = new FormData(); body.append("config", JSON.stringify(config));
      const response = await fetch(`${apiRoot}/api/themes/${encodeURIComponent(previewId)}`, { method: "PUT", headers: token ? { Authorization: `Bearer ${token}` } : {}, body });
      if (!response.ok) throw new Error("Save failed");
      setPreviewMessage("Saved");
    } catch { setPreviewMessage("Could not save"); } finally { setSavingPreview(false); }
  };
  useEffect(() => {
    if (!previewId) return undefined;
    const handlePreviewNavigation = (event) => {
      const anchor = event.target.closest?.("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.origin);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/adminDashboard")) return;
      if (url.searchParams.has("theme_preview")) return;
      event.preventDefault(); url.searchParams.set("theme_preview", previewId); router.push(`${url.pathname}${url.search}${url.hash}`);
    };
    document.addEventListener("click", handlePreviewNavigation);
    return () => document.removeEventListener("click", handlePreviewNavigation);
  }, [previewId, router]);
  const previewTheme = previewId && theme ? { ...theme, preview_mode: true } : theme;
  return <ThemeContext.Provider value={previewTheme}><ThemeOverlay theme={previewTheme} />{previewId && theme ? <ThemeWebsitePreviewEditor theme={theme} onMove={movePreviewDecoration} onSave={savePreview} saving={savingPreview} message={previewMessage}>{children}</ThemeWebsitePreviewEditor> : children}</ThemeContext.Provider>;;
}
