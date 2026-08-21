"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  Globe2,
  Layers,
  Link2,
  ListChecks,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Trash2,
  Upload,
  UserCircle2
} from "lucide-react";

import useRequireAuth from "@/lib/useRequireAuth";
import MentorManager from "@/components/adminDashboard/MentorManager";
import {
  createAdminGlobalSource,
  createAdminJourney,
  createAdminJourneyPhase,
  createAdminJourneyStage,
  createAdminStageDocument,
  deleteAdminGlobalSource,
  deleteAdminJourney,
  deleteAdminJourneyPhase,
  deleteAdminJourneyStage,
  deleteAdminStageDocument,
  listAdminGlobalSources,
  listAdminJourney,
  listAdminJourneys,
  listAdminStageDocuments,
  listAdminStartupMentors,
  updateAdminGlobalSource,
  updateAdminJourney,
  updateAdminJourneyPhase,
  updateAdminJourneyStage,
  updateAdminStageDocument,
  uploadAdminGlobalSource,
  uploadAdminStageDocument
} from "@/lib/startup";
import {
  createStageDeliverable,
  deleteStageDeliverable,
  listStageDeliverables,
  updateStageDeliverable
} from "@/lib/deliverables";

const DELIVERABLE_TYPES = [
  { value: "document", label: "Document" },
  { value: "pdf", label: "PDF" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "github_repository", label: "GitHub Repository" },
  { value: "url", label: "URL Link" },
  { value: "text", label: "Text Submission" }
];

const EMPTY_PHASE = {
  id: null,
  journey_id: "",
  phase_key: "",
  phase_order: 1,
  phase_name: "",
  phase_description: "",
  phase_objective: "",
  intended_audience: "",
  default_agent_key: "",
  is_active: true
};

const EMPTY_JOURNEY = {
  id: null,
  journey_key: "",
  journey_name: "",
  journey_description: "",
  journey_objective: "",
  intended_audience: "",
  is_active: true
};

const EMPTY_STAGE = {
  id: null,
  phase_id: "",
  mentor_id: "",
  stage_key: "",
  stage_order: 1,
  stage_name: "",
  agent_key: "",
  stage_context: "",
  stage_objective: "",
  expected_outcome: "",
  readiness_criteria: "",
  recommended_actions: "",
  is_active: true
};
const EMPTY_DOCUMENT = {
  id: null,
  stage_id: "",
  title: "",
  document_type: "reference",
  source_type: "manual",
  source_url: "",
  content_text: "",
  tags: "",
  language: "english",
  is_active: true
};

const DOCUMENT_TYPES = [
  "reference",
  "policy",
  "prompt",
  "example",
  "research",
  "template"
];

const EMPTY_GLOBAL_SOURCE = {
  id: null,
  title: "",
  source_type: "manual",
  source_url: "",
  content_text: "",
  tags: "",
  is_active: true
};

function StatTile({ label, value, detail, tone = "slate" }) {
  const toneClasses = {
    slate: {
      border: "border-slate-200",
      bg: "bg-white",
      label: "text-slate-400",
      value: "text-slate-950",
      detail: "text-slate-500"
    },
    orange: {
      border: "border-orange-100",
      bg: "bg-orange-50",
      label: "text-orange-600",
      value: "text-orange-900",
      detail: "text-orange-700"
    },
    blue: {
      border: "border-blue-100",
      bg: "bg-blue-50",
      label: "text-blue-500",
      value: "text-blue-900",
      detail: "text-blue-600"
    },
    emerald: {
      border: "border-emerald-100",
      bg: "bg-emerald-50",
      label: "text-emerald-600",
      value: "text-emerald-900",
      detail: "text-emerald-700"
    }
  }[tone];

  return (
    <article
      className={`rounded-[1.75rem] border ${toneClasses.border} ${toneClasses.bg} p-5`}
    >
      <p className={`text-xs font-black uppercase ${toneClasses.label}`}>
        {label}
      </p>
      <p className={`mt-2 text-3xl font-black ${toneClasses.value}`}>
        {value}
      </p>
      <p className={`mt-1 text-sm font-semibold ${toneClasses.detail}`}>
        {detail}
      </p>
    </article>
  );
}

function FieldLabel({ children }) {
  return (
    <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">
      {children}
    </span>
  );
}

const inputClass =
  "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition placeholder:text-slate-400 focus:border-orange-300 focus:bg-white";

function Panel({ title, description, icon: Icon, children }) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-3">
        {Icon ? (
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-50 text-orange-600">
            <Icon className="h-5 w-5" />
          </span>
        ) : null}

        <div>
          <h3 className="text-2xl font-black text-slate-950">{title}</h3>

          {description ? (
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {description}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-6">{children}</div>
    </section>
  );
}

const inputClassCompact =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-orange-400";

// Admin config UI for stage_deliverables (Backend/app/routes/deliverables.py -
// see sql/migrations/2026-08-20_01_deliverable_management.sql). Lives inside
// the Stage form and only shows once a stage has been saved (deliverables
// need a real stage_id).
function StageDeliverablesEditor({ stageId }) {
  const [deliverables, setDeliverables] = useState([]);
  // Fields are edited locally (draft) and only sent to the API when the
  // admin clicks that card's Save button - nothing commits on blur, so
  // there's no invisible "did that actually save?" moment.
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);

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

