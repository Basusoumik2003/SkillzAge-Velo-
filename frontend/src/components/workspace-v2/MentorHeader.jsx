"use client";

import { motion } from "framer-motion";
import { Bell, ChevronDown } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export default function MentorHeader({
  navbarProjectTitle,
  isDemoProject,
  navbarStageTitle,
  selectedPoint,
  navbarTotalSteps,
  navbarProgress,
  navbarProgressComplete,
  navbarTimeline,
  navbarTimelineComplete,
  navbarTimelineAlert,
  navbarTimelineNear,
  activeStageMentor,
  stageAgentLabel,
  studentName,
  studentAvatarUrl
}) {
  return (
    <header className="sticky top-0 z-30 flex shrink-0 items-center gap-3 border-b border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <Avatar className="hidden h-9 w-9 border border-border sm:flex">
          {activeStageMentor?.avatar_url ? <AvatarImage src={activeStageMentor.avatar_url} alt="" /> : null}
          <AvatarFallback>{String(activeStageMentor?.name || stageAgentLabel || "M").slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{navbarProjectTitle}</p>
          <p className="truncate text-xs text-secondary">
            {navbarStageTitle}
            {isDemoProject ? (
              <Badge variant="warning" className="ml-2 align-middle text-[0.6rem]">
                Trial
              </Badge>
            ) : null}
          </p>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div
          data-tour="tour-progress"
          className={cn(
            "hidden items-center gap-2 rounded-lg border px-3 py-1.5 md:flex",
            navbarProgressComplete ? "border-success/30 bg-success/10" : "border-border bg-muted/40"
          )}
        >
          <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-secondary">
            Phase {selectedPoint}/{navbarTotalSteps}
          </span>
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-border">
            <motion.div
              className={cn("h-full rounded-full", navbarProgressComplete ? "bg-success" : "bg-primary")}
              initial={false}
              animate={{ width: `${Math.min(100, Math.max(0, navbarProgress))}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
          <span className="text-xs font-bold text-foreground">{navbarProgress}%</span>
        </div>

        {navbarTimeline ? (
          <div
            data-tour="tour-timeline"
            className={cn(
              "hidden items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold md:flex",
              navbarTimelineAlert
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : navbarTimelineNear
                  ? "border-warning/30 bg-warning/10 text-warning"
                  : navbarTimelineComplete
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-primary/20 bg-primary/5 text-primary"
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            <span className="max-w-[10rem] truncate">{navbarTimeline}</span>
          </div>
        ) : null}

        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-background text-secondary transition hover:border-primary/40 hover:text-primary"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-1.5 py-1 pr-2 transition hover:border-primary/40">
              <Avatar className="h-7 w-7">
                {studentAvatarUrl ? <AvatarImage src={studentAvatarUrl} alt="" /> : null}
                <AvatarFallback>{String(studentName || "U").slice(0, 1)}</AvatarFallback>
              </Avatar>
              <ChevronDown className="h-3.5 w-3.5 text-secondary" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="truncate">{studentName}</DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
