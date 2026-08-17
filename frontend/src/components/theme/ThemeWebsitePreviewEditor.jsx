"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getDecorationAnimationStyle, getDecorationBlendStyle, getPlacementStyle, resolveRoutePage, resolveThemeAssets } from "./themeEngine";

function DraggablePreviewDecoration({ item, index, dragging, selected, beginDrag, onSelect }) {
  const base = getPlacementStyle(item);
  const imageUrl = item.image_url || item.file_url || "";
  const isNavbarUnder = ["navbar_strip", "navbar_under"].includes(item.placement_slot);
  const isNavbarStrip = ["navbar", "navbar_bottom"].includes(item.placement_slot);
  const isBackground = item.placement_slot === "page_background" || String(item.placement_slot || "").endsWith("_background");
  const width = Number(item.width) || 160;
  const height = item.height ? `${item.height}px` : (isNavbarStrip ? "88px" : "auto");
  if (isNavbarUnder) {
    const stripHeight = Math.max(18, Number(item.height) || 54);
    return <span onClick={() => onSelect(index)} onPointerDown={(event) => beginDrag(event, index)} className={`theme-decoration-image pointer-events-auto absolute left-0 block w-screen max-w-none cursor-move select-none ring-2 ${selected || dragging?.index === index ? "ring-orange-400" : "ring-transparent hover:ring-orange-400"}`} style={{ ...base, right: "auto", marginLeft: item.offset_x || 0, marginTop: item.offset_y || 0, height: `${stripHeight}px`, zIndex: (Number(item.z_index) || 0) + 1000000, backgroundImage: `url("${imageUrl}")`, backgroundRepeat: "no-repeat", backgroundSize: "100% 100%", backgroundPosition: "center", ...getDecorationAnimationStyle(item), ...getDecorationBlendStyle(item) }} title={`Drag ${item.name || "decoration"}`} />;
  }
  if (isNavbarStrip) {
    return <span onClick={() => onSelect(index)} onPointerDown={(event) => beginDrag(event, index)} className={`pointer-events-auto absolute block cursor-move select-none ring-2 ${selected || dragging?.index === index ? "ring-orange-400" : "ring-transparent hover:ring-orange-400"}`} style={{ ...base, left: 0, transform: "none", marginLeft: item.offset_x || 0, marginTop: item.offset_y || 0, width: "100vw", height, zIndex: (Number(item.z_index) || 0) + 1000000, backgroundImage: `url("${imageUrl}")`, backgroundRepeat: "repeat-x", backgroundSize: `${width}px auto`, backgroundPosition: "left center" }} title={`Drag ${item.name || "decoration"}`} />;
  }
  return <img src={imageUrl} alt={item.name || "Decoration"} draggable={false} onClick={() => onSelect(index)} onPointerDown={(event) => beginDrag(event, index)} className={`theme-decoration-image pointer-events-auto absolute cursor-move select-none object-contain ring-2 ${selected || dragging?.index === index ? "ring-orange-400" : "ring-transparent hover:ring-orange-400"}`} style={{ ...base, marginLeft: item.offset_x || 0, marginTop: item.offset_y || 0, width: isBackground ? "100%" : `${width}px`, height: isBackground ? "100%" : height, maxWidth: isBackground ? "none" : "40vw", zIndex: (Number(item.z_index) || 0) + 1000000, ...getDecorationAnimationStyle(item), ...getDecorationBlendStyle(item) }} title={`Drag ${item.name || "decoration"}`} />;
}

export default function ThemeWebsitePreviewEditor({ theme, children, onMove, onSave, saving, message }) {
  const [dragging, setDragging] = useState(null);
  const [selected, setSelected] = useState(-1);
  const rootRef = useRef(null);
  const pathname = usePathname() || "/";
  const page = resolveRoutePage(pathname);
  const { banner, decorations: pageDecorations } = resolveThemeAssets(theme, page);
  const beginDrag = (event, index) => { event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); setSelected(index); setDragging({ index, x: event.clientX, y: event.clientY }); };
  const moveDrag = (event) => { if (!dragging) return; const dx = event.clientX - dragging.x; const dy = event.clientY - dragging.y; if (dx || dy) { onMove(dragging.index, dx, dy); setDragging({ ...dragging, x: event.clientX, y: event.clientY }); } };
  const decorations = pageDecorations.map((item, index) => ({ item, index: item.__themeIndex ?? index })).filter(({ item }) => item.enabled !== false && (item.image_url || item.file_url));
  useEffect(() => {
    const handle = (event) => {
      if (selected < 0) return;
      const step = event.shiftKey ? 10 : 1;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Escape"].includes(event.key)) event.preventDefault();
      if (event.key === "ArrowUp") onMove(selected, 0, -step);
      if (event.key === "ArrowDown") onMove(selected, 0, step);
      if (event.key === "ArrowLeft") onMove(selected, -step, 0);
      if (event.key === "ArrowRight") onMove(selected, step, 0);
      if (event.key === "Escape") setSelected(-1);
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [selected, onMove]);
  return <div ref={rootRef} onPointerMove={moveDrag} onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)}>
    <div className="pointer-events-auto fixed right-4 top-4 z-[1000001] flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur"><span className="px-2 text-xs font-bold text-slate-500">{message || "Preview editing"}</span><button type="button" onClick={onSave} disabled={saving} className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-black text-white disabled:opacity-60">{saving ? "Saving..." : "Save theme"}</button></div>
    <div className="pointer-events-auto">{children}</div>
    {banner ? <img src={banner.file_url} alt="" loading="lazy" className="pointer-events-none fixed left-1/2 top-3 z-[1000000] max-h-24 w-auto max-w-[90vw] -translate-x-1/2 object-contain opacity-95" /> : null}
    <div aria-label="Draggable theme decorations" className="pointer-events-none fixed inset-0 z-[1000000] overflow-hidden">
      {decorations.map(({ item, index }) => <DraggablePreviewDecoration key={item.id || index} item={item} index={index} dragging={dragging} selected={selected === index} beginDrag={beginDrag} onSelect={setSelected} />)}
    </div>
  </div>;
}