export default function AdminJourneyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // =====================================================
  // RECEIVE ADMIN TOKEN FROM WIX PRODUCTS PAGE
  // =====================================================
  useEffect(() => {
    try {
      const adminToken = String(
        searchParams?.get("adminToken") || ""
      ).trim();

      if (!adminToken) return;

      window.localStorage.setItem(
        "skillzage_admin_token",
        adminToken
      );

      // Keep the existing Next.js auth guard compatible too.
      window.localStorage.setItem(
        "internlabs_admin_token",
        adminToken
      );

      console.log(
        "[ADMIN AUTH] Admin token received from URL and stored."
      );
    } catch (error) {
      console.error(
        "[ADMIN AUTH] Failed to store admin token:",
        error
      );
    }
  }, [searchParams]);

  useRequireAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
const [mentors, setMentors] = useState([]);
  const [journey, setJourney] = useState([]);
  const [journeys, setJourneys] = useState([]);
  const [viewJourneyId, setViewJourneyId] = useState("");
  const [journeyForm, setJourneyForm] = useState(EMPTY_JOURNEY);

  const [phaseForm, setPhaseForm] = useState(EMPTY_PHASE);
  const [stageForm, setStageForm] = useState(EMPTY_STAGE);

  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentForm, setDocumentForm] = useState(EMPTY_DOCUMENT);
  const [documentFile, setDocumentFile] = useState(null);

  const [globalSources, setGlobalSources] = useState([]);
  const [globalSourcesLoading, setGlobalSourcesLoading] = useState(true);
  const [globalSourceFile, setGlobalSourceFile] = useState(null);
  const [globalSourceForm, setGlobalSourceForm] =
    useState(EMPTY_GLOBAL_SOURCE);

  const phases = useMemo(() => journey || [], [journey]);

  const stages = useMemo(
    () =>
      phases.flatMap((phase) =>
        (phase.stages || []).map((stage) => ({
          ...stage,
          phase_name: phase.phase_name,
          phase_id: phase.id
        }))
      ),
    [phases]
  );

  const activePhaseCount = useMemo(
    () => phases.filter((phase) => phase.is_active).length,
    [phases]
  );

  const activeStageCount = useMemo(
    () => stages.filter((stage) => stage.is_active).length,
    [stages]
  );

  const loadJourney = async (journeyId) => {
    setLoading(true);
    setError("");

    try {
      const data = await listAdminJourney(journeyId);
      setJourney(Array.isArray(data?.journey) ? data.journey : []);
      // The backend falls back to the default journey when no id is given —
      // mirror whatever it actually resolved so the viewer dropdown and the
      // phase form's journey select agree on what's currently shown.
      if (data?.journey_id) {
        setViewJourneyId(String(data.journey_id));
      }
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Unable to load phases."
      );
    } finally {
      setLoading(false);
    }
  };

  const loadJourneys = async () => {
    try {
      const data = await listAdminJourneys();
      setJourneys(Array.isArray(data?.journeys) ? data.journeys : []);
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Unable to load journeys."
      );
    }
  };

  const loadDocuments = async () => {
    setDocumentsLoading(true);

    try {
      const data = await listAdminStageDocuments();
      setDocuments(Array.isArray(data?.documents) ? data.documents : []);
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Unable to load documents."
      );
    } finally {
      setDocumentsLoading(false);
    }
  };

  const loadGlobalSources = async () => {
    setGlobalSourcesLoading(true);

    try {
      const data = await listAdminGlobalSources();
      setGlobalSources(Array.isArray(data?.sources) ? data.sources : []);
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Unable to load global sources."
      );
    } finally {
      setGlobalSourcesLoading(false);
    }
  };

  const loadMentors = async () => {
    try {
      const data = await listAdminStartupMentors();
      setMentors(Array.isArray(data?.mentors) ? data.mentors : []);
    } catch {
      // Non-fatal — agent_key selects just fall back to a free-text feel with no options.
    }
  };

  useEffect(() => {
  loadJourney();
  loadJourneys();
  loadMentors();
  loadDocuments();
  loadGlobalSources();
}, []);
  const resetPhase = () => {
    setPhaseForm(EMPTY_PHASE);
  };

  // Phase order is unique per journey (journey_id, phase_order), so a form
  // that always defaults to 1 collides as soon as a journey already has a
  // phase 1. Look up that journey's existing phases and suggest the next
  // free order instead of leaving the stale default in place.
  const suggestNextPhaseOrder = async (journeyId) => {
    try {
      const data = await listAdminJourney(journeyId);
      const existingPhases = Array.isArray(data?.journey) ? data.journey : [];
      const maxOrder = existingPhases.reduce(
        (max, phase) => Math.max(max, Number(phase.phase_order) || 0),
        0
      );
      setPhaseForm((previous) =>
        String(previous.journey_id) === String(journeyId)
          ? { ...previous, phase_order: maxOrder + 1 }
          : previous
      );
    } catch {
      // Non-fatal — the admin can still type an order manually.
    }
  };

  const resetStage = () => {
    setStageForm(EMPTY_STAGE);
  };

  const resetDocument = () => {
    setDocumentForm(EMPTY_DOCUMENT);
    setDocumentFile(null);
  };

  const resetGlobalSource = () => {
    setGlobalSourceForm(EMPTY_GLOBAL_SOURCE);
    setGlobalSourceFile(null);
  };

  const saveJourney = async (event) => {
    event.preventDefault();

    if (
      !journeyForm.journey_key.trim() ||
      !journeyForm.journey_name.trim()
    ) {
      setError("Journey key and journey name are required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const payload = {
        journey_key: journeyForm.journey_key.trim(),
        journey_name: journeyForm.journey_name.trim(),
        journey_description: journeyForm.journey_description,
        journey_objective: journeyForm.journey_objective,
        intended_audience: journeyForm.intended_audience,
        is_active: Boolean(journeyForm.is_active)
      };

      if (journeyForm.id) {
        await updateAdminJourney(journeyForm.id, payload);
      } else {
        await createAdminJourney(payload);
      }

      setJourneyForm(EMPTY_JOURNEY);
      await loadJourneys();
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Unable to save journey."
      );
    } finally {
      setSaving(false);
    }
  };

  const editJourney = (item) => {
    setJourneyForm({ ...EMPTY_JOURNEY, ...item });
  };

  const removeJourney = async (item) => {
    if (!window.confirm(`Delete journey "${item.journey_name}"?`)) {
      return;
    }

    setSaving(true);

    try {
      await deleteAdminJourney(item.id);
      await loadJourneys();
      await loadJourney(String(item.id) === viewJourneyId ? undefined : viewJourneyId);
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Unable to delete journey."
      );
    } finally {
      setSaving(false);
    }
  };

 const saveStage = async (event) => {
  event?.preventDefault?.();
  setSaving(true);
  setError("");

  try {
    const payload = {
      phase_id: Number(stageForm.phase_id),
      stage_key: stageForm.stage_key,
      stage_order: Number(stageForm.stage_order || 1),
      stage_name: stageForm.stage_name,
      stage_context: stageForm.stage_context,
      stage_objective: stageForm.stage_objective,
      expected_outcome: stageForm.expected_outcome,
      readiness_criteria: stageForm.readiness_criteria,
      recommended_actions: stageForm.recommended_actions,
      is_active: Boolean(stageForm.is_active),
      mentor_id: stageForm.mentor_id
  ? Number(stageForm.mentor_id)
  : null,
    };

    const { stage: savedStage } = stageForm.id
      ? await updateAdminJourneyStage(stageForm.id, payload)
      : await createAdminJourneyStage(payload);

    // Keep the (now-saved) stage loaded instead of resetting to a blank
    // form - a brand-new stage has no id until this point, and the
    // Deliverables editor below needs a real stage_id to do anything.
    loadStageIntoForm(savedStage);
    await loadJourney(viewJourneyId);
  } catch (err) {
    setError(
      err?.response?.data?.detail ||
        err?.message ||
        "Unable to save stage."
    );
  } finally {
    setSaving(false);
  }
};
const savePhase = async (event) => {
  event.preventDefault();

  if (!phaseForm.journey_id) {
    setError("Please select a journey.");
    return;
  }

  if (!phaseForm.phase_key.trim() || !phaseForm.phase_name.trim()) {
    setError("Phase key and phase name are required.");
    return;
  }

  setSaving(true);
  setError("");

  try {
    const payload = {
      journey_id: Number(phaseForm.journey_id),
      phase_key: phaseForm.phase_key.trim(),
      phase_order: Number(phaseForm.phase_order || 1),
      phase_name: phaseForm.phase_name.trim(),
      phase_description: phaseForm.phase_description,
      phase_objective: phaseForm.phase_objective,
      intended_audience: phaseForm.intended_audience,
      is_active: Boolean(phaseForm.is_active)
    };

    if (phaseForm.id) {
      await updateAdminJourneyPhase(phaseForm.id, payload);
    } else {
      await createAdminJourneyPhase(payload);
    }

    const savedJourneyId = payload.journey_id;
    resetPhase();
    // Reload the journey the phase actually belongs to, not whatever the
    // backend's "effective" default is — otherwise a phase saved onto a
    // non-default journey never shows up in the list below.
    await loadJourney(savedJourneyId);
  } catch (err) {
    setError(
      err?.response?.data?.detail ||
        err?.message ||
        "Unable to save phase."
    );
  } finally {
    setSaving(false);
  }
};
const editPhase = (phase) => {
  setPhaseForm({
    ...EMPTY_PHASE,
    ...phase,
    journey_id: phase.journey_id ? String(phase.journey_id) : ""
  });
};

