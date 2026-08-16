"use client";

import { cn } from "@/lib/utils";

export default function WorkspaceEmptyState({ icon: Icon, title, description, className, action = null }) {
  return (
    <div className={cn("flex h-full min-h-[160px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center", className)}>
      {Icon ? (
        <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      {title ? <p className="text-sm font-semibold text-foreground">{title}</p> : null}
      {description ? <p className="max-w-xs text-xs leading-5 text-muted-foreground">{description}</p> : null}
      {action}
    </div>
  );
}
