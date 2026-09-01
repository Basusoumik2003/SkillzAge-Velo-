"use client";

import { useMemo } from "react";
import { ListChecks, Loader2, Lock, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { EmptyState, FieldLabel, Panel, inputClass } from "./ui";
import StageDeliverablesEditor from "./StageDeliverablesEditor";

export default function StagesTab({
  phases,
  stages,
  mentors,
  stageForm,
  setStageForm,
  saveStage,
  editStage,
  removeStage,
  resetStage,
  saving,
  loading,
  searchQuery
}) {
  const filteredStages = useMemo(() => {
    const query = String(searchQuery || "").trim().toLowerCase();
    if (!query) return stages;
    return stages.filter(
      (stage) => stage.stage_name?.toLowerCase().includes(query) || stage.stage_key?.toLowerCase().includes(query)
    );
  }, [stages, searchQuery]);

  return (
    <Panel title="Stages" description="Ordered steps within a phase, shown to students one at a time." icon={ListChecks}>
      <form onSubmit={saveStage} className="grid gap-4">
        <label className="grid gap-2">
          <FieldLabel>Phase</FieldLabel>
          <select
            value={stageForm.phase_id}
            onChange={(event) => setStageForm({ ...stageForm, phase_id: event.target.value })}
            className={inputClass}
          >
            <option value="">Select phase</option>
            {phases.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phase.phase_name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2">
          <FieldLabel>Responsible Mentor</FieldLabel>
          <select
            value={stageForm.mentor_id}
            onChange={(event) => setStageForm({ ...stageForm, mentor_id: event.target.value })}
            className={inputClass}
          >
            <option value="">Select mentor</option>
            {mentors.map((mentor) => (
              <option key={mentor.id} value={mentor.id}>
                {mentor.mentor_name || mentor.name}
                {mentor.role ? ` — ${mentor.role}` : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <FieldLabel>Stage Key</FieldLabel>
            <input
              value={stageForm.stage_key}
              onChange={(event) => setStageForm({ ...stageForm, stage_key: event.target.value })}
              placeholder="define_problem"
              className={inputClass}
            />
          </label>

          <label className="grid gap-2">
            <FieldLabel>Order</FieldLabel>
            <input
              type="number"
              min="1"
              value={stageForm.stage_order}
              onChange={(event) => setStageForm({ ...stageForm, stage_order: event.target.value })}
              className={inputClass}
            />
          </label>
        </div>

        <label className="grid gap-2">
          <FieldLabel>Stage Name</FieldLabel>
          <input
            value={stageForm.stage_name}
            onChange={(event) => setStageForm({ ...stageForm, stage_name: event.target.value })}
            placeholder="e.g. Define the problem"
            className={inputClass}
          />
        </label>

        <label className="grid gap-2">
          <FieldLabel>Context</FieldLabel>
          <textarea
            value={stageForm.stage_context}
            onChange={(event) => setStageForm({ ...stageForm, stage_context: event.target.value })}
            rows={3}
            className={inputClass}
            placeholder="Background the AI mentor should know..."
          />
        </label>

        <label className="grid gap-2">
          <FieldLabel>Objective</FieldLabel>
          <textarea
            value={stageForm.stage_objective}
            onChange={(event) => setStageForm({ ...stageForm, stage_objective: event.target.value })}
            rows={2}
            className={inputClass}
          />
        </label>

        <label className="grid gap-2">
          <FieldLabel>Expected Outcome</FieldLabel>
          <textarea
            value={stageForm.expected_outcome}
            onChange={(event) => setStageForm({ ...stageForm, expected_outcome: event.target.value })}
            rows={2}
            className={inputClass}
          />
        </label>

        <label className="grid gap-2">
          <FieldLabel>Readiness Criteria</FieldLabel>
          <textarea
            value={stageForm.readiness_criteria}
            onChange={(event) => setStageForm({ ...stageForm, readiness_criteria: event.target.value })}
            rows={2}
            className={inputClass}
          />
        </label>

        <label className="grid gap-2">
          <FieldLabel>Recommended Actions</FieldLabel>
          <textarea
            value={stageForm.recommended_actions}
            onChange={(event) => setStageForm({ ...stageForm, recommended_actions: event.target.value })}
            rows={2}
            className={inputClass}
          />
        </label>

        <label className="grid gap-2 rounded-2xl border border-orange-100 bg-orange-50/60 p-4">
          <span className="flex items-center gap-1.5 text-sm font-black uppercase tracking-[0.08em] text-orange-700">
            <Search className="h-3.5 w-3.5" />
            Search Focus
          </span>
          <textarea
            value={stageForm.search_focus}
            onChange={(event) => setStageForm({ ...stageForm, search_focus: event.target.value })}
            rows={2}
            className={inputClass}
            placeholder="e.g. India D2C market size, competitor pricing, customer acquisition cost benchmarks"
          />
          <p className="text-xs font-semibold text-orange-700/80">
            Topics/keywords the AI mentor should search the web for the moment a student enters this stage —
            combined automatically with this stage's context, its phase, and the student's own idea. Runs once per
            student per stage, independent of what they type in chat.
          </p>
        </label>

        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <label className="flex items-center gap-3 text-sm font-black text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(stageForm.requires_deliverables)}
              onChange={(event) => setStageForm({ ...stageForm, requires_deliverables: event.target.checked })}
              className="h-4 w-4"
            />
            <Lock className="h-3.5 w-3.5 text-slate-500" />
            Docs required to advance to the next stage
          </label>
          <p className="text-xs font-semibold text-slate-500">
            When checked, a student can't move past this stage until every required deliverable below has an
            approved submission scoring at or above the pass threshold. When unchecked, this stage never blocks
            progress, no matter what's submitted.
          </p>

          {stageForm.requires_deliverables ? (
            <label className="grid max-w-xs gap-2 pt-1">
              <FieldLabel>Pass Score Threshold (%)</FieldLabel>
              <input
                type="number"
                min="0"
                max="100"
                value={stageForm.pass_score_threshold}
                onChange={(event) => setStageForm({ ...stageForm, pass_score_threshold: event.target.value })}
                className={inputClass}
              />
            </label>
          ) : null}
        </div>

        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(stageForm.is_active)}
            onChange={(event) => setStageForm({ ...stageForm, is_active: event.target.checked })}
            className="h-4 w-4"
          />
          Active
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-[0_14px_30px_-16px_rgba(15,23,42,0.8)] transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {stageForm.id ? "Update Stage" : "Create Stage"}
          </button>

          <button
            type="button"
            onClick={resetStage}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            Reset
          </button>
        </div>
      </form>

      <div className="mt-6 border-t border-slate-100 pt-6">
        <StageDeliverablesEditor stageId={stageForm.id} />
      </div>

      <div className="mt-6 space-y-3 border-t border-slate-100 pt-6">
        {loading ? (
          <p className="text-sm font-semibold text-slate-500">Loading stages...</p>
        ) : filteredStages.length ? (
          filteredStages.map((stage) => {
            const mentor =
              mentors.find(
                (item) => String(item.agent_key || "").trim() === String(stage.mentor_agent_key || "").trim()
              ) || mentors.find((item) => Number(item.id) === Number(stage.mentor_id));

            return (
              <div key={stage.id} className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-black text-slate-950">{stage.stage_name}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {stage.phase_name} &middot; {stage.stage_key} &middot; order {stage.stage_order}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-orange-600">
                      Mentor: {mentor?.mentor_name || mentor?.name || "No mentor assigned"}
                    </p>
                    {stage.stage_context || stage.expected_outcome ? (
                      <p className="mt-2 text-sm font-medium text-slate-600">
                        {stage.stage_context || stage.expected_outcome}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => editStage(stage)}
                      className="rounded-full border border-slate-200 bg-white p-2"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStage(stage)}
                      className="rounded-full border border-rose-200 bg-white p-2 text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState>{stages.length ? "No stages match your search." : "No stages yet."}</EmptyState>
        )}
      </div>
    </Panel>
  );
}
