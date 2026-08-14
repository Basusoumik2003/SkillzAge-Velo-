"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  description = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  onClose,
}) {
  const handleCancel = onCancel || onClose;

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") handleCancel?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, handleCancel]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100010] grid place-items-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={handleCancel}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-[1.2rem] border border-white/15 bg-white shadow-[0_40px_90px_-55px_rgba(2,6,23,0.95)] sm:rounded-[1.6rem]">
        <div className="p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Confirm</p>
          <h3 className="mt-2 text-xl font-black text-slate-900">{title}</h3>
          {description ? <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p> : null}
        </div>
        <div className="grid gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex sm:items-center sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-900 transition hover:bg-slate-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm?.();
              onClose?.();
            }}
            className="rounded-2xl bg-[#f97316] px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-[#ea580c]"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

