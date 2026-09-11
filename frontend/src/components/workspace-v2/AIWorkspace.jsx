"use client";

import { AnimatePresence, motion } from "framer-motion";

import ChatBox from "@/components/ChatBox";

//import ReviewPanel from "@/components/ReviewPanel";
import SystemDesignWorkspace from "@/components/SystemDesignWorkspace";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import PromptComposer from "@/components/workspace-v2/PromptComposer";
import WorkspaceTabs from "@/components/workspace-v2/WorkspaceTabs";
import { cn } from "@/lib/utils";

export default function AIWorkspace(controller) {
  const {
    centerTabs,
    centerMode,
    setCenterMode,
    isDemoProject,
    activeStageMentor,
    stageAgentLabel,
    labelForAgent,
    activeStageAgentKey,
    visibleProjectWorkspaceAgents,
    openAgentChat,
    openSelectedPointStages,
    selectedPoint,
    workspacePoints,
    selectedPointData,
    hasProjectMethodology,
    selectedPointProgress,
    activePhaseDuration,
    activePhaseTimelineLabel,
    activePhaseTimelineTone,
    taskView,
    goBackInTaskFlow,
    goToNextTaskStep,
    canGoBackInTaskFlow,
    activeStageIndex,
    selectedPointStages,
    activeStageData,
    chatServiceAvailable,
    stageConversationMessages,
    sendMessage,
    handleStagePromptAction,
    chatLoading,
    stagePromptAnimating,
    stageDialogThinking,
    activeDialogMessage,
    loadingStageAgentLabel,
    studentName,
    studentAvatarUrl,
    mentorAvatarMap,
    activeStageRequiresDocument,
    activeStageUnlocked,
    activeStageCompleted,
    toast,
    activeStageStatusText,
    activeStageStatusClass,
    requestStageComplete,
    activeStageWorking,
    finalStageActive,
    hasNextPoint,
    projectName,
    catalogProject,
    companyProfileText,
    companyProfileUrl
  } = controller;

  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
        <WorkspaceTabs
          dataTour="tour-tabs"
          tabs={centerTabs}
          activeKey={centerMode}
          onChange={setCenterMode}
        />
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            data-tour="tour-agent"
            type="button"
            onClick={() => {
              if (activeStageMentor) openAgentChat(activeStageMentor);
              setCenterMode("context");
              openSelectedPointStages();
            }}
            className="flex max-w-[13rem] items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-left transition hover:border-primary/40 hover:bg-primary/10"
          >
            <Avatar className="h-7 w-7 border border-primary/20">
              {activeStageMentor?.avatar_url ? <AvatarImage src={activeStageMentor.avatar_url} alt="" /> : null}
              <AvatarFallback>{String(activeStageMentor?.name || stageAgentLabel || "A").slice(0, 1)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0">
              <span className="block truncate text-[0.6rem] font-semibold uppercase tracking-wide text-primary">Responsible</span>
              <span className="block truncate text-xs font-semibold text-foreground">{activeStageMentor?.name || stageAgentLabel}</span>
            </span>
          </button>
          {visibleProjectWorkspaceAgents.map((agent) => (
            <button
              key={agent.id || agent.agent_key || agent.name}
              type="button"
              onClick={() => {
                openAgentChat(agent);
                setCenterMode("context");
                openSelectedPointStages();
              }}
              className="grid h-8 w-8 place-items-center overflow-hidden rounded-full border border-border bg-card transition hover:border-primary/40"
              aria-label={`Chat with ${agent.name}`}
              title={agent.name}
            >
              <Avatar className="h-7 w-7">
                {agent.avatar_url ? <AvatarImage src={agent.avatar_url} alt="" /> : null}
                <AvatarFallback>{String(agent.name || "A").slice(0, 1)}</AvatarFallback>
              </Avatar>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {centerMode === "context" ? (
            <motion.div
              key="context"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="h-full min-h-0"
            >
              {taskView === "about" ? (
                <div className="h-full overflow-auto p-3">
                  <Card className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-secondary">About the phase</p>
                    <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
                      <p className="text-base font-semibold text-foreground">
                        {hasProjectMethodology ? selectedPointData?.title || "" : "No data available"}
                      </p>
                      {hasProjectMethodology ? (
                        <Badge variant="secondary">{`${selectedPointProgress}% of this step`}</Badge>
                      ) : null}
                    </div>
                    {hasProjectMethodology ? (
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{labelForAgent(activeStageAgentKey)}</Badge>
                        <Badge variant="outline">{`Step ${selectedPoint}/${workspacePoints.length}`}</Badge>
                        <Badge variant="outline">{`Stage ${activeStageIndex + 1}/${Math.max(1, selectedPointStages.length)}`}</Badge>
                        {activePhaseDuration ? <Badge variant="outline">{`Timeline: ${activePhaseDuration}`}</Badge> : null}
                        {activePhaseTimelineLabel ? (
                          <Badge className={cn("border", activePhaseTimelineTone)}>{activePhaseTimelineLabel}</Badge>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
                      <Button variant="outline" onClick={goBackInTaskFlow} disabled={!canGoBackInTaskFlow}>
                        Back
                      </Button>
                      <Button onClick={goToNextTaskStep} disabled={!hasProjectMethodology}>
                        Next
                      </Button>
                    </div>
                  </Card>
                </div>
              ) : (
                <div className="flex h-full min-h-0 flex-col overflow-hidden p-2">
                  <div data-tour="tour-chat" className="min-h-0 flex-1 overflow-hidden">
                    <ChatBox
                      className="h-full"
                      compact
                      title={activeStageData?.title || "No data available"}
                      subtitle={chatServiceAvailable ? `${selectedPointProgress}% completed` : "Mentor offline"}
                      offline={!chatServiceAvailable}
                      messages={stageConversationMessages}
                      onSend={(payload) => sendMessage(payload)}
                      onAction={handleStagePromptAction}
                      loading={chatLoading || stagePromptAnimating || stageDialogThinking}
                      dialogMessage={activeDialogMessage}
                      loadingAgentName={loadingStageAgentLabel}
                      userName={studentName}
                      userAvatarUrl={studentAvatarUrl}
                      mentorAvatarUrl={activeStageMentor?.avatar_url || ""}
                      mentorAvatars={mentorAvatarMap}
                      attachmentDisabled={!activeStageRequiresDocument || !activeStageUnlocked || activeStageCompleted}
                      attachmentDisabledReason={
                        !activeStageRequiresDocument
                          ? "This stage does not require a document submission."
                          : activeStageCompleted
                            ? "This stage is already completed."
                            : "Complete the previous stage before submitting a document here."
                      }
                      onAttachmentError={(message) => toast.error(message)}
                    />
                  </div>
                  <PromptComposer>
                    <div
                      data-tour="tour-actions"
                      className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-primary">Status:</span>
                        <Badge className={cn("border", activeStageStatusClass)}>{activeStageStatusText}</Badge>
                       
                        {activePhaseTimelineLabel ? (
                          <Badge className={cn("border", activePhaseTimelineTone)}>{activePhaseTimelineLabel}</Badge>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        {!activeStageCompleted && activeStageUnlocked && activeStageWorking && !activeStageRequiresDocument ? (
                          <Button size="sm" onClick={() => requestStageComplete(selectedPoint, activeStageIndex)}>
                            Completed
                          </Button>
                        ) : null}
                        <Button size="sm" variant="outline" onClick={goBackInTaskFlow} disabled={!canGoBackInTaskFlow}>
                          Back
                        </Button>
                        <Button
                          size="sm"
                          onClick={goToNextTaskStep}
                          disabled={!activeStageCompleted || (finalStageActive && !hasNextPoint)}
                        >
                          {finalStageActive ? (hasNextPoint ? "Go to next phase" : "All phases complete") : "Next stage"}
                        </Button>
                      </div>
                    </div>
                  </PromptComposer>
                </div>
              )}
            </motion.div>
          ) : null}

          {centerMode === "system-design" ? (
            <motion.div
              key="system-design"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="h-full overflow-auto p-2"
            >
              <SystemDesignWorkspace projectName={projectName} />
            </motion.div>
          ) : null}

          {centerMode === "company_profile" ? (
            <motion.div
              key="company_profile"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="h-full overflow-auto p-3"
            >
              <Card className="overflow-hidden">
                <div className="border-b border-border bg-muted/30 px-4 py-4">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-primary">
                    {isDemoProject ? "Trial Context" : "Company Profile"}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-foreground">
                    {String(catalogProject?.title || projectName || "Project")}
                  </h2>
                  <p className="mt-1 max-w-3xl text-xs text-secondary">
                    Review the business background, project overview, and client context before starting the stage work.
                  </p>
                </div>
                <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
                  <article className="min-w-0 rounded-xl border border-border bg-muted/20 p-4">
                    {companyProfileText || companyProfileUrl ? (
                      <div className="space-y-4">
                        {companyProfileText
                          ? String(companyProfileText)
                              .split(/\n{2,}/)
                              .map((paragraph, index) => {
                                const text = paragraph.trim();
                                if (!text) return null;
                                const isShortHeading = text.length <= 90 && !/[.!?]$/.test(text);
                                return isShortHeading ? (
                                  <h3 key={index} className="pt-2 text-xs font-semibold uppercase tracking-wide text-secondary first:pt-0">
                                    {text}
                                  </h3>
                                ) : (
                                  <p key={index} className="whitespace-pre-wrap break-words text-sm leading-6 text-secondary">
                                    {text}
                                  </p>
                                );
                              })
                          : null}
                        {companyProfileUrl ? (
                          <a
                            href={companyProfileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-xs font-semibold text-primary transition hover:bg-primary/10"
                          >
                            Open company overview document
                          </a>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-secondary">No company profile has been added yet.</p>
                    )}
                  </article>
                  <aside className="space-y-3">
                    <Card className="p-4">
                      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-secondary">Current focus</p>
                      <p className="mt-2 text-sm font-semibold text-foreground">{selectedPointData?.title || "Project phase"}</p>
                      <p className="mt-2 text-xs text-secondary">{activeStageData?.title || "Active stage"}</p>
                    </Card>
                    <Card className="border-primary/20 bg-primary/5 p-4">
                      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-primary">Responsible mentor</p>
                      <p className="mt-2 text-sm font-semibold text-foreground">{activeStageMentor?.name || stageAgentLabel}</p>
                      <p className="mt-1 text-xs text-secondary">{labelForAgent(activeStageAgentKey)}</p>
                    </Card>
                    <Card className="p-4">
                      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-secondary">Progress</p>
                      <p className="mt-2 text-2xl font-bold text-foreground">{`${selectedPointProgress}%`}</p>
                      <p className="mt-1 text-xs text-secondary">{`Stage ${activeStageIndex + 1} of ${Math.max(1, selectedPointStages.length)}`}</p>
                    </Card>
                  </aside>
                </div>
              </Card>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}
