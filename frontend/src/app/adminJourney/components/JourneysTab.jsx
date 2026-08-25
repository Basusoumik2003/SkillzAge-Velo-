"use client";

import { useMemo } from "react";
import { Flag, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { EmptyState, FieldLabel, Panel, inputClass } from "./ui";

export default function JourneysTab({
  journeys,
  journeyForm,
  setJourneyForm,
  saveJourney,
  editJourney,
  removeJourney,
  resetJourney,
  saving,
  searchQuery
}) {
  const filteredJourneys = useMemo(() => {
    const query = String(searchQuery || "").trim().toLowerCase();
    if (!query) return journeys;
    return journeys.filter(
      (item) =>
        item.journey_name?.toLowerCase().includes(query) || item.journey_key?.toLowerCase().includes(query)
    );
  }, [journeys, searchQuery]);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
      <Panel
        title={journeyForm.id ? "Edit Journey" : "Create Journey"}
        description="A reusable, top-level startup program."
        icon={Flag}
      >
        <form onSubmit={saveJourney} className="grid gap-4">
          <label className="grid gap-2">
            <FieldLabel>Journey Name</FieldLabel>
            <input
              className={inputClass}
              placeholder="e.g. AI SaaS Builder"
              value={journeyForm.journey_name}
              onChange={(e) => setJourneyForm({ ...journeyForm, journey_name: e.target.value })}
            />
          </label>

          <label className="grid gap-2">
            <FieldLabel>Journey Key</FieldLabel>
            <input
              className={inputClass}
              placeholder="ai_saas_builder"
              value={journeyForm.journey_key}
              onChange={(e) => setJourneyForm({ ...journeyForm, journey_key: e.target.value })}
            />
          </label>

          <label className="grid gap-2">
            <FieldLabel>Description</FieldLabel>
            <textarea
              className={inputClass}
              rows={3}
              placeholder="What this journey covers..."
              value={journeyForm.journey_description}
              onChange={(e) => setJourneyForm({ ...journeyForm, journey_description: e.target.value })}
            />
          </label>

          <label className="grid gap-2">
            <FieldLabel>Objective</FieldLabel>
            <textarea
              className={inputClass}
              rows={3}
              placeholder="What the student should achieve..."
              value={journeyForm.journey_objective}
              onChange={(e) => setJourneyForm({ ...journeyForm, journey_objective: e.target.value })}
            />
          </label>

          <label className="grid gap-2">
            <FieldLabel>Intended Audience</FieldLabel>
            <textarea
              className={inputClass}
              rows={2}
              placeholder="e.g. first-time founders"
              value={journeyForm.intended_audience}
              onChange={(e) => setJourneyForm({ ...journeyForm, intended_audience: e.target.value })}
            />
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
            <input
              type="checkbox"
              checked={journeyForm.is_active}
              onChange={(e) => setJourneyForm({ ...journeyForm, is_active: e.target.checked })}
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
              {journeyForm.id ? "Save Changes" : "Create Journey"}
            </button>

            {journeyForm.id ? (
              <button
                type="button"
                onClick={resetJourney}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </Panel>

      <Panel title="Journeys" description={`${filteredJourneys.length} of ${journeys.length} shown`} icon={Flag}>
        {filteredJourneys.length ? (
          <div className="grid gap-3">
            {filteredJourneys.map((journey) => (
              <div
                key={journey.id}
                className="flex items-start justify-between gap-3 rounded-[1.5rem] border border-slate-100 bg-slate-50 p-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black text-slate-950">{journey.journey_name}</p>
                    {!journey.is_active ? (
                      <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-600">
                        Inactive
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{journey.journey_key}</p>
                  {journey.journey_description ? (
                    <p className="mt-2 text-sm font-medium text-slate-600">{journey.journey_description}</p>
                  ) : null}
                </div>

                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => editJourney(journey)}
                    className="rounded-full border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-100"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeJourney(journey)}
                    className="rounded-full border border-rose-200 bg-white p-2 text-rose-600 transition hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>
            {journeys.length ? "No journeys match your search." : "No journeys yet — create the first one."}
          </EmptyState>
        )}
      </Panel>
    </div>
  );
}
