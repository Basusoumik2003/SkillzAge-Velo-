"use client";

import { useEffect, useState } from "react";
import { FileDown, Loader2, Plus, Trash2, Upload } from "lucide-react";

import {
  createStageDeliverable,
  deleteStageDeliverable,
  listStageDeliverables,
  updateStageDeliverable,
  uploadDeliverableTemplate
} from "@/lib/deliverables";
import { inputClassCompact } from "./ui";

const DELIVERABLE_TYPES = [
  { value: "document", label: "Document" },
  { value: "pdf", label: "PDF" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "github_repository", label: "GitHub Repository" },
  { value: "url", label: "URL Link" },
  { value: "text", label: "Text Submission" }
];

// Admin config UI for stage_deliverables (Backend/app/routes/deliverables.py -
// see sql/migrations/2026-08-20_01_deliverable_management.sql). Lives inside
// the Stage form and only shows once a stage has been saved (deliverables
// need a real stage_id).
export default function StageDeliverablesEditor({ stageId }) {
  const [deliverables, setDeliverables] = useState([]);
  // Fields are edited locally (draft) and only sent to the API when the
  // admin clicks that card's Save button - nothing commits on blur, so
  // there's no invisible "did that actually save?" moment.
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [uploadingTemplateId, setUploadingTemplateId] = useState(null);

  const draftOf = (deliverable) =>
    drafts[deliverable.id] || {
      deliverable_name: deliverable.deliverable_name,
      deliverable_description: deliverable.deliverable_description,
      deliverable_type: deliverable.deliverable_type,
      display_order: deliverable.display_order,
      is_required: deliverable.is_required
    };

  const setDraftField = (id, field, value) => {
    setDrafts((previous) => ({
      ...previous,
      [id]: { ...draftOf(deliverables.find((item) => item.id === id) || {}), ...previous[id], [field]: value }
    }));
  };

  const isDirty = (deliverable) => {
    const draft = drafts[deliverable.id];
    if (!draft) return false;
    return (
      draft.deliverable_name !== deliverable.deliverable_name ||
      draft.deliverable_description !== deliverable.deliverable_description ||
      draft.deliverable_type !== deliverable.deliverable_type ||
      Number(draft.display_order) !== Number(deliverable.display_order) ||
      Boolean(draft.is_required) !== Boolean(deliverable.is_required)
    );
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await listStageDeliverables(stageId);
        if (!cancelled) setDeliverables(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.detail || err?.message || "Unable to load deliverables.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (stageId) load();
    return () => {
      cancelled = true;
    };
  }, [stageId]);

  const saveDeliverable = async (deliverable) => {
    const draft = draftOf(deliverable);
    if (!draft.deliverable_name.trim()) {
      setError("Deliverable name cannot be blank.");
      return;
    }
    setError("");
    setSavingId(deliverable.id);
    try {
      const updated = await updateStageDeliverable(deliverable.id, {
        deliverable_name: draft.deliverable_name.trim(),
        deliverable_description: draft.deliverable_description,
        deliverable_type: draft.deliverable_type,
        display_order: Number(draft.display_order) || 1,
        is_required: Boolean(draft.is_required)
      });
      setDeliverables((previous) => previous.map((item) => (item.id === deliverable.id ? updated : item)));
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[deliverable.id];
        return next;
      });
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to save deliverable.");
    } finally {
      setSavingId(null);
    }
  };

  const addDeliverable = async () => {
    setError("");
    try {
      const nextOrder =
        deliverables.reduce((max, item) => Math.max(max, Number(item.display_order) || 0), 0) + 1;
      const created = await createStageDeliverable({
        stage_id: stageId,
        deliverable_name: "New deliverable",
        deliverable_description: "",
        deliverable_type: "document",
        is_required: true,
        display_order: nextOrder
      });
      setDeliverables((previous) => [...previous, created]);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to add deliverable.");
    }
  };

  const handleTemplateUpload = async (deliverable, file) => {
    if (!file) return;
    setError("");
    setUploadingTemplateId(deliverable.id);
    try {
      const updated = await uploadDeliverableTemplate(deliverable.id, file);
      setDeliverables((previous) => previous.map((item) => (item.id === deliverable.id ? updated : item)));
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to upload template.");
    } finally {
      setUploadingTemplateId(null);
    }
  };

  const removeDeliverable = async (deliverable) => {
    if (!window.confirm(`Delete deliverable "${deliverable.deliverable_name}"?`)) return;
    setError("");
    try {
      await deleteStageDeliverable(deliverable.id);
      setDeliverables((previous) => previous.filter((item) => item.id !== deliverable.id));
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[deliverable.id];
        return next;
      });
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to delete deliverable.");
    }
  };

  if (!stageId) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
        Save this stage first, then come back here to add its deliverables.
      </div>
    );
  }

  return (
    <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-slate-700">Deliverables</p>
          <p className="text-xs font-semibold text-slate-500">What students must submit to complete this stage.</p>
        </div>

        <button
          type="button"
          onClick={addDeliverable}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3.5 py-2 text-xs font-black text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Deliverable
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</div>
      ) : null}

      {loading ? (
        <p className="text-sm font-semibold text-slate-500">Loading deliverables...</p>
      ) : deliverables.length ? (
        <div className="grid gap-3">
          {deliverables.map((deliverable) => {
            const draft = draftOf(deliverable);
            const dirty = isDirty(deliverable);
            const isSaving = savingId === deliverable.id;

            return (
              <div key={deliverable.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid flex-1 gap-3 sm:grid-cols-2">
                    <label className="grid gap-1">
                      <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Name</span>
                      <input
                        value={draft.deliverable_name}
                        onChange={(event) => setDraftField(deliverable.id, "deliverable_name", event.target.value)}
                        className={inputClassCompact}
                        placeholder="Problem Statement"
                      />
                    </label>

                    <label className="grid gap-1">
                      <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Type</span>
                      <select
                        value={draft.deliverable_type}
                        onChange={(event) => setDraftField(deliverable.id, "deliverable_type", event.target.value)}
                        className={inputClassCompact}
                      >
                        {DELIVERABLE_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1 sm:col-span-2">
                      <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Description</span>
                      <textarea
                        value={draft.deliverable_description}
                        onChange={(event) =>
                          setDraftField(deliverable.id, "deliverable_description", event.target.value)
                        }
                        rows={2}
                        className={inputClassCompact}
                        placeholder="Upload validated problem statement"
                      />
                    </label>

                    <label className="grid gap-1">
                      <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Display Order</span>
                      <input
                        type="number"
                        min="1"
                        value={draft.display_order}
                        onChange={(event) => setDraftField(deliverable.id, "display_order", event.target.value)}
                        className={inputClassCompact}
                      />
                    </label>

                    <label className="flex items-center gap-2 self-end pb-1.5">
                      <input
                        type="checkbox"
                        checked={Boolean(draft.is_required)}
                        onChange={(event) => setDraftField(deliverable.id, "is_required", event.target.checked)}
                        className="h-4 w-4"
                      />
                      <span className="text-xs font-black text-slate-700">Required</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeDeliverable(deliverable)}
                    title="Delete deliverable"
                    className="rounded-xl border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
                  {deliverable.template_url ? (
                    <a
                      href={deliverable.template_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:underline"
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      {deliverable.template_original_filename || "Current template"}
                    </a>
                  ) : (
                    <span className="text-xs font-semibold text-slate-400">No template uploaded yet</span>
                  )}

                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50">
                    {uploadingTemplateId === deliverable.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {deliverable.template_url ? "Replace Template" : "Upload Template"}
                    <input
                      type="file"
                      className="hidden"
                      disabled={uploadingTemplateId === deliverable.id}
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        event.target.value = "";
                        handleTemplateUpload(deliverable, file);
                      }}
                    />
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => saveDeliverable(deliverable)}
                    disabled={!dirty || isSaving}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-3.5 py-1.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {isSaving ? "Saving..." : "Save"}
                  </button>

                  {dirty && !isSaving ? (
                    <span className="text-[11px] font-bold text-orange-600">Unsaved changes</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm font-semibold text-slate-500">No deliverables yet - click "Add Deliverable" to create one.</p>
      )}
    </div>
  );
}
