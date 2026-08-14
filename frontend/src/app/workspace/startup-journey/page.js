"use client";

import { useMemo } from "react";
import { Loader2, Send, Sparkles, BrainCircuit, MapPin, Languages, Clock3, FileText, Link2 } from "lucide-react";
import useStartupWorkspaceController from "./useStartupWorkspaceController";

function SectionCard({ title, children, className = "" }) {
  return (
    <section className={`rounded-3xl border border-white/60 bg-white/90 p-5 shadow-[0_24px_70px_-52px_rgba(15,23,42,0.35)] backdrop-blur ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Bubble({ role, content }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[88%] rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm ${isUser ? "bg-slate-950 text-white" : "bg-orange-50 text-slate-800 border border-orange-100"}`}>
        <pre className="whitespace-pre-wrap font-sans">{content}</pre>
      </div>
    </div>
  );
}

export default function StartupJourneyWorkspacePage() {
  const controller = useStartupWorkspaceController();
  const {
    ready,
    loading,
    savingProfile,
    sending,
    workspace,
    profileDraft,
    updateProfileField,
    saveProfile,
    selectedPhase,
    setSelectedPhaseId,
    selectedStage,
    setSelectedStageId,
    question,
    setQuestion,
    sendQuestion,
    messages,
    browserQueries,
    answer,
    error,
    contextSummary,
    stageDocuments
  } = controller;

  const phases = workspace.journey || [];

  const ideaLabel = useMemo(() => {
    if (profileDraft.idea_title) return profileDraft.idea_title;
    const idea = workspace.profile?.idea_title || workspace.profile?.current_idea_text || "";
    return idea || "No idea captured yet";
  }, [profileDraft.idea_title, workspace.profile]);

  if (!ready || loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,rgba(255,127,41,0.18),transparent_30%),linear-gradient(135deg,#fffaf4_0%,#fffdf9_50%,#fff2e1_100%)] px-4">
        <div className="flex items-center gap-3 rounded-full border border-white/70 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-[0_18px_60px_-34px_rgba(15,23,42,0.45)]">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading startup workspace...
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(255,127,41,0.18),transparent_30%),linear-gradient(135deg,#fffaf4_0%,#fffdf9_50%,#fff2e1_100%)] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <header className="rounded-[2rem] border border-white/70 bg-white/85 px-5 py-4 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.38)] backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[10px] font-black uppercase tracking-[0.36em] text-orange-500">Startup Journey Workspace</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                Profile-aware guidance for students and young founders.
              </h1>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                The workspace uses your profile, current stage, memory, and stage documents to answer open-ended startup questions.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Stage</p>
                <p className="mt-1 truncate text-sm font-bold text-slate-900">{selectedStage?.stage_name || "No stage"}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Idea</p>
                <p className="mt-1 truncate text-sm font-bold text-slate-900">{ideaLabel}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Sources</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{contextSummary.docs + contextSummary.sources}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Memory</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{contextSummary.memories}</p>
              </div>
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="grid flex-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)_360px]">
          <SectionCard title="Phases">
            <div className="space-y-2">
              {phases.map((phase) => {
                const isSelected = Number(phase.id) === Number(selectedPhase?.id);
                return (
                  <button
                    key={phase.id}
                    type="button"
                    onClick={() => {
                      setSelectedPhaseId(phase.id);
                      setSelectedStageId(phase.stages?.[0]?.id || null);
                    }}
                    className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                      isSelected ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-950">{phase.phase_name}</p>
                        <p className="mt-1 line-clamp-2 text-xs font-medium text-slate-500">{phase.phase_description || phase.phase_objective}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">
                        {phase.stages?.length || 0}
                      </span>
                    </div>
                  </button>
                );
              })}
              {!phases.length ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  No phases found yet. Ask an admin to seed the journey.
                </div>
              ) : null}
            </div>

            <div className="mt-5 border-t border-slate-200 pt-4">
              <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Stages</p>
              <div className="space-y-2">
                {(selectedPhase?.stages || []).map((stage) => {
                  const isSelected = Number(stage.id) === Number(selectedStage?.id);
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => setSelectedStageId(stage.id)}
                      className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                        isSelected ? "border-slate-900 bg-slate-950 text-white" : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <p className="text-sm font-bold">{stage.stage_name}</p>
                      <p className={`mt-1 text-xs ${isSelected ? "text-white/75" : "text-slate-500"}`}>{stage.stage_context || stage.expected_outcome || "Startup guidance stage"}</p>
                    </button>
                  );
                })}
                {!selectedPhase?.stages?.length ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    Pick a phase to see its stages.
                  </div>
                ) : null}
              </div>
            </div>
          </SectionCard>

          <div className="flex min-h-0 flex-col gap-5">
            <SectionCard title="Ask Anything" className="flex min-h-0 flex-1 flex-col">
              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-orange-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  {selectedPhase?.phase_name || "Startup phase"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
                  <BrainCircuit className="h-3.5 w-3.5" />
                  {selectedStage?.stage_name || "Current stage"}
                </span>
              </div>

              <div className="min-h-[380px] flex-1 space-y-3 overflow-auto rounded-3xl border border-slate-200 bg-slate-50 p-4">
                {messages.length ? (
                  messages.map((message, index) => <Bubble key={`${message.role}-${index}`} role={message.role} content={message.content} />)
                ) : (
                  <div className="grid h-full place-items-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
                    Ask a market, validation, pitch, or research question to start the conversation.
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-3">
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Ask anything about this phase or stage..."
                  rows={4}
                  className="w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-orange-300"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1"><MapPin className="h-3.5 w-3.5" />{profileDraft.country || "No country"}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1"><Clock3 className="h-3.5 w-3.5" />{profileDraft.available_time_hours_per_week || 0} hrs/week</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1"><Languages className="h-3.5 w-3.5" />{profileDraft.preferred_language || "english"}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => sendQuestion()}
                    disabled={sending || !question.trim()}
                    className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send
                  </button>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Evidence & Answer">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Draft answer</p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {answer || "Your answer will appear here after you ask a question."}
                  </p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Browser search queries</p>
                  <div className="mt-3 space-y-2">
                    {browserQueries.length ? (
                      browserQueries.map((item, index) => (
                        <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          {item}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">Queries will be generated from the stage context.</p>
                    )}
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Reference Documents">
              <div className="grid gap-2">
                {stageDocuments.length ? (
                  stageDocuments.map((doc) => (
                    <div key={doc.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-start gap-2.5">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">{doc.title}</p>
                          {doc.source_url ? (
                            <a
                              href={doc.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:underline"
                            >
                              <Link2 className="h-3 w-3" />
                              Open link
                            </a>
                          ) : doc.content_text ? (
                            <p className="mt-1 line-clamp-2 text-xs text-slate-500">{doc.content_text}</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    No reference documents for this stage yet.
                  </div>
                )}
              </div>
            </SectionCard>
          </div>

          <div className="flex min-h-0 flex-col gap-5">
            <SectionCard title="Student Profile">
              <div className="grid gap-3">
                {[
                  ["age", "Age"],
                  ["education_level", "Education"],
                  ["location_text", "Location"],
                  ["country", "Country"],
                  ["state_region", "State / Region"],
                  ["city", "City"],
                  ["skills", "Skills"],
                  ["interests", "Interests"],
                  ["available_time_hours_per_week", "Hours / Week"],
                  ["available_resources", "Resources"],
                  ["current_idea_text", "Idea / Problem"],
                  ["profile_summary", "Profile Summary"]
                ].map(([field, label]) => (
                  <label key={field} className="grid gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</span>
                    <input
                      value={profileDraft[field]}
                      onChange={(event) => updateProfileField(field, event.target.value)}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-orange-300"
                    />
                  </label>
                ))}

                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Stage</span>
                    <select
                      value={profileDraft.startup_stage}
                      onChange={(event) => updateProfileField("startup_stage", event.target.value)}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-orange-300"
                    >
                      {["no_idea", "idea", "validation", "prototype", "early_business", "growth"].map((item) => (
                        <option key={item} value={item}>{item.replaceAll("_", " ")}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Goal</span>
                    <select
                      value={profileDraft.goal_type}
                      onChange={(event) => updateProfileField("goal_type", event.target.value)}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-orange-300"
                    >
                      {["social", "environmental", "commercial", "technology"].map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Language</span>
                    <select
                      value={profileDraft.preferred_language}
                      onChange={(event) => updateProfileField("preferred_language", event.target.value)}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-orange-300"
                    >
                      {["english", "hindi", "bengali", "multilingual"].map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Mode</span>
                    <select
                      value={profileDraft.participation_mode}
                      onChange={(event) => updateProfileField("participation_mode", event.target.value)}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-orange-300"
                    >
                      {["individual", "team", "either"].map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="grid gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Problem Statement</span>
                  <textarea
                    value={profileDraft.problem_statement}
                    onChange={(event) => updateProfileField("problem_statement", event.target.value)}
                    rows={3}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-orange-300"
                  />
                </label>

                <label className="grid gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Solution Summary</span>
                  <textarea
                    value={profileDraft.solution_summary}
                    onChange={(event) => updateProfileField("solution_summary", event.target.value)}
                    rows={3}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-orange-300"
                  />
                </label>

                <label className="grid gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Target Users</span>
                  <textarea
                    value={profileDraft.target_users}
                    onChange={(event) => updateProfileField("target_users", event.target.value)}
                    rows={2}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-orange-300"
                  />
                </label>

                <label className="grid gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Industry Tags</span>
                  <textarea
                    value={profileDraft.industry_tags}
                    onChange={(event) => updateProfileField("industry_tags", event.target.value)}
                    rows={2}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-orange-300"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => saveProfile()}
                  disabled={savingProfile}
                  className="mt-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-4 py-3 text-sm font-black text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save Profile
                </button>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </main>
  );
}
