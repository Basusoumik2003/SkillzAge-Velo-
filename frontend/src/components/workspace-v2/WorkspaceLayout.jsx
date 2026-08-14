"use client";

import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import AIWorkspace from "@/components/workspace-v2/AIWorkspace";
import AssetsPanel from "@/components/workspace-v2/AssetsPanel";
import MentorHeader from "@/components/workspace-v2/MentorHeader";
import PhaseSidebar from "@/components/workspace-v2/PhaseSidebar";
import SourcesPanel from "@/components/workspace-v2/SourcesPanel";

function ResizeHandle() {
  return (
    <PanelResizeHandle className="group relative w-px shrink-0 bg-border transition-colors hover:bg-primary/40 focus-visible:outline-none">
      <span className="absolute inset-y-0 -left-1 -right-1" />
    </PanelResizeHandle>
  );
}

export default function WorkspaceLayout(controller) {
  const { phaseListOpen, setPhaseListOpen } = controller;

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background">
      <MentorHeader {...controller} />

      <div className="min-h-0 flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" className="h-full">
          <Panel
            id="phases"
            order={1}
            collapsible
            collapsedSize={4}
            minSize={12}
            defaultSize={18}
            maxSize={26}
            onCollapse={() => setPhaseListOpen(false)}
            onExpand={() => setPhaseListOpen(true)}
            className="hidden lg:block"
          >
            <PhaseSidebar
              open={phaseListOpen}
              onToggle={() => setPhaseListOpen((open) => !open)}
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

          <Panel id="ai-workspace" order={2} minSize={32} defaultSize={48}>
            <AIWorkspace {...controller} />
          </Panel>

          <ResizeHandle />

          <Panel id="sources" order={3} minSize={14} defaultSize={18} maxSize={28} collapsible collapsedSize={0} className="hidden xl:block">
            <SourcesPanel selectedPointData={controller.selectedPointData} activeStageData={controller.activeStageData} />
          </Panel>

          <ResizeHandle />

          <Panel id="assets" order={4} minSize={12} defaultSize={16} maxSize={24} collapsible collapsedSize={0} className="hidden xl:block">
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