const loadStageIntoForm = (stage) => {
  // The stages list embeds mentor_agent_key from a JOIN; a stage row fresh
  // off create/update (RETURNING *) only has the raw mentor_id column - try
  // the agent_key match first, then fall back to mentor_id directly, so
  // neither source loses the selected mentor.
  const mentorFromAgentKey = stage.mentor_agent_key
    ? mentors.find((item) => String(item.agent_key || "").trim() === String(stage.mentor_agent_key).trim())
    : null;
  setStageForm({
    ...EMPTY_STAGE,
    ...stage,
    phase_id: String(stage.phase_id || ""),
    mentor_id: mentorFromAgentKey?.id
      ? String(mentorFromAgentKey.id)
      : stage.mentor_id
        ? String(stage.mentor_id)
        : ""
  });
};

const editStage = (stage) => {
  loadStageIntoForm(stage);
};

const removePhase = async (phase) => {
  if (
    !window.confirm(
      `Delete phase "${phase.phase_name}"? This also removes its stages.`
    )
  ) {
    return;
  }

  setSaving(true);

  try {
    await deleteAdminJourneyPhase(phase.id);
    await loadJourney(viewJourneyId);
  } catch (err) {
    setError(
      err?.response?.data?.detail ||
        err?.message ||
        "Unable to delete phase."
    );
  } finally {
    setSaving(false);
  }
};

