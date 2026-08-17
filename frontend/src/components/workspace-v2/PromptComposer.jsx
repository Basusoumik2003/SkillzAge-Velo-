"use client";

import { cn } from "@/lib/utils";

/**
 * ChatBox already owns its full composer (textarea, attach, send button) in
 * its footer. This component only supplies the sticky container styling
 * around it — no new composer UI, no new business logic.
 */
export default function PromptComposer({ children, className }) {
  return (
    <div className={cn("sticky bottom-0 z-10 -mx-1 rounded-xl bg-card px-0 pb-0 pt-1", className)}>
      {children}
    </div>
  );
}
