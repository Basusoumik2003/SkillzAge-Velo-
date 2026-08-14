"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getDecorationAnimationStyle, getPlacementStyle, normalizeDecorationForPage } from "./themeEngine";

const canvasScale = 0.82;

function imageFor(item, assetMap) {
  if (item.file) return URL.createObjectURL(item.file);
  const asset = assetMap.get(String(item.asset_id));
  const candidate = asset?.file_url || item.legacy_url || item.file_url || item.image_url || item.src || item.url || "";
  if (!candidate) return "";
  if (/^https?:\/\//i.test(candidate) || candidate.startsWith("data:")) return candidate;
  return candidate.startsWith("/") ? candidate : `/${candidate.replace(/^\/+/, "")}`;
}

export default function ThemePreviewCanvas({ editor, assetMap, selectedIndex, onSelect, onMove, onDuplicate, onDelete, snapToGrid = true }) {
  const [dragging, setDragging] = useState(null);
  const canvasRef = useRef(null);
  const grid = snapToGrid ? 8 : 1;
  const selectedItem = editor.decorations.find((item, index) => item.id === selectedIndex || index === selectedIndex) || null;
  const beginDrag = (event, index) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onSelect(index);
    setDragging({ index, x: event.clientX, y: event.clientY });
  };
  const moveDrag = (event) => {
    if (!dragging) return;
    const dx = Math.round((event.clientX - dragging.x) / grid) * grid;
    const dy = Math.round((event.clientY - dragging.y) / grid) * grid;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    onMove(dragging.index, dx, dy);
    setDragging({ ...dragging, x: event.clientX, y: event.clientY });
  };
  const guideStyle = useMemo(() => ({ backgroundImage: "linear-gradient(to right, rgba(148,163,184,.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,.18) 1px, transparent 1px)", backgroundSize: "24px 24px" }), []);
  useEffect(() => {
    const handle = (event) => {
      if (selectedIndex == null || !canvasRef.current?.contains(document.activeElement)) return;
      const step = event.shiftKey ? 10 : 1;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Delete", "Escape"].includes(event.key)) event.preventDefault();
      if (event.key === "ArrowUp") onMove(selectedIndex, 0, -step);
      if (event.key === "ArrowDown") onMove(selectedIndex, 0, step);
      if (event.key === "ArrowLeft") onMove(selectedIndex, -step, 0);
      if (event.key === "ArrowRight") onMove(selectedIndex, step, 0);
      if (event.key === "Delete") onDelete(selectedIndex);
      if (event.key === "Escape") onSelect(-1);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") onDuplicate(selectedIndex);
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [selectedIndex, onDelete, onDuplicate, onMove, onSelect]);
  return <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500">
      <span>{selectedItem ? `Selected: ${selectedItem.name || "Decoration"}` : "Select a decoration to edit it"}</span>
      <span>Delete, Ctrl+D, arrows, Escape</span>
    </div>
    <div ref={canvasRef} tabIndex={0} onPointerMove={moveDrag} onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)} className="relative h-[440px] overflow-hidden rounded-xl border border-slate-700 bg-slate-950 text-white outline-none ring-orange-400 focus:ring-2" style={guideStyle}>
      <div className="absolute inset-x-4 top-4 h-16 rounded-lg border border-white/10 bg-slate-900/95 px-5 py-5 text-xs font-black tracking-wide"><span className="text-white">InternzBee navbar</span><span className="float-right text-slate-400">HOME PROJECT DASHBOARD PROFILE</span></div>
      <div className="absolute inset-x-0 bottom-16 top-24 bg-gradient-to-br from-slate-800 via-slate-700 to-slate-950 opacity-80" />
      <div className="absolute left-1/2 top-40 w-[58%] -translate-x-1/2 text-center"><div className="text-xl font-black">Page content remains protected</div><div className="mt-3 inline-flex rounded-lg bg-orange-500 px-4 py-2 text-xs font-black">Primary action</div></div>
      <div className="absolute bottom-4 left-4 right-4 h-10 rounded-lg border border-white/10 bg-slate-900/90 pt-3 text-center text-[10px] font-bold text-slate-400">Footer preview</div>
      <div className="pointer-events-none absolute left-4 right-4 top-24 h-20 border border-dashed border-amber-300/50 bg-amber-300/5" />
      {editor.decorations.map((rawItem, index) => {
        const item = normalizeDecorationForPage(rawItem, rawItem.page);
        const src = imageFor(item, assetMap);
        if (!src) return null;
        const base = getPlacementStyle(item);
        const selected = selectedIndex === item.id || selectedIndex === index;
        const isBackground = item.placement_slot === "page_background" || String(item.placement_slot || "").endsWith("_background");
        const isNavbarUnder = ["navbar_strip", "navbar_under"].includes(item.placement_slot);
        if (isNavbarUnder) {
          const stripHeight = Math.max(18, Number(item.height) || 34);
          return <span key={item.id || index} onClick={() => onSelect(item.id || index)} onPointerDown={(event) => beginDrag(event, item.id || index)} className={`theme-decoration-image absolute left-0 block cursor-move select-none ring-2 transition ${selected ? "ring-orange-400" : "ring-transparent hover:ring-orange-300"} ${item.enabled === false ? "opacity-35" : ""}`} style={{ ...base, right: "auto", marginLeft: item.offset_x || 0, marginTop: item.offset_y || 0, width: "100%", height: `${stripHeight}px`, maxWidth: "none", zIndex: Number(item.z_index) || 10, backgroundImage: `url("${src}")`, backgroundRepeat: "no-repeat", backgroundSize: "100% 100%", backgroundPosition: "center", ...getDecorationAnimationStyle(item) }} title="Drag to reposition" />;
        }
        return <img key={item.id || index} draggable={false} onClick={() => onSelect(item.id || index)} onPointerDown={(event) => beginDrag(event, item.id || index)} src={src} alt={item.name || "Decoration"} className={`theme-decoration-image absolute cursor-move select-none object-contain ring-2 transition ${selected ? "ring-orange-400" : "ring-transparent hover:ring-orange-300"} ${item.enabled === false ? "opacity-35" : ""}`} style={{ ...base, marginLeft: item.offset_x || 0, marginTop: item.offset_y || 0, width: isBackground ? "100%" : `${Math.min(Number(item.width) || 160, 360) * canvasScale}px`, height: isBackground ? "100%" : item.height ? `${item.height * canvasScale}px` : "auto", maxWidth: isBackground ? "none" : "48vw", zIndex: Number(item.z_index) || 10, ...getDecorationAnimationStyle(item) }} title="Drag to reposition" />;
      })}
      {selectedIndex >= 0 ? <div className="absolute bottom-4 right-4 flex gap-2"><button type="button" onClick={() => onDuplicate(selectedIndex)} className="pointer-events-auto rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-900">Duplicate</button><button type="button" onClick={() => onDelete(selectedIndex)} className="pointer-events-auto rounded-lg bg-red-500 px-3 py-2 text-xs font-black text-white">Delete</button></div> : null}
    </div>
  </div>;
}












