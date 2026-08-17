"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "./ThemeProvider";
import { getDecorationAnimationStyle, getDecorationBlendStyle, getPlacementStyle, getVisibilityClass, resolveRoutePage, resolveSlotDecorations } from "./themeEngine";

function NavbarStrip({ item }) {
  const height = Math.max(18, Number(item.height) || 54);
  return <span className={`theme-decoration-image absolute left-0 block w-screen max-w-none ${getVisibilityClass(item)}`} style={{ ...getPlacementStyle(item), right: "auto", marginLeft: item.offset_x || 0, marginTop: item.offset_y || 0, height: `${height}px`, zIndex: item.z_index, backgroundImage: `url("${item.image_url}")`, backgroundRepeat: "no-repeat", backgroundSize: "100% 100%", backgroundPosition: "center", ...getDecorationAnimationStyle(item), ...getDecorationBlendStyle(item) }} />;
}
function RepeatDecoration({ item, className, style }) {
  const tileWidth = Math.max(40, Number(item.width) || 160);
  const count = typeof window === "undefined" ? 12 : Math.ceil(window.innerWidth / tileWidth) + 2;
  return <span className={`absolute flex items-start overflow-visible ${className}`} style={{ ...style, width: "100%" }}>
    {Array.from({ length: count }).map((_, index) => <img key={`${item.id}-${index}`} src={item.image_url} alt="" loading="lazy" className="theme-decoration-image block shrink-0 object-contain" style={{ width: `${tileWidth}px`, height: item.height ? `${item.height}px` : "auto", marginLeft: index === 0 ? item.offset_x || 0 : 0, marginTop: item.offset_y || 0, zIndex: item.z_index, ...getDecorationAnimationStyle(item), ...getDecorationBlendStyle(item) }} />)}
  </span>;
}

export default function ThemeSlot({ page }) {
  const pathname = usePathname() || "/";
  const theme = useTheme();
  if (pathname.startsWith("/adminDashboard")) return null;
  if (!theme || theme.preview_mode) return null;
  const routePage = resolveRoutePage(pathname);
  const items = resolveSlotDecorations(theme, page, routePage);
  if (!items.length) return null;
  const containerClass = page === "navbar" ? "pointer-events-none fixed inset-0 z-[100001] overflow-visible" : "pointer-events-none absolute inset-0 z-[100001] overflow-visible";
  return <span className={containerClass} aria-hidden="true">
    {items.map((item) => ["navbar_strip", "navbar_under"].includes(item.placement_slot) ? <NavbarStrip key={item.id} item={item} /> : ["navbar", "navbar_bottom"].includes(item.placement_slot) ? <RepeatDecoration key={item.id} item={item} className={getVisibilityClass(item)} style={getPlacementStyle(item)} /> : <img key={item.id} src={item.image_url} alt="" loading="lazy" className={`theme-decoration-image absolute object-contain ${getVisibilityClass(item)}`} style={{ ...getPlacementStyle(item), marginLeft: item.offset_x || 0, marginTop: item.offset_y || 0, width: `clamp(36px, ${item.width}px, 35vw)`, height: item.height ? `${item.height}px` : "auto", zIndex: item.z_index, ...getDecorationAnimationStyle(item), ...getDecorationBlendStyle(item) }} />)}
  </span>;
}













