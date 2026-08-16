"use client";

import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoadingState({ rows = 4, className = "" }) {
  return (
    <div className={`flex flex-col gap-3 p-4 ${className}`}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
