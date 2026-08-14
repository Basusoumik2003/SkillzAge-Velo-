"use client";

import { Check, ChevronsLeft, ChevronsRight, Circle, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export default function PhaseSidebar({
  open,
  onToggle,
  workspacePoints = [],
  hasProjectMethodology,
  selectedPoint,
  activeStageIndex,
  canSelectPoint,
  isPointCompleted,
  progressForPoint,
  canAccessStage,
  completedStages = {},
  workingStages = {},
  stageProgressKey,
  projectName,
  formatPhaseDuration,
  onSelectPoint,
  onSelectStage,
  toast
}) {
  return (
    <aside
      data-tour="tour-phases"
      className={cn(
        "flex h-full flex-col overflow-hidden border-r border-border bg-card transition-[width] duration-300 ease-out",
        open ? "w-full" : "w-14"
      )}
    >
      <div className={cn("flex items-center gap-2 border-b border-border px-3 py-3", !open && "justify-center px-0")}>
        <button
          type="button"
          onClick={onToggle}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-background text-secondary transition hover:border-primary/40 hover:text-primary"
          aria-label={open ? "Collapse phases" : "Open phases"}
          title={open ? "Collapse phases" : "Open phases"}
        >
          {open ? <ChevronsLeft className="h-4 w-4" /> : <ChevronsRight className="h-4 w-4" />}
        </button>
        {open ? <p className="text-xs font-semibold uppercase tracking-wide text-secondary">Phases</p> : null}
      </div>

      {open ? (
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-1 p-3">
            {!hasProjectMethodology ? (
              <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-xs font-medium text-secondary">
                No data available.
              </p>
            ) : (
              workspacePoints.map((point, idx) => {
                const step = idx + 1;
                const active = selectedPoint === step;
                const unlocked = canSelectPoint(step);
                const completed = isPointCompleted(step);
                const duration = formatPhaseDuration?.(point);
                const stages = point?.stages || [];

                return (
                  <div key={step} className="rounded-xl">
                    <button
                      type="button"
                      onClick={() => {
                        if (!unlocked) {
                          toast?.info?.("Complete the current step to unlock the next one.");
                          return;
                        }
                        onSelectPoint?.(step);
                      }}
                      disabled={!unlocked}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-xl border px-2.5 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
                        active ? "border-primary/30 bg-primary/5" : "border-transparent hover:bg-muted/50"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 text-[10px] font-bold",
                          completed
                            ? "border-success bg-success text-white"
                            : active
                              ? "border-primary bg-primary text-white"
                              : "border-border bg-background text-secondary"
                        )}
                      >
                        {completed ? <Check className="h-3 w-3" /> : step}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-sm font-semibold", active ? "text-primary" : "text-foreground")}>
                          {point?.title || "Step"}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "text-[0.65rem] font-semibold",
                              completed ? "text-success" : active ? "text-primary" : unlocked ? "text-secondary" : "text-muted-foreground"
                            )}
                          >
                            {completed ? "Completed" : active ? "In progress" : unlocked ? "Unlocked" : "Locked"}
                          </span>
                          {duration ? (
                            <Badge variant="outline" className="px-1.5 py-0 text-[0.6rem]">
                              {duration}
                            </Badge>
                          ) : null}
                        </span>
                      </span>
                    </button>

                    {active && stages.length > 0 ? (
                      <div className="ml-7 mt-1 flex flex-col gap-0.5 border-l border-border pl-3">
                        {stages.map((stage, si) => {
                          const sk = stageProgressKey(projectName, step, si);
                          const stageDone = Boolean(completedStages[sk]);
                          const stageWorking = Boolean(workingStages[sk]) && !stageDone;
                          const stageIsActive = si === activeStageIndex;
                          const stageAccessible = canAccessStage(step, si);
                          const selectable = stageDone || stageWorking || stageAccessible;

                          return (
                            <button
                              key={si}
                              type="button"
                              disabled={!selectable}
                              onClick={() => selectable && onSelectStage?.(step, si)}
                              className={cn(
                                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                                stageIsActive ? "bg-primary/10 text-primary" : "text-secondary hover:bg-muted/50"
                              )}
                            >
                              {stageDone ? (
                                <Check className="h-3 w-3 shrink-0 text-success" />
                              ) : stageWorking ? (
                                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
                              ) : (
                                <Circle className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                              )}
                              <span className="truncate">{stage?.title || "Stage"}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      ) : null}
    </aside>
  );
}
