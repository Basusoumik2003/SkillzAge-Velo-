"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, Lock, Send, User2 } from "lucide-react";

import StageDeliverablesPanel from "@/components/deliverables/StageDeliverablesPanel";
import useStartupWorkspaceController from "./useStartupWorkspaceController";

// The workspace page for journeys built in /adminJourney (journeys →
// journey_phases → journey_stages → stage_deliverables). Pulls everything
// from Backend/adminService's /startup/workspace + /startup/query
// (see useStartupWorkspaceController.js) - separate from the older,
// generic project workspace at /workspace, which is unrelated to this
// journey system.
export default function StartupJourneyWorkspacePage() {
  const router = useRouter();
  const controller = useStartupWorkspaceController();
  const {
    ready,
    loading,
    workspace,
    selectedPhase,
    setSelectedPhaseId,
    selectedStage,
    setSelectedStageId,
    question,
    setQuestion,
    sendQuestion,
    sending,
    messages,
    error
  } = controller;

  const [phaseCollapsed, setPhaseCollapsed] = useState({});

  if (!ready || loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your journey...
        </div>
      </main>
    );
  }

  const journey = Array.isArray(workspace.journey) ? workspace.journey : [];

  const handleAsk = async (event) => {
    event.preventDefault();
    if (!question.trim() || sending) return;
    try {
      await sendQuestion(question);
    } catch {
      // error already surfaced via controller.error
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px]">
        {/* Phase / stage sidebar */}
        <aside className="w-72 shrink-0 border-r border-slate-200 bg-white p-4">
          <button
            type="button"
            onClick={() => router.push("/workspace")}
            className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Workspace
          </button>

          <h1 className="text-3xl font-black text-slate-950">
            {workspace.journey_info?.journey_name || workspace.journey_name || "Startup Journey"}
          </h1>

          <p className="mt-2 text-sm font-semibold text-slate-500">
            {workspace.journey_info?.journey_description || workspace.journey_description || ""}
          </p>

          <p className="mb-3 mt-4 text-xs font-black uppercase tracking-wide text-slate-400">Journey</p>

          {journey.length ? (
            <div className="grid gap-2">
              {journey.map((phase) => {
                const isActivePhase = selectedPhase?.id === phase.id;
                const isCollapsed = phaseCollapsed[phase.id] && !isActivePhase;
                return (
                  <div key={phase.id} className="rounded-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPhaseId(phase.id);
                        setPhaseCollapsed((prev) => ({ ...prev, [phase.id]: false }));
                      }}
                      className={`w-full rounded-xl px-3 py-2 text-left text-sm font-black ${
                        isActivePhase ? "bg-orange-50 text-orange-700" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {phase.phase_name}
                    </button>

                    {isActivePhase && !isCollapsed ? (
                      <div className="mt-1 grid gap-1 border-l border-slate-100 pl-3">
                        {/* is_unlocked/is_completed come from the gating computed server-side
                            in Backend/adminService/src/routes/startupRoutes.js (annotateJourneyProgress) -
                            a locked stage can't be selected until its predecessor's required
                            deliverables are approved. */}
                        {(phase.stages || []).map((stage) => {
                          const isLocked = stage.is_unlocked === false;
                          return (
                            <button
                              key={stage.id}
                              type="button"
                              disabled={isLocked}
                              title={isLocked ? "Complete the previous stage's required deliverables first." : undefined}
                              onClick={() => setSelectedStageId(stage.id)}
                              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-bold ${
                                selectedStage?.id === stage.id
                                  ? "bg-slate-950 text-white"
                                  : isLocked
                                    ? "cursor-not-allowed text-slate-300"
                                    : "text-slate-500 hover:bg-slate-50"
                              }`}
                            >
                              {isLocked ? (
                                <Lock className="h-3 w-3 shrink-0" />
                              ) : stage.is_completed ? (
                                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                              ) : null}
                              <span className="truncate">{stage.stage_name}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs font-semibold text-slate-400">
              No journey is assigned yet - check back once an admin publishes one.
            </p>
          )}
        </aside>

        {/* Main content */}
        <section className="flex-1 min-w-0 p-6">
          {error ? (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {error}
            </div>
          ) : null}

          {selectedStage ? (
            <>
              <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-[1.75rem] border border-slate-200 bg-white p-6">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-orange-500">
                    {selectedPhase?.phase_name}
                  </p>
                  <h1 className="mt-1 text-2xl font-black text-slate-950">{selectedStage.stage_name}</h1>
                  {selectedStage.stage_objective ? (
                    <p className="mt-2 text-sm text-slate-500">
                      <span className="font-black text-slate-700">Objective: </span>
                      {selectedStage.stage_objective}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-orange-100 text-orange-600">
                    <User2 className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Mentor</p>
                    <p className="text-sm font-black text-slate-800">
                      {selectedStage.mentor_name || "No mentor assigned"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Deliverables for this stage - reuses the component built for
                  the Deliverable Management System. */}
              <div className="mb-6">
                <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Deliverables</h2>
                <StageDeliverablesPanel stageId={selectedStage.id} />
              </div>

              {/* Mentor chat */}
              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6">
                <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Ask your mentor</h2>

                <div className="mb-4 grid max-h-80 gap-3 overflow-y-auto">
                  {messages.length ? (
                    messages.map((message, index) => (
                      <div
                        key={index}
                        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm font-medium ${
                          message.role === "user"
                            ? "ml-auto bg-slate-950 text-white"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {message.content}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm font-semibold text-slate-400">
                      Ask a question about this stage to get started.
                    </p>
                  )}
                </div>

                <form onSubmit={handleAsk} className="flex items-center gap-3">
                  <input
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="Ask your mentor about this stage..."
                    className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-400"
                  />
                  <button
                    type="submit"
                    disabled={sending || !question.trim()}
                    className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Ask
                  </button>
                </form>
              </div>
            </>
          ) : (
            <p className="text-sm font-semibold text-slate-400">
              Select a phase and stage from the left to get started.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
