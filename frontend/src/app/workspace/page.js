"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import DisclaimerModal from "@/components/DisclaimerModal";
import SpotlightTour from "@/components/SpotlightTour";
import WelcomeModal from "@/components/WelcomeModal";
import WorkspaceLayout from "@/components/workspace-v2/WorkspaceLayout";
import useWorkspaceController from "./useWorkspaceController";

function WorkspaceContent() {
  const controller = useWorkspaceController();
  const {
    ready,
    loading,
    workspaceError,
    workspaceClosed,
    showDisclaimer,
    handleDisclaimerAccept,
    showTour,
    completeTour,
    showWelcome,
    setShowWelcome,
    studentName,
    isDemoProject
  } = controller;

  if (!ready || loading) {
    return (
      <div className="grid h-screen place-items-center bg-background">
        <div className="flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Loading your workspace...
        </div>
      </div>
    );
  }

  if (workspaceError) {
    return (
      <div className="grid h-screen place-items-center bg-background px-4">
        <div className="max-w-md rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-5 text-center text-sm font-semibold text-destructive">
          {workspaceError}
        </div>
      </div>
    );
  }

  if (workspaceClosed?.closed) {
    return (
      <div className="grid h-screen place-items-center bg-background px-4">
        <div className="max-w-md rounded-2xl border border-border bg-card px-6 py-5 text-center text-sm font-semibold text-foreground">
          {workspaceClosed.message || "This workspace is currently closed."}
        </div>
      </div>
    );
  }

  return (
    <>
      <WorkspaceLayout {...controller} />
      {showDisclaimer ? <DisclaimerModal onAccept={handleDisclaimerAccept} /> : null}
      {showTour ? <SpotlightTour onComplete={completeTour} /> : null}
      {showWelcome ? (
        <WelcomeModal userName={studentName} isDemoProject={isDemoProject} onClose={() => setShowWelcome(false)} />
      ) : null}
    </>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="grid h-screen place-items-center bg-background text-sm text-muted-foreground">
          Loading workspace...
        </div>
      }
    >
      <WorkspaceContent />
    </Suspense>
  );
}
