"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Globe2, Layers, Link2, ListChecks, Loader2, Pencil, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import useRequireAuth from "@/lib/useRequireAuth";
import MentorManager from "@/components/adminDashboard/MentorManager";
import {
  createAdminGlobalSource,
  createAdminJourneyPhase,
  createAdminJourneyStage,
  createAdminStageDocument,
  deleteAdminGlobalSource,
  deleteAdminJourneyPhase,
  deleteAdminJourneyStage,
  deleteAdminStageDocument,
  listAdminGlobalSources,
  listAdminJourney,
  listAdminStageDocuments,
  updateAdminGlobalSource,
  updateAdminJourneyPhase,
  updateAdminJourneyStage,
  updateAdminStageDocument,
  uploadAdminGlobalSource,
  uploadAdminStageDocument
} from "@/lib/startup";

const EMPTY_PHASE = {
  id: null,
  phase_key: "",
  phase_order: 1,
  phase_name: "",
  phase_description: "",
  phase_objective: "",
  intended_audience: "",
  is_active: true
};

const EMPTY_STAGE = {
  id: null,
  phase_id: "",
  stage_key: "",
  stage_order: 1,
  stage_name: "",
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

const DOCUMENT_TYPES = ["reference", "policy", "prompt", "example", "research", "template"];

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
    slate: { border: "border-slate-200", bg: "bg-white", label: "text-slate-400", value: "text-slate-950", detail: "text-slate-500" },
    orange: { border: "border-orange-100", bg: "bg-orange-50", label: "text-orange-600", value: "text-orange-900", detail: "text-orange-700" },
    blue: { border: "border-blue-100", bg: "bg-blue-50", label: "text-blue-500", value: "text-blue-900", detail: "text-blue-600" },
    emerald: { border: "border-emerald-100", bg: "bg-emerald-50", label: "text-emerald-600", value: "text-emerald-900", detail: "text-emerald-700" }
  }[tone];

  return (
    <article className={`rounded-[1.75rem] border ${toneClasses.border} ${toneClasses.bg} p-5 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.45)]`}>
      <p className={`text-xs font-black uppercase tracking-[0.12em] ${toneClasses.label}`}>{label}</p>
      <p className={`mt-2 text-3xl font-black ${toneClasses.value}`}>{value}</p>
      <p className={`mt-1 text-sm font-semibold ${toneClasses.detail}`}>{detail}</p>
    </article>
  );
}

function FieldLabel({ children }) {
  return <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">{children}</span>;
}

const inputClass =
  "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition placeholder:text-slate-400 focus:border-orange-300 focus:bg-white";

