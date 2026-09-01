"use client";

import { motion } from "framer-motion";

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
              "relative rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
              active
                ? "border-primary/30 text-primary"
                : "border-border bg-muted/40 text-secondary hover:bg-muted"
            )}
          >
            {active ? (
              <motion.span
                layoutId="workspace-tab-active"
                className="absolute inset-0 -z-10 rounded-lg bg-primary/10 shadow-sm"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            ) : null}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
