"use client";

import { forwardRef } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

const AdminNavGroup = forwardRef(function AdminNavGroup(
  { group, isOpen, activeSection, notifications = {}, onToggle },
  ref,
) {
  const title = String(group?.title || group?.key || "Section").trim();
  const items = Array.isArray(group?.items) ? group.items : [];
  const badgeCount = items.reduce((sum, item) => sum + (Number(notifications?.[item.key]) || 0), 0);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex min-w-[13.5rem] items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition",
        isOpen || items.some((item) => item.key === activeSection)
          ? "border-[#d6e0ef] bg-white shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)]"
          : "border-transparent bg-slate-50 hover:bg-slate-100",
      )}
    >
      <span className="min-w-0">
        <span className={cn("block truncate text-sm font-black", isOpen ? "text-slate-950" : "text-slate-700")}>{title}</span>
      </span>
      <span className="flex items-center gap-2">
        {badgeCount ? (
          <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-orange-700">
            {badgeCount}
          </span>
        ) : null}
        {isOpen ? <ChevronUp className="h-4 w-4 text-slate-800" /> : <ChevronDown className="h-4 w-4 text-slate-800" />}
      </span>
    </button>
  );
});

export default AdminNavGroup;