const removeStage = async (stage) => {
  if (!window.confirm(`Delete stage "${stage.stage_name}"?`)) {
    return;
  }

  setSaving(true);

  try {
    await deleteAdminJourneyStage(stage.id);
    await loadJourney(viewJourneyId);
  } catch (err) {
    setError(
      err?.response?.data?.detail ||
        err?.message ||
        "Unable to delete stage."
    );
  } finally {
    setSaving(false);
  }
};

  const saveDocument = async (event) => {
    event.preventDefault();

    if (!Number(documentForm.stage_id)) {
      setError("Pick a stage before saving the document.");
      return;
    }

    if (!documentForm.title.trim()) {
      setError("Document title is required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (documentForm.source_type === "upload") {
        if (!documentForm.id && !documentFile) {
          setError("Choose a file to upload.");
          return;
        }

        if (!documentForm.id) {
          const formData = new FormData();

          formData.append(
            "stage_id",
            String(Number(documentForm.stage_id))
          );
          formData.append("title", documentForm.title);
          formData.append("document_type", documentForm.document_type);
          formData.append("tags", documentForm.tags);
          formData.append("language", documentForm.language);
          formData.append(
            "is_active",
            String(Boolean(documentForm.is_active))
          );
          formData.append("file", documentFile);

          await uploadAdminStageDocument(formData);
        } else {
          await updateAdminStageDocument(documentForm.id, {
            stage_id: Number(documentForm.stage_id),
            title: documentForm.title,
            document_type: documentForm.document_type,
            tags: documentForm.tags,
            language: documentForm.language,
            is_active: Boolean(documentForm.is_active)
          });
        }
      } else {
        const payload = {
          stage_id: Number(documentForm.stage_id),
          title: documentForm.title,
          document_type: documentForm.document_type,
          source_type: documentForm.source_type,
          source_url:
            documentForm.source_type === "url"
              ? documentForm.source_url
              : "",
          content_text:
            documentForm.source_type === "manual"
              ? documentForm.content_text
              : "",
          tags: documentForm.tags,
          language: documentForm.language,
          is_active: Boolean(documentForm.is_active)
        };

        if (documentForm.id) {
          await updateAdminStageDocument(
            documentForm.id,
            payload
          );
        } else {
          await createAdminStageDocument(payload);
        }
      }

      resetDocument();
      await loadDocuments();
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Unable to save document."
      );
    } finally {
      setSaving(false);
    }
  };

  const editDocument = (document) => {
    setDocumentForm({
      ...EMPTY_DOCUMENT,
      ...document,
      stage_id: String(document.stage_id || ""),
      tags: Array.isArray(document.tags)
        ? document.tags.join(", ")
        : document.tags || ""
    });

    setDocumentFile(null);
  };

  const removeDocument = async (document) => {
    if (!window.confirm(`Delete document "${document.title}"?`)) {
      return;
    }

    setSaving(true);

    try {
      await deleteAdminStageDocument(document.id);
      await loadDocuments();
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Unable to delete document."
      );
    } finally {
      setSaving(false);
    }
  };

  const saveGlobalSource = async (event) => {
    event.preventDefault();

    if (!globalSourceForm.title.trim()) {
      setError("Source title is required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (globalSourceForm.source_type === "upload") {
        if (!globalSourceForm.id && !globalSourceFile) {
          setError("Choose a file to upload.");
          return;
        }

        if (!globalSourceForm.id) {
          const formData = new FormData();

          formData.append("title", globalSourceForm.title);
          formData.append("tags", globalSourceForm.tags);
          formData.append(
            "is_active",
            String(Boolean(globalSourceForm.is_active))
          );
          formData.append("file", globalSourceFile);

          await uploadAdminGlobalSource(formData);
        } else {
          await updateAdminGlobalSource(globalSourceForm.id, {
            title: globalSourceForm.title,
            tags: globalSourceForm.tags,
            is_active: Boolean(globalSourceForm.is_active)
          });
        }
      } else {
        const payload = {
          title: globalSourceForm.title,
          source_type: globalSourceForm.source_type,
          source_url:
            globalSourceForm.source_type === "url"
              ? globalSourceForm.source_url
              : "",
          content_text:
            globalSourceForm.source_type === "manual"
              ? globalSourceForm.content_text
              : "",
          tags: globalSourceForm.tags,
          is_active: Boolean(globalSourceForm.is_active)
        };

        if (globalSourceForm.id) {
          await updateAdminGlobalSource(
            globalSourceForm.id,
            payload
          );
        } else {
          await createAdminGlobalSource(payload);
        }
      }

      resetGlobalSource();
      await loadGlobalSources();
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Unable to save global source."
      );
    } finally {
      setSaving(false);
    }
  };

  const editGlobalSource = (source) => {
    setGlobalSourceForm({
      ...EMPTY_GLOBAL_SOURCE,
      ...source,
      tags: Array.isArray(source.tags)
        ? source.tags.join(", ")
        : source.tags || ""
    });

    setGlobalSourceFile(null);
  };

  const removeGlobalSource = async (source) => {
    if (!window.confirm(`Delete global source "${source.title}"?`)) {
      return;
    }

    setSaving(true);

    try {
      await deleteAdminGlobalSource(source.id);
      await loadGlobalSources();
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Unable to delete global source."
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(255,127,41,0.14),transparent_30%),linear-gradient(135deg,#f8fafc_0%,#ffffff_50%,#fff7ed_100%)] px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
        <header className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.45)] sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-black tracking-tight text-slate-950">Admin Management Dashboard for Startup</h2>

            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((open) => !open)}
                aria-haspopup="true"
                aria-expanded={profileMenuOpen}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
              >
                <UserCircle2 className="h-6 w-6" />
              </button>

              {profileMenuOpen ? (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setProfileMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full z-20 mt-2 w-44 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg">
                    <button
                      type="button"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-rose-600 transition hover:bg-rose-50"
                    >
                      <LogOut className="h-4 w-4" />
                      Logout
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <StatTile label="Total Phases" value={phases.length} detail="Journey phases defined." />
          <StatTile label="Active Phases" value={activePhaseCount} detail="Visible in the student workspace." tone="orange" />
          <StatTile label="Total Stages" value={stages.length} detail="Stages across all phases." tone="blue" />
          <StatTile label="Active Stages" value={activeStageCount} detail="Currently unlockable stages." tone="emerald" />
          <StatTile label="Stage Documents" value={documents.length} detail="Reference docs attached to stages." tone="orange" />
          <StatTile label="Global Sources" value={globalSources.length} detail="Available across every phase." tone="blue" />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Panel
  title={journeyForm.id ? "Edit Journey" : "Create Journey"}
  description="Create a reusable startup journey."
  icon={Layers}
>
  <form onSubmit={saveJourney} className="grid gap-4">
    <input
      className={inputClass}
      placeholder="Journey Name"
      value={journeyForm.journey_name}
      onChange={(e) =>
        setJourneyForm({ ...journeyForm, journey_name: e.target.value })
      }
    />

    <input
      className={inputClass}
      placeholder="Journey Key"
      value={journeyForm.journey_key}
      onChange={(e) =>
        setJourneyForm({ ...journeyForm, journey_key: e.target.value })
      }
    />

    <textarea
      className={inputClass}
      placeholder="Description"
      value={journeyForm.journey_description}
      onChange={(e) =>
        setJourneyForm({ ...journeyForm, journey_description: e.target.value })
      }
    />

    <textarea
      className={inputClass}
      placeholder="Objective"
      value={journeyForm.journey_objective}
      onChange={(e) =>
        setJourneyForm({ ...journeyForm, journey_objective: e.target.value })
      }
    />

    <textarea
      className={inputClass}
      placeholder="Intended Audience"
      value={journeyForm.intended_audience}
      onChange={(e) =>
        setJourneyForm({ ...journeyForm, intended_audience: e.target.value })
      }
    />

    <label className="flex items-center gap-2 text-sm font-semibold">
      <input
        type="checkbox"
        checked={journeyForm.is_active}
        onChange={(e) =>
          setJourneyForm({ ...journeyForm, is_active: e.target.checked })
        }
      />
      Active
    </label>

    <div className="flex gap-3">
      <button type="submit" className="rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white">
        {journeyForm.id ? "Save Changes" : "Create Journey"}
      </button>

      {journeyForm.id ? (
        <button
          type="button"
          className="rounded-xl border px-4 py-3 text-sm font-bold"
          onClick={() => setJourneyForm(EMPTY_JOURNEY)}
        >
          Cancel
        </button>
      ) : null}
    </div>
  </form>
</Panel>

<Panel title="Journeys" description="Reusable startup programs." icon={Layers}>
  <div className="grid gap-3">
    {journeys.map((journey) => (
      <div
        key={journey.id}
        className="flex items-center justify-between rounded-2xl border border-slate-200 p-4"
      >
        <div>
          <p className="font-black text-slate-950">
            {journey.journey_name}
          </p>
          <p className="text-sm text-slate-500">
            {journey.journey_key}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {journey.journey_description}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => editJourney(journey)}
            className="rounded-xl border p-2"
          >
            <Pencil className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => removeJourney(journey)}
            className="rounded-xl border p-2 text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    ))}
  </div>
</Panel>
          <Panel
  title="Phases"
  description="Top-level journey steps, ordered by phase_order."
  icon={Layers}
>
  <label className="mb-4 grid gap-2">
    <FieldLabel>Viewing journey</FieldLabel>

    <select
      value={viewJourneyId}
      onChange={(event) => loadJourney(event.target.value)}
      className={inputClass}
    >
      {journeys.map((item) => (
        <option key={item.id} value={item.id}>
          {item.journey_name}
          {item.is_default ? " (default)" : ""}
        </option>
      ))}
    </select>
  </label>

  <form onSubmit={savePhase} className="grid gap-4">
    <label className="grid gap-2">
      <FieldLabel>Journey</FieldLabel>

      <select
        value={phaseForm.journey_id}
        onChange={(event) => {
          const nextJourneyId = event.target.value;
          setPhaseForm((previous) => ({
            ...previous,
            journey_id: nextJourneyId
          }));
          // Only auto-suggest an order for brand-new phases — editing an
          // existing phase should never silently overwrite its saved order.
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
          onChange={(event) =>
            setPhaseForm({
              ...phaseForm,
              phase_key: event.target.value
            })
          }
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
          onChange={(event) =>
            setPhaseForm({
              ...phaseForm,
              phase_order: event.target.value
            })
          }
          className={inputClass}
        />
      </label>
    </div>

    <label className="grid gap-2">
      <FieldLabel>Phase Name</FieldLabel>

      <input
        value={phaseForm.phase_name}
        onChange={(event) =>
          setPhaseForm({
            ...phaseForm,
            phase_name: event.target.value
          })
        }
        placeholder="e.g. Idea Validation"
        className={inputClass}
      />
    </label>

    <label className="grid gap-2">
      <FieldLabel>Description</FieldLabel>

      <textarea
        value={phaseForm.phase_description}
        onChange={(event) =>
          setPhaseForm({
            ...phaseForm,
            phase_description: event.target.value
          })
        }
        rows={3}
        className={inputClass}
        placeholder="What this phase covers..."
      />
    </label>

    <label className="grid gap-2">
      <FieldLabel>Objective</FieldLabel>

      <textarea
        value={phaseForm.phase_objective}
        onChange={(event) =>
          setPhaseForm({
            ...phaseForm,
            phase_objective: event.target.value
          })
        }
        rows={3}
        className={inputClass}
        placeholder="What the student should achieve..."
      />
    </label>

    <label className="grid gap-2">
      <FieldLabel>Intended Audience</FieldLabel>

      <input
        value={phaseForm.intended_audience}
        onChange={(event) =>
          setPhaseForm({
            ...phaseForm,
            intended_audience: event.target.value
          })
        }
        placeholder="e.g. first-time founders"
        className={inputClass}
      />
    </label>

    <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
      <input
        type="checkbox"
        checked={Boolean(phaseForm.is_active)}
        onChange={(event) =>
          setPhaseForm({
            ...phaseForm,
            is_active: event.target.checked
          })
        }
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
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}

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

  <div className="mt-6 space-y-3 border-t border-slate-100 pt-6">
    {loading ? (
      <p className="text-sm font-semibold text-slate-500">
        Loading phases...
      </p>
    ) : phases.length ? (
      phases.map((phase) => (
        <div
          key={phase.id}
          className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-black text-slate-950">
                  {phase.phase_name}
                </p>

                {!phase.is_active ? (
                  <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-600">
                    Inactive
                  </span>
                ) : null}
              </div>

              <p className="mt-1 text-xs font-semibold text-slate-500">
                {phase.phase_key} · order {phase.phase_order}
              </p>

              {phase.journey_id ? (
                <p className="mt-1 text-xs font-semibold text-orange-600">
                  Journey ID: {phase.journey_id}
                </p>
              ) : null}

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
      <p className="text-sm font-semibold text-slate-500">
        No phases yet — create the first one above.
      </p>
    )}
  </div>
</Panel>
         <Panel
  title="Stages"
  description="Ordered steps within a phase, shown to students one at a time."
  icon={ListChecks}
>
  <form onSubmit={saveStage} className="grid gap-4">
    <label className="grid gap-2">
      <FieldLabel>Phase</FieldLabel>

      <select
        value={stageForm.phase_id}
        onChange={(event) =>
          setStageForm({
            ...stageForm,
            phase_id: event.target.value
          })
        }
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
        onChange={(event) =>
          setStageForm({
            ...stageForm,
            mentor_id: event.target.value
          })
        }
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
          onChange={(event) =>
            setStageForm({
              ...stageForm,
              stage_key: event.target.value
            })
          }
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
          onChange={(event) =>
            setStageForm({
              ...stageForm,
              stage_order: event.target.value
            })
          }
          className={inputClass}
        />
      </label>
    </div>

    <label className="grid gap-2">
      <FieldLabel>Stage Name</FieldLabel>

      <input
        value={stageForm.stage_name}
        onChange={(event) =>
          setStageForm({
            ...stageForm,
            stage_name: event.target.value
          })
        }
        placeholder="e.g. Define the problem"
        className={inputClass}
      />
    </label>

    <label className="grid gap-2">
      <FieldLabel>Context</FieldLabel>

      <textarea
        value={stageForm.stage_context}
        onChange={(event) =>
          setStageForm({
            ...stageForm,
            stage_context: event.target.value
          })
        }
        rows={3}
        className={inputClass}
        placeholder="Background the AI mentor should know..."
      />
    </label>

    <label className="grid gap-2">
      <FieldLabel>Objective</FieldLabel>

      <textarea
        value={stageForm.stage_objective}
        onChange={(event) =>
          setStageForm({
            ...stageForm,
            stage_objective: event.target.value
          })
        }
        rows={2}
        className={inputClass}
      />
    </label>

    <label className="grid gap-2">
      <FieldLabel>Expected Outcome</FieldLabel>

      <textarea
        value={stageForm.expected_outcome}
        onChange={(event) =>
          setStageForm({
            ...stageForm,
            expected_outcome: event.target.value
          })
        }
        rows={2}
        className={inputClass}
      />
    </label>

    <label className="grid gap-2">
      <FieldLabel>Readiness Criteria</FieldLabel>

      <textarea
        value={stageForm.readiness_criteria}
        onChange={(event) =>
          setStageForm({
            ...stageForm,
            readiness_criteria: event.target.value
          })
        }
        rows={2}
        className={inputClass}
      />
    </label>

    <label className="grid gap-2">
      <FieldLabel>Recommended Actions</FieldLabel>

      <textarea
        value={stageForm.recommended_actions}
        onChange={(event) =>
          setStageForm({
            ...stageForm,
            recommended_actions: event.target.value
          })
        }
        rows={2}
        className={inputClass}
      />
    </label>

    <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
      <input
        type="checkbox"
        checked={Boolean(stageForm.is_active)}
        onChange={(event) =>
          setStageForm({
            ...stageForm,
            is_active: event.target.checked
          })
        }
        className="h-4 w-4"
      />

      Active
    </label>

    <div className="flex flex-wrap gap-3">
      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}

        {stageForm.id ? "Update Stage" : "Create Stage"}
      </button>

      <button
        type="button"
        onClick={resetStage}
        className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700"
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
      <p className="text-sm font-semibold text-slate-500">
        Loading stages...
      </p>
    ) : stages.length ? (
      stages.map((stage) => {
        const mentor =
          mentors.find(
            (item) =>
              String(item.agent_key || "").trim() === String(stage.mentor_agent_key || "").trim()
          ) ||
          mentors.find((item) => Number(item.id) === Number(stage.mentor_id));

        return (
          <div
            key={stage.id}
            className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-black text-slate-950">
                  {stage.stage_name}
                </p>

                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {stage.phase_name} · {stage.stage_key} · order{" "}
                  {stage.stage_order}
                </p>

                <p className="mt-1 text-xs font-semibold text-orange-600">
                  Mentor:{" "}
                  {mentor?.mentor_name ||
                    mentor?.name ||
                    "No mentor assigned"}
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
      <p className="text-sm font-semibold text-slate-500">
        No stages yet.
      </p>
    )}
  </div>
</Panel>
        </div>

        <Panel title="Stage Documents" description="Reference material the AI mentor pulls into an answer for a specific stage." icon={FileText}>
          <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
            <form onSubmit={saveDocument} className="grid gap-4">
              <label className="grid gap-2">
                <FieldLabel>Stage</FieldLabel>
                <select
                  value={documentForm.stage_id}
                  onChange={(e) => setDocumentForm({ ...documentForm, stage_id: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Select stage</option>
                  {phases.map((phase) => (
                    <optgroup key={phase.id} label={phase.phase_name}>
                      {(phase.stages || []).length ? (
                        phase.stages.map((stage) => (
                          <option key={stage.id} value={stage.id}>
                            {stage.stage_name}
                          </option>
                        ))
                      ) : (
                        <option value="" disabled>
                          No stages created yet
                        </option>
                      )}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                <FieldLabel>Title</FieldLabel>
                <input
                  value={documentForm.title}
                  onChange={(e) => setDocumentForm({ ...documentForm, title: e.target.value })}
                  placeholder="e.g. Market sizing checklist"
                  className={inputClass}
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <FieldLabel>Document Type</FieldLabel>
                  <select
                    value={documentForm.document_type}
                    onChange={(e) => setDocumentForm({ ...documentForm, document_type: e.target.value })}
                    className={inputClass}
                  >
                    {DOCUMENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2">
                  <FieldLabel>Source</FieldLabel>
                  <select
                    value={documentForm.source_type}
                    onChange={(e) => setDocumentForm({ ...documentForm, source_type: e.target.value })}
                    disabled={Boolean(documentForm.id)}
                    className={inputClass}
                  >
                    <option value="manual">Paste text</option>
                    <option value="url">Link (URL)</option>
                    <option value="upload">Upload file</option>
                  </select>
                </label>
              </div>
              {documentForm.source_type === "url" ? (
                <label className="grid gap-2">
                  <FieldLabel>Source URL</FieldLabel>
                  <input
                    value={documentForm.source_url}
                    onChange={(e) => setDocumentForm({ ...documentForm, source_url: e.target.value })}
                    placeholder="https://..."
                    className={inputClass}
                  />
                </label>
              ) : documentForm.source_type === "upload" ? (
                <label className="grid gap-2">
                  <FieldLabel>{documentForm.id ? "Replace File (not supported yet)" : "File"}</FieldLabel>
                  <input
                    type="file"
                    disabled={Boolean(documentForm.id)}
                    onChange={(e) => setDocumentFile(e.target.files?.[0] || null)}
                    className={`${inputClass} file:mr-3 file:rounded-full file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-xs file:font-black file:text-white`}
                  />
                  {documentForm.id ? (
                    <p className="text-xs font-semibold text-slate-500">
                      To swap the file, delete this document and upload a new one.
                    </p>
                  ) : documentFile ? (
                    <p className="text-xs font-semibold text-slate-500">Selected: {documentFile.name}</p>
                  ) : null}
                </label>
              ) : (
                <label className="grid gap-2">
                  <FieldLabel>Content</FieldLabel>
                  <textarea
                    value={documentForm.content_text}
                    onChange={(e) => setDocumentForm({ ...documentForm, content_text: e.target.value })}
                    rows={6}
                    className={inputClass}
                    placeholder="Paste the reference text the mentor should use..."
                  />
                </label>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <FieldLabel>Tags</FieldLabel>
                  <input
                    value={documentForm.tags}
                    onChange={(e) => setDocumentForm({ ...documentForm, tags: e.target.value })}
                    placeholder="market, template, india"
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-2">
                  <FieldLabel>Language</FieldLabel>
                  <input
                    value={documentForm.language}
                    onChange={(e) => setDocumentForm({ ...documentForm, language: e.target.value })}
                    className={inputClass}
                  />
                </label>
              </div>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(documentForm.is_active)}
                  onChange={(e) => setDocumentForm({ ...documentForm, is_active: e.target.checked })}
                  className="h-4 w-4"
                />
                Active
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-[0_14px_30px_-16px_rgba(15,23,42,0.8)] transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : documentForm.source_type === "upload" ? (
                    <Upload className="h-4 w-4" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {documentForm.id ? "Update Document" : "Add Document"}
                </button>
                <button
                  type="button"
                  onClick={resetDocument}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Reset
                </button>
              </div>
            </form>

            <div className="space-y-3 xl:border-l xl:border-slate-100 xl:pl-6">
              {documentsLoading ? (
                <p className="text-sm font-semibold text-slate-500">Loading documents...</p>
              ) : documents.length ? (
                documents.map((doc) => (
                  <div key={doc.id} className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-black text-slate-950">{doc.title}</p>
                          <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-600">
                            {doc.document_type}
                          </span>
                          {!doc.is_active ? (
                            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-rose-600">
                              Inactive
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {doc.phase_name} &middot; {doc.stage_name}
                        </p>
                        {doc.source_type === "upload" && doc.storage_url ? (
                          <a
                            href={doc.storage_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:underline"
                          >
                            <Upload className="h-3.5 w-3.5" />
                            {doc.original_filename || "Uploaded file"}
                          </a>
                        ) : doc.source_type === "url" && doc.source_url ? (
                          <a
                            href={doc.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:underline"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                            {doc.source_url}
                          </a>
                        ) : (
                          <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-600">{doc.content_text}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          onClick={() => editDocument(doc)}
                          className="rounded-full border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeDocument(doc)}
                          className="rounded-full border border-rose-200 bg-white p-2 text-rose-600 transition hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm font-semibold text-slate-500">No documents yet — pick a stage and add the first reference document.</p>
              )}
            </div>
          </div>
        </Panel>

        <Panel
          title="Global Knowledge Sources"
          description="Reference material available across every phase and stage, not tied to one specific stage."
          icon={Globe2}
        >
          <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
            <form onSubmit={saveGlobalSource} className="grid gap-4">
              <label className="grid gap-2">
                <FieldLabel>Title</FieldLabel>
                <input
                  value={globalSourceForm.title}
                  onChange={(e) => setGlobalSourceForm({ ...globalSourceForm, title: e.target.value })}
                  placeholder="e.g. India startup funding landscape"
                  className={inputClass}
                />
              </label>
              <label className="grid gap-2">
                <FieldLabel>Source</FieldLabel>
                <select
                  value={globalSourceForm.source_type}
                  onChange={(e) => setGlobalSourceForm({ ...globalSourceForm, source_type: e.target.value })}
                  disabled={Boolean(globalSourceForm.id)}
                  className={inputClass}
                >
                  <option value="manual">Paste text</option>
                  <option value="url">Link (URL)</option>
                  <option value="upload">Upload file</option>
                </select>
              </label>
              {globalSourceForm.source_type === "url" ? (
                <label className="grid gap-2">
                  <FieldLabel>Source URL</FieldLabel>
                  <input
                    value={globalSourceForm.source_url}
                    onChange={(e) => setGlobalSourceForm({ ...globalSourceForm, source_url: e.target.value })}
                    placeholder="https://..."
                    className={inputClass}
                  />
                </label>
              ) : globalSourceForm.source_type === "upload" ? (
                <label className="grid gap-2">
                  <FieldLabel>{globalSourceForm.id ? "Replace File (not supported yet)" : "File"}</FieldLabel>
                  <input
                    type="file"
                    disabled={Boolean(globalSourceForm.id)}
                    onChange={(e) => setGlobalSourceFile(e.target.files?.[0] || null)}
                    className={`${inputClass} file:mr-3 file:rounded-full file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-xs file:font-black file:text-white`}
                  />
                  {globalSourceForm.id ? (
                    <p className="text-xs font-semibold text-slate-500">
                      To swap the file, delete this source and upload a new one.
                    </p>
                  ) : globalSourceFile ? (
                    <p className="text-xs font-semibold text-slate-500">Selected: {globalSourceFile.name}</p>
                  ) : null}
                </label>
              ) : (
                <label className="grid gap-2">
                  <FieldLabel>Content</FieldLabel>
                  <textarea
                    value={globalSourceForm.content_text}
                    onChange={(e) => setGlobalSourceForm({ ...globalSourceForm, content_text: e.target.value })}
                    rows={6}
                    className={inputClass}
                    placeholder="Paste reference text every student's mentor can draw on..."
                  />
                </label>
              )}
              <label className="grid gap-2">
                <FieldLabel>Tags</FieldLabel>
                <input
                  value={globalSourceForm.tags}
                  onChange={(e) => setGlobalSourceForm({ ...globalSourceForm, tags: e.target.value })}
                  placeholder="funding, india, market"
                  className={inputClass}
                />
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(globalSourceForm.is_active)}
                  onChange={(e) => setGlobalSourceForm({ ...globalSourceForm, is_active: e.target.checked })}
                  className="h-4 w-4"
                />
                Active
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-[0_14px_30px_-16px_rgba(15,23,42,0.8)] transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : globalSourceForm.source_type === "upload" ? (
                    <Upload className="h-4 w-4" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {globalSourceForm.id ? "Update Source" : "Add Global Source"}
                </button>
                <button
                  type="button"
                  onClick={resetGlobalSource}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Reset
                </button>
              </div>
            </form>

            <div className="space-y-3 xl:border-l xl:border-slate-100 xl:pl-6">
              {globalSourcesLoading ? (
                <p className="text-sm font-semibold text-slate-500">Loading global sources...</p>
              ) : globalSources.length ? (
                globalSources.map((source) => (
                  <div key={source.id} className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-black text-slate-950">{source.title}</p>
                          {!source.is_active ? (
                            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-rose-600">
                              Inactive
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-500">Global &middot; {source.source_type}</p>
                        {source.source_type === "upload" && source.storage_url ? (
                          <a
                            href={source.storage_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:underline"
                          >
                            <Upload className="h-3.5 w-3.5" />
                            {source.original_filename || "Uploaded file"}
                          </a>
                        ) : source.source_type === "url" && source.source_url ? (
                          <a
                            href={source.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:underline"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                            {source.source_url}
                          </a>
                        ) : (
                          <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-600">{source.content_text}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          onClick={() => editGlobalSource(source)}
                          className="rounded-full border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeGlobalSource(source)}
                          className="rounded-full border border-rose-200 bg-white p-2 text-rose-600 transition hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm font-semibold text-slate-500">No global sources yet — add the first one above.</p>
              )}
            </div>
          </div>
        </Panel>

        <MentorManager onMentorsChanged={loadMentors} />
      </div>
    </main>
  );
}
