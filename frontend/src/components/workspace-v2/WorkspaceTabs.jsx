"use client";

import { cn } from "@/lib/utils";

export default function WorkspaceTabs({ tabs = [], activeKey, onChange, dataTour }) {
  return (
    <div data-tour={dataTour} className="flex flex-wrap gap-1.5">
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange?.(tab.key)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
              active
                ? "border-primary/30 bg-primary/10 text-primary shadow-sm"
                : "border-border bg-muted/40 text-secondary hover:bg-muted"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
