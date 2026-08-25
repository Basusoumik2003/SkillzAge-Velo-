"use client";

import { useMemo } from "react";
import { Layers, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { EmptyState, FieldLabel, Panel, inputClass } from "./ui";

export default function PhasesTab({
  journeys,
  viewJourneyId,
  loadJourney,
  phases,
  phaseForm,
  setPhaseForm,
  savePhase,
  editPhase,
  removePhase,
  resetPhase,
  suggestNextPhaseOrder,
  saving,
  loading,
  searchQuery
}) {
  const filteredPhases = useMemo(() => {
    const query = String(searchQuery || "").trim().toLowerCase();
    if (!query) return phases;
    return phases.filter(
      (phase) => phase.phase_name?.toLowerCase().includes(query) || phase.phase_key?.toLowerCase().includes(query)
    );
  }, [phases, searchQuery]);

  return (
    <Panel title="Phases" description="Top-level journey steps, ordered by phase_order." icon={Layers}>
      <label className="mb-6 grid gap-2 sm:max-w-sm">
        <FieldLabel>Viewing journey</FieldLabel>
        <select value={viewJourneyId} onChange={(event) => loadJourney(event.target.value)} className={inputClass}>
          {journeys.map((item) => (
            <option key={item.id} value={item.id}>
              {item.journey_name}
              {item.is_default ? " (default)" : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <form onSubmit={savePhase} className="grid gap-4">
          <label className="grid gap-2">
            <FieldLabel>Journey</FieldLabel>
            <select
              value={phaseForm.journey_id}
              onChange={(event) => {
                const nextJourneyId = event.target.value;
                setPhaseForm((previous) => ({ ...previous, journey_id: nextJourneyId }));
                if (nextJourneyId && !phaseForm.id) {
                  suggestNextPhaseOrder(nextJourneyId);
                }
              }}
              className={inputClass}
            >
              <option value="">Select journey</option>
              {journeys.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.journey_name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <FieldLabel>Phase Key</FieldLabel>
              <input
                value={phaseForm.phase_key}
                onChange={(event) => setPhaseForm({ ...phaseForm, phase_key: event.target.value })}
                placeholder="validation"
                className={inputClass}
              />
            </label>

            <label className="grid gap-2">
              <FieldLabel>Order</FieldLabel>
              <input
                type="number"
                min="1"
                value={phaseForm.phase_order}
                onChange={(event) => setPhaseForm({ ...phaseForm, phase_order: event.target.value })}
                className={inputClass}
              />
            </label>
          </div>

          <label className="grid gap-2">
            <FieldLabel>Phase Name</FieldLabel>
            <input
              value={phaseForm.phase_name}
              onChange={(event) => setPhaseForm({ ...phaseForm, phase_name: event.target.value })}
              placeholder="e.g. Idea Validation"
              className={inputClass}
            />
          </label>

          <label className="grid gap-2">
            <FieldLabel>Description</FieldLabel>
            <textarea
              value={phaseForm.phase_description}
              onChange={(event) => setPhaseForm({ ...phaseForm, phase_description: event.target.value })}
              rows={3}
              className={inputClass}
              placeholder="What this phase covers..."
            />
          </label>

          <label className="grid gap-2">
            <FieldLabel>Objective</FieldLabel>
            <textarea
              value={phaseForm.phase_objective}
              onChange={(event) => setPhaseForm({ ...phaseForm, phase_objective: event.target.value })}
              rows={3}
              className={inputClass}
              placeholder="What the student should achieve..."
            />
          </label>

          <label className="grid gap-2">
            <FieldLabel>Intended Audience</FieldLabel>
            <input
              value={phaseForm.intended_audience}
              onChange={(event) => setPhaseForm({ ...phaseForm, intended_audience: event.target.value })}
              placeholder="e.g. first-time founders"
              className={inputClass}
            />
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(phaseForm.is_active)}
              onChange={(event) => setPhaseForm({ ...phaseForm, is_active: event.target.checked })}
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
              {phaseForm.id ? "Update Phase" : "Create Phase"}
            </button>

            <button
              type="button"
              onClick={resetPhase}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Reset
            </button>
          </div>
        </form>

        <div className="space-y-3 xl:border-l xl:border-slate-100 xl:pl-6">
          {loading ? (
            <p className="text-sm font-semibold text-slate-500">Loading phases...</p>
          ) : filteredPhases.length ? (
            filteredPhases.map((phase) => (
              <div key={phase.id} className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-black text-slate-950">{phase.phase_name}</p>
                      {!phase.is_active ? (
                        <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-600">
                          Inactive
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {phase.phase_key} &middot; order {phase.phase_order}
                    </p>
                    {phase.phase_description || phase.phase_objective ? (
                      <p className="mt-2 text-sm font-medium text-slate-600">
                        {phase.phase_description || phase.phase_objective}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => editPhase(phase)}
                      className="rounded-full border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-100"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removePhase(phase)}
                      className="rounded-full border border-rose-200 bg-white p-2 text-rose-600 transition hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <EmptyState>
              {phases.length ? "No phases match your search." : "No phases yet — create the first one above."}
            </EmptyState>
          )}
        </div>
      </div>
    </Panel>
  );
}
