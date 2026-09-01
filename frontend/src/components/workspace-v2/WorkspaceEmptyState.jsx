"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

export default function WorkspaceEmptyState({ icon: Icon, title, description, className, action = null }) {
  return (
    <div className={cn("flex h-full min-h-[160px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center", className)}>
      {Icon ? (
        <span className="relative grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
          <span className="absolute inset-0 -z-10 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.22),transparent_70%)] blur-md" />
          <motion.span
            className="grid place-items-center"
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          >
            <Icon className="h-5 w-5" />
          </motion.span>
        </span>
      ) : null}
      {title ? <p className="text-sm font-semibold text-foreground">{title}</p> : null}
      {description ? <p className="max-w-xs text-xs leading-5 text-muted-foreground">{description}</p> : null}
      {action}
    </div>
  );
}
