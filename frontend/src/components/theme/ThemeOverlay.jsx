"use client";

import { usePathname } from "next/navigation";
import { getDecorationAnimationStyle, getDecorationBlendStyle, getPlacementStyle, getVisibilityClass, resolveRoutePage, resolveThemeAssets, THEME_LAYERS } from "./themeEngine";

export default function ThemeOverlay({ theme }) {
  const pathname = usePathname() || "/";
  if (pathname.startsWith("/adminDashboard")) return null;
  if (!theme || theme.preview_mode) return null;
  const page = resolveRoutePage(pathname);
  const { banner, decorations } = resolveThemeAssets(theme, page);
  return <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
    {banner ? <img src={banner.file_url} alt="" loading="lazy" className="absolute left-1/2 top-3 max-h-24 w-auto max-w-[90vw] -translate-x-1/2 object-contain opacity-95" style={{ zIndex: THEME_LAYERS.banner }} /> : null}
    {decorations.map((item) => {
      const isBackground = item.placement_slot === "page_background" || String(item.placement_slot || "").endsWith("_background");
      return <img key={item.id} src={item.image_url} alt="" loading="lazy" className={`theme-decoration-image absolute object-contain ${getVisibilityClass(item)} ${isBackground ? "h-full w-full object-cover opacity-25" : ""}`} style={{ ...getPlacementStyle(item), marginLeft: item.offset_x || 0, marginTop: item.offset_y || 0, width: isBackground ? "100%" : `clamp(48px, ${item.width}px, 35vw)`, height: isBackground ? "100%" : item.height ? `${item.height}px` : "auto", zIndex: Number(item.z_index) || THEME_LAYERS.decoration, ...getDecorationAnimationStyle(item), ...getDecorationBlendStyle(item) }} />;
    })}
  </div>;
}





