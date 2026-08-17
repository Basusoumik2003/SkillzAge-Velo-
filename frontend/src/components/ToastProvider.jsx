"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

const ToastContext = createContext(null);

function ToastItem({ toast, onDismiss }) {
  const tone =
    toast.type === "error"
      ? {
          shell: "border-red-200/80 bg-[linear-gradient(135deg,#fff7f7_0%,#fff_100%)] text-red-900 shadow-red-950/10",
          icon: "bg-red-100 text-red-600 ring-red-200",
          bar: "bg-red-500"
        }
      : toast.type === "success"
        ? {
            shell: "border-emerald-200/80 bg-[linear-gradient(135deg,#f2fff8_0%,#fff_100%)] text-emerald-950 shadow-emerald-950/10",
            icon: "bg-emerald-100 text-emerald-700 ring-emerald-200",
            bar: "bg-emerald-500"
          }
        : {
            shell: "border-slate-200/90 bg-white text-slate-900 shadow-slate-950/10",
            icon: "bg-slate-100 text-slate-600 ring-slate-200",
            bar: "bg-slate-400"
          };
  const iconPath =
    toast.type === "error"
      ? "M12 8v4M12 16h.01M12 3a9 9 0 100 18 9 9 0 000-18z"
      : toast.type === "success"
        ? "M5 12l4 4L19 6"
        : "M12 11v5M12 8h.01M12 3a9 9 0 100 18 9 9 0 000-18z";

  return (
    <div className={`pointer-events-auto relative w-full min-w-0 overflow-hidden rounded-2xl border px-3.5 py-3 shadow-2xl backdrop-blur sm:w-fit sm:min-w-[260px] sm:max-w-[min(92vw,390px)] ${tone.shell}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${tone.bar}`} aria-hidden="true" />
      <div className="flex items-start gap-3 pl-1">
        <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ring-1 ${tone.icon}`}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
            <path d={iconPath} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
          </svg>
        </span>
        <div className="min-w-0 flex-1 pr-1 text-sm font-semibold leading-5">{toast.message}</div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-slate-900/5 hover:text-slate-900"
          aria-label="Dismiss notification"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
            <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    ({ type = "info", message, ttlMs = 3800 }) => {
      const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const toast = { id, type, message };
      setToasts((prev) => [toast, ...prev].slice(0, 3));
      window.setTimeout(() => dismiss(id), ttlMs);
      return id;
    },
    [dismiss]
  );

  const api = useMemo(
    () => ({
      toast: {
        info: (message) => push({ type: "info", message }),
        success: (message) => push({ type: "success", message }),
        error: (message) => push({ type: "error", message })
      }
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 top-20 z-[9999] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:top-24 sm:items-end">
        {toasts.map((t) => <ToastItem key={t.id} toast={t} onDismiss={dismiss} />)}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return { toast: { info: () => {}, success: () => {}, error: () => {} } };
  return ctx;
}
