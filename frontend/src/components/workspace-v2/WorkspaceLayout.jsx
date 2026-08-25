"use client";

import { useRef } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import AIWorkspace from "@/components/workspace-v2/AIWorkspace";
import AssetsPanel from "@/components/workspace-v2/AssetsPanel";
import MentorHeader from "@/components/workspace-v2/MentorHeader";
import PhaseSidebar from "@/components/workspace-v2/PhaseSidebar";
import SourcesPanel from "@/components/workspace-v2/SourcesPanel";

const PHASES_DEFAULT_SIZE = 18;
const PHASES_COLLAPSED_SIZE = 4;
const AI_WORKSPACE_MIN_SIZE = 32;

function ResizeHandle() {
  return (
    <PanelResizeHandle className="group relative w-px shrink-0 bg-border transition-colors hover:bg-primary/40 focus-visible:outline-none">
      <span className="absolute inset-y-0 -left-1 -right-1" />
    </PanelResizeHandle>
  );
}

export default function WorkspaceLayout(controller) {
  const { phaseListOpen, setPhaseListOpen } = controller;
  const phasesPanelRef = useRef(null);
  const aiWorkspacePanelRef = useRef(null);
  const phasesExpandedSizeRef = useRef(PHASES_DEFAULT_SIZE);

  const togglePhases = () => {
    const phasesPanel = phasesPanelRef.current;
    const aiPanel = aiWorkspacePanelRef.current;

    if (!phasesPanel || !aiPanel) {
      setPhaseListOpen((open) => !open);
      return;
    }

    if (phaseListOpen) {
      // Collapsing: hand the freed width over to the Tasks panel.
      const currentSize = phasesPanel.getSize();
      phasesExpandedSizeRef.current = currentSize;
      const freedSize = Math.max(0, currentSize - PHASES_COLLAPSED_SIZE);
      phasesPanel.resize(PHASES_COLLAPSED_SIZE);
      aiPanel.resize(aiPanel.getSize() + freedSize);
    } else {
      // Expanding: take that width back from the Tasks panel.
      const restoredSize = phasesExpandedSizeRef.current || PHASES_DEFAULT_SIZE;
      const freedSize = Math.max(0, restoredSize - PHASES_COLLAPSED_SIZE);
      aiPanel.resize(Math.max(AI_WORKSPACE_MIN_SIZE, aiPanel.getSize() - freedSize));
      phasesPanel.resize(restoredSize);
    }

    setPhaseListOpen((open) => !open);
  };

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background">
      <MentorHeader {...controller} />

      <div className="min-h-0 flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" className="h-full">
          <Panel
            id="phases"
            ref={phasesPanelRef}
            order={1}
            collapsible
            collapsedSize={PHASES_COLLAPSED_SIZE}
            minSize={12}
            defaultSize={PHASES_DEFAULT_SIZE}
            maxSize={26}
            onCollapse={() => setPhaseListOpen(false)}
            onExpand={() => setPhaseListOpen(true)}
            className="hidden lg:block"
          >
            <PhaseSidebar
              open={phaseListOpen}
              onToggle={togglePhases}
              workspacePoints={controller.workspacePoints}
              hasProjectMethodology={controller.hasProjectMethodology}
              selectedPoint={controller.selectedPoint}
              activeStageIndex={controller.activeStageIndex}
              canSelectPoint={controller.canSelectPoint}
              isPointCompleted={controller.isPointCompleted}
              progressForPoint={controller.progressForPoint}
              canAccessStage={controller.canAccessStage}
              completedStages={controller.completedStages}
              workingStages={controller.workingStages}
              stageProgressKey={controller.stageProgressKey}
              projectName={controller.projectName}
              formatPhaseDuration={controller.formatPhaseDuration}
              toast={controller.toast}
              onSelectPoint={(point) => {
                controller.setSelectedPoint(point);
                controller.setCenterMode("context");
              }}
              onSelectStage={(step, stageIndex) => {
                controller.setSelectedStageByStep((prev) => ({ ...prev, [step]: stageIndex }));
                controller.setCenterMode("context");
              }}
            />
          </Panel>

          <ResizeHandle />

          <Panel id="ai-workspace" ref={aiWorkspacePanelRef} order={2} minSize={AI_WORKSPACE_MIN_SIZE} defaultSize={48}>
            <AIWorkspace {...controller} />
          </Panel>

          <ResizeHandle />

          <Panel id="sources" order={3} minSize={14} defaultSize={17} maxSize={26} collapsible collapsedSize={0} className="hidden xl:block">
           <SourcesPanel
  selectedPointData={controller.selectedPointData}
  activeStageData={controller.activeStageData}
  catalogProject={controller.catalogProject}
  projectName={controller.projectName}
/>
          </Panel>

          <ResizeHandle />

          <Panel id="assets" order={4} minSize={14} defaultSize={17} maxSize={26} collapsible collapsedSize={0} className="hidden xl:block">
            <AssetsPanel
              stageDocuments={controller.stageDocuments}
              catalogProject={controller.catalogProject}
              projectName={controller.projectName}
              stageProgressKey={controller.stageProgressKey}
            />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