function Panel({ title, description, icon: Icon, children }) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.45)]">
      <div className="flex items-center gap-3">
        {Icon ? (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-orange-50 text-orange-600">
            <Icon className="h-5 w-5" />
          </span>
        ) : null}
        <div>
          <h3 className="text-2xl font-black text-slate-950">{title}</h3>
          {description ? <p className="mt-1 text-sm font-semibold text-slate-500">{description}</p> : null}
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function AdminJourneyPage() {
  useRequireAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [journey, setJourney] = useState([]);
  const [error, setError] = useState("");
  const [phaseForm, setPhaseForm] = useState(EMPTY_PHASE);
  const [stageForm, setStageForm] = useState(EMPTY_STAGE);
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentForm, setDocumentForm] = useState(EMPTY_DOCUMENT);
  const [documentFile, setDocumentFile] = useState(null);
  const [globalSources, setGlobalSources] = useState([]);
  const [globalSourcesLoading, setGlobalSourcesLoading] = useState(true);
  const [globalSourceFile, setGlobalSourceFile] = useState(null);
  const [globalSourceForm, setGlobalSourceForm] = useState(EMPTY_GLOBAL_SOURCE);

  const phases = useMemo(() => journey || [], [journey]);
  const stages = useMemo(
    () => phases.flatMap((phase) => (phase.stages || []).map((stage) => ({ ...stage, phase_name: phase.phase_name, phase_id: phase.id }))),
    [phases]
  );
  const activePhaseCount = useMemo(() => phases.filter((phase) => phase.is_active).length, [phases]);
  const activeStageCount = useMemo(() => stages.filter((stage) => stage.is_active).length, [stages]);

  const loadJourney = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listAdminJourney();
      setJourney(Array.isArray(data?.journey) ? data.journey : []);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to load journey.");
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async () => {
    setDocumentsLoading(true);
    try {
      const data = await listAdminStageDocuments();
      setDocuments(Array.isArray(data?.documents) ? data.documents : []);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to load stage documents.");
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
      setError(err?.response?.data?.detail || err?.message || "Unable to load global sources.");
    } finally {
      setGlobalSourcesLoading(false);
    }
  };

  useEffect(() => {
    loadJourney();
    loadDocuments();
    loadGlobalSources();
  }, []);

  const resetPhase = () => setPhaseForm(EMPTY_PHASE);
  const resetStage = () => setStageForm(EMPTY_STAGE);
  const resetDocument = () => {
    setDocumentForm(EMPTY_DOCUMENT);
    setDocumentFile(null);
  };
  const resetGlobalSource = () => {
    setGlobalSourceForm(EMPTY_GLOBAL_SOURCE);
    setGlobalSourceFile(null);
  };

  const savePhase = async (event) => {
    event?.preventDefault?.();
    setSaving(true);
    setError("");
    try {
      const payload = {
        phase_key: phaseForm.phase_key,
        phase_order: Number(phaseForm.phase_order || 1),
        phase_name: phaseForm.phase_name,
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
      resetPhase();
      await loadJourney();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to save phase.");
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
        is_active: Boolean(stageForm.is_active)
      };
      if (stageForm.id) {
        await updateAdminJourneyStage(stageForm.id, payload);
      } else {
        await createAdminJourneyStage(payload);
      }
      resetStage();
      await loadJourney();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to save stage.");
    } finally {
      setSaving(false);
    }
  };

  const editPhase = (phase) => setPhaseForm({ ...phase });
  const editStage = (stage) => setStageForm({ ...stage, phase_id: stage.phase_id });

  const removePhase = async (phase) => {
    if (!window.confirm(`Delete phase "${phase.phase_name}"? This also removes its stages.`)) return;
    setSaving(true);
    try {
      await deleteAdminJourneyPhase(phase.id);
      await loadJourney();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to delete phase.");
    } finally {
      setSaving(false);
    }
  };

  const removeStage = async (stage) => {
    if (!window.confirm(`Delete stage "${stage.stage_name}"?`)) return;
    setSaving(true);
    try {
      await deleteAdminJourneyStage(stage.id);
      await loadJourney();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to delete stage.");
    } finally {
      setSaving(false);
    }
  };

  const saveDocument = async (event) => {
    event?.preventDefault?.();
    if (!Number(documentForm.stage_id)) {
      setError("Pick a stage before saving the document.");
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
          formData.append("stage_id", String(Number(documentForm.stage_id)));
          formData.append("title", documentForm.title);
          formData.append("document_type", documentForm.document_type);
          formData.append("tags", documentForm.tags);
          formData.append("language", documentForm.language);
          formData.append("is_active", String(Boolean(documentForm.is_active)));
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
          source_url: documentForm.source_type === "url" ? documentForm.source_url : "",
          content_text: documentForm.source_type === "manual" ? documentForm.content_text : "",
          tags: documentForm.tags,
          language: documentForm.language,
          is_active: Boolean(documentForm.is_active)
        };
        if (documentForm.id) {
          await updateAdminStageDocument(documentForm.id, payload);
        } else {
          await createAdminStageDocument(payload);
        }
      }
      resetDocument();
      await loadDocuments();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to save document.");
    } finally {
      setSaving(false);
    }
  };

  const editDocument = (doc) => {
    setDocumentForm({
      ...doc,
      stage_id: doc.stage_id,
      tags: Array.isArray(doc.tags) ? doc.tags.join(", ") : doc.tags || ""
    });
    setDocumentFile(null);
  };

  const removeDocument = async (doc) => {
    if (!window.confirm(`Delete document "${doc.title}"?`)) return;
    setSaving(true);
    try {
      await deleteAdminStageDocument(doc.id);
      await loadDocuments();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to delete document.");
    } finally {
      setSaving(false);
    }
  };

  const saveGlobalSource = async (event) => {
    event?.preventDefault?.();
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
          formData.append("is_active", String(Boolean(globalSourceForm.is_active)));
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
          source_url: globalSourceForm.source_type === "url" ? globalSourceForm.source_url : "",
          content_text: globalSourceForm.source_type === "manual" ? globalSourceForm.content_text : "",
          tags: globalSourceForm.tags,
          is_active: Boolean(globalSourceForm.is_active)
        };
        if (globalSourceForm.id) {
          await updateAdminGlobalSource(globalSourceForm.id, payload);
        } else {
          await createAdminGlobalSource(payload);
        }
      }
      resetGlobalSource();
      await loadGlobalSources();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to save global source.");
    } finally {
      setSaving(false);
    }
  };

  const editGlobalSource = (source) => {
    setGlobalSourceForm({
      ...source,
      tags: Array.isArray(source.tags) ? source.tags.join(", ") : source.tags || ""
    });
    setGlobalSourceFile(null);
  };

  const removeGlobalSource = async (source) => {
    if (!window.confirm(`Delete global source "${source.title}"?`)) return;
    setSaving(true);
    try {
      await deleteAdminGlobalSource(source.id);
      await loadGlobalSources();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to delete global source.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(255,127,41,0.14),transparent_30%),linear-gradient(135deg,#f8fafc_0%,#ffffff_50%,#fff7ed_100%)] px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
        <header className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.45)] sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <button
                type="button"
                onClick={() => router.push("/adminDashboard")}
                className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-600 shadow-sm transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Admin Console
              </button>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-500">Startup Journey Builder</p>
              <h2 className="mt-2 text-4xl font-black tracking-tight text-slate-950">Create startup phases and stages.</h2>
              <p className="mt-3 max-w-3xl text-base font-semibold leading-7 text-slate-500">
                This panel maps directly to the <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm text-slate-700">journey_phases</code>,{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm text-slate-700">journey_stages</code>,{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm text-slate-700">stage_documents</code>, and{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm text-slate-700">knowledge_sources</code> tables that power the Startup
                Journey workspace. Add phases like Validation or Pitch, add ordered stages under each phase, attach reference documents to a stage,
                and add global sources that every phase and stage can draw on.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 self-start rounded-full bg-orange-50 px-4 py-2 text-sm font-black text-orange-700">
              <Sparkles className="h-4 w-4" />
              Live database
            </span>
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
          <Panel title="Phases" description="Top-level journey steps, ordered by phase_order." icon={Layers}>
            <form onSubmit={savePhase} className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <FieldLabel>Phase Key</FieldLabel>
                  <input
                    value={phaseForm.phase_key}
                    onChange={(e) => setPhaseForm({ ...phaseForm, phase_key: e.target.value })}
                    placeholder="validation"
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-2">
                  <FieldLabel>Order</FieldLabel>
                  <input
                    type="number"
                    value={phaseForm.phase_order}
                    onChange={(e) => setPhaseForm({ ...phaseForm, phase_order: e.target.value })}
                    className={inputClass}
                  />
                </label>
              </div>
              <label className="grid gap-2">
                <FieldLabel>Phase Name</FieldLabel>
                <input
                  value={phaseForm.phase_name}
                  onChange={(e) => setPhaseForm({ ...phaseForm, phase_name: e.target.value })}
                  placeholder="e.g. Idea Validation"
                  className={inputClass}
                />
              </label>
              <label className="grid gap-2">
                <FieldLabel>Description</FieldLabel>
                <textarea
                  value={phaseForm.phase_description}
                  onChange={(e) => setPhaseForm({ ...phaseForm, phase_description: e.target.value })}
                  rows={3}
                  className={inputClass}
                  placeholder="What this phase covers..."
                />
              </label>
              <label className="grid gap-2">
                <FieldLabel>Objective</FieldLabel>
                <textarea
                  value={phaseForm.phase_objective}
                  onChange={(e) => setPhaseForm({ ...phaseForm, phase_objective: e.target.value })}
                  rows={3}
                  className={inputClass}
                  placeholder="What the student should achieve..."
                />
              </label>
              <label className="grid gap-2">
                <FieldLabel>Intended Audience</FieldLabel>
                <input
                  value={phaseForm.intended_audience}
                  onChange={(e) => setPhaseForm({ ...phaseForm, intended_audience: e.target.value })}
                  placeholder="e.g. first-time founders"
                  className={inputClass}
                />
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(phaseForm.is_active)}
                  onChange={(e) => setPhaseForm({ ...phaseForm, is_active: e.target.checked })}
                  className="h-4 w-4"
                />
                Active
              </label>
              <div className="flex flex-wrap gap-3">
                <button
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

            <div className="mt-6 space-y-3 border-t border-slate-100 pt-6">
              {loading ? (
                <p className="text-sm font-semibold text-slate-500">Loading phases...</p>
              ) : phases.length ? (
                phases.map((phase) => (
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
                          <p className="mt-2 text-sm font-medium text-slate-600">{phase.phase_description || phase.phase_objective}</p>
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
                <p className="text-sm font-semibold text-slate-500">No phases yet — create the first one above.</p>
              )}
            </div>
          </Panel>

          <Panel title="Stages" description="Ordered steps within a phase, shown to students one at a time." icon={ListChecks}>
            <form onSubmit={saveStage} className="grid gap-4">
              <label className="grid gap-2">
                <FieldLabel>Phase</FieldLabel>
                <select
                  value={stageForm.phase_id}
                  onChange={(e) => setStageForm({ ...stageForm, phase_id: e.target.value })}
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
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <FieldLabel>Stage Key</FieldLabel>
                  <input
                    value={stageForm.stage_key}
                    onChange={(e) => setStageForm({ ...stageForm, stage_key: e.target.value })}
                    placeholder="define_problem"
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-2">
                  <FieldLabel>Order</FieldLabel>
                  <input
                    type="number"
                    value={stageForm.stage_order}
                    onChange={(e) => setStageForm({ ...stageForm, stage_order: e.target.value })}
                    className={inputClass}
                  />
                </label>
              </div>
              <label className="grid gap-2">
                <FieldLabel>Stage Name</FieldLabel>
                <input
                  value={stageForm.stage_name}
                  onChange={(e) => setStageForm({ ...stageForm, stage_name: e.target.value })}
                  placeholder="e.g. Define the problem"
                  className={inputClass}
                />
              </label>
              <label className="grid gap-2">
                <FieldLabel>Context</FieldLabel>
                <textarea
                  value={stageForm.stage_context}
                  onChange={(e) => setStageForm({ ...stageForm, stage_context: e.target.value })}
                  rows={3}
                  className={inputClass}
                  placeholder="Background the AI mentor should know..."
                />
              </label>
              <label className="grid gap-2">
                <FieldLabel>Objective</FieldLabel>
                <textarea
                  value={stageForm.stage_objective}
                  onChange={(e) => setStageForm({ ...stageForm, stage_objective: e.target.value })}
                  rows={2}
                  className={inputClass}
                />
              </label>
              <label className="grid gap-2">
                <FieldLabel>Expected Outcome</FieldLabel>
                <textarea
                  value={stageForm.expected_outcome}
                  onChange={(e) => setStageForm({ ...stageForm, expected_outcome: e.target.value })}
                  rows={2}
                  className={inputClass}
                />
              </label>
              <label className="grid gap-2">
                <FieldLabel>Readiness Criteria</FieldLabel>
                <textarea
                  value={stageForm.readiness_criteria}
                  onChange={(e) => setStageForm({ ...stageForm, readiness_criteria: e.target.value })}
                  rows={2}
                  className={inputClass}
                  placeholder="What must be true to move on..."
                />
              </label>
              <label className="grid gap-2">
                <FieldLabel>Recommended Actions</FieldLabel>
                <textarea
                  value={stageForm.recommended_actions}
                  onChange={(e) => setStageForm({ ...stageForm, recommended_actions: e.target.value })}
                  rows={2}
                  className={inputClass}
                />
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(stageForm.is_active)}
                  onChange={(e) => setStageForm({ ...stageForm, is_active: e.target.checked })}
                  className="h-4 w-4"
                />
                Active
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-[0_14px_30px_-16px_rgba(15,23,42,0.8)] transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {stageForm.id ? "Update Stage" : "Create Stage"}
                </button>
                <button
                  type="button"
                  onClick={resetStage}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Reset
                </button>
              </div>
            </form>

            <div className="mt-6 space-y-3 border-t border-slate-100 pt-6">
              {loading ? (
                <p className="text-sm font-semibold text-slate-500">Loading stages...</p>
              ) : stages.length ? (
                stages.map((stage) => (
                  <div key={stage.id} className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-black text-slate-950">{stage.stage_name}</p>
                          {!stage.is_active ? (
                            <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-600">
                              Inactive
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {stage.phase_name} &middot; {stage.stage_key} &middot; order {stage.stage_order}
                        </p>
                        {stage.stage_context || stage.expected_outcome ? (
                          <p className="mt-2 text-sm font-medium text-slate-600">{stage.stage_context || stage.expected_outcome}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          onClick={() => editStage(stage)}
                          className="rounded-full border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeStage(stage)}
                          className="rounded-full border border-rose-200 bg-white p-2 text-rose-600 transition hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm font-semibold text-slate-500">No stages yet — pick a phase above and add the first stage.</p>
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
                      {(phase.stages || []).map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.stage_name}
                        </option>
                      ))}
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
      </div>
    </main>
  );
}
