"use client";

import { ChevronDown } from "lucide-react";

import { ADMIN_NAV_GROUPS } from "./adminNavData";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function AdminDashboardNav({
  activeSection,
  notifications = {},
  onSelectSection,
  onMarkSeen,
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {ADMIN_NAV_GROUPS.map((group) => {
        const items = Array.isArray(group.items) ? group.items : [];
        const isActiveGroup = items.some((item) => item.key === activeSection);
        const badgeCount = items.reduce((sum, item) => sum + (Number(notifications?.[item.key]) || 0), 0);

        return (
          <DropdownMenu key={group.key}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition",
                  isActiveGroup
                    ? "border-[#d6e0ef] bg-white shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)]"
                    : "border-transparent bg-slate-50 hover:bg-slate-100",
                )}
              >
                <span className={cn("max-w-[9.5rem] truncate text-sm font-black", isActiveGroup ? "text-slate-950" : "text-slate-700")}>
                  {group.title}
                </span>
                <span className="flex items-center gap-2">
                  {badgeCount ? (
                    <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-orange-700">
                      {badgeCount}
                    </span>
                  ) : null}
                  <ChevronDown className="h-4 w-4 text-slate-800" />
                </span>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="start" className="w-[22rem] rounded-2xl border-slate-200 p-0 shadow-[0_20px_45px_-28px_rgba(15,23,42,0.45)]">
              <DropdownMenuLabel className="border-b border-slate-100 px-4 py-3 text-[0.7rem] font-black uppercase tracking-[0.22em] text-slate-400">
                {group.title}
              </DropdownMenuLabel>
              <div className="grid gap-1 p-2">
                {items.map((item) => {
                  const active = item.key === activeSection;
                  const count = Number(notifications?.[item.key]) || 0;

                  return (
                    <DropdownMenuItem
                      key={item.key}
                      onSelect={() => {
                        onSelectSection?.(item.key);
                        if (count) onMarkSeen?.(item.key);
                      }}
                      className={cn(
                        "flex items-start justify-between gap-3 rounded-xl px-3 py-2.5",
                        active ? "bg-slate-50 text-slate-950" : "text-slate-800",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-black leading-5">{item.label}</span>
                        {item.description ? (
                          <span className="mt-0.5 block text-xs font-semibold leading-4 text-slate-500">{item.description}</span>
                        ) : null}
                      </span>
                      {count ? (
                        <span className="mt-0.5 shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-orange-700">
                          {count}
                        </span>
                      ) : null}
                    </DropdownMenuItem>
                  );
                })}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </div>
  );
}
