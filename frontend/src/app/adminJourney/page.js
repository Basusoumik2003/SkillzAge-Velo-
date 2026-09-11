"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
  listAdminServices,
  listAdminStageDocuments,
  listAdminStartupMentors,
  updateAdminGlobalSource,
  updateAdminJourneyPhase,
  updateAdminJourneyStage,
  updateAdminStageDocument,
  uploadAdminGlobalSource,
  uploadAdminStageDocument
} from "@/lib/startup";

import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import DashboardTab from "./components/DashboardTab";
import PhasesTab from "./components/PhasesTab";
import StagesTab from "./components/StagesTab";
import StageDocumentsTab from "./components/StageDocumentsTab";
import GlobalSourcesTab from "./components/GlobalSourcesTab";
import SettingsTab from "./components/SettingsTab";

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
  search_focus: "",
  requires_deliverables: false,
  pass_score_threshold: 60,
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

const EMPTY_GLOBAL_SOURCE = {
  id: null,
  title: "",
  source_type: "manual",
  source_url: "",
  content_text: "",
  tags: "",
  is_active: true
};

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

      // Strip the token out of the URL/history now that it's saved -
      // otherwise it sits in the address bar (and any bookmark) forever
      // and can silently re-authenticate a session after logout.
      router.replace("/adminJourney");
    } catch (error) {
      console.error(
        "[ADMIN AUTH] Failed to store admin token:",
        error
      );
    }
  }, [router, searchParams]);

  useRequireAuth();

  const handleLogout = () => {
    try {
      window.localStorage.removeItem("skillzage_admin_token");
      window.localStorage.removeItem("internlabs_admin_token");
    } catch (error) {
      console.error("[ADMIN AUTH] Failed to clear admin session:", error);
    }

    router.replace("/login");
  };

  const [activeTab, setActiveTab] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [mentors, setMentors] = useState([]);
  const [journey, setJourney] = useState([]);
  const [services, setServices] = useState([]);
  const [journeyStats, setJourneyStats] = useState({});
  const [viewJourneyId, setViewJourneyId] = useState("");

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

  // Switching tabs clears the search box so a stale filter cannot hide content.
  const changeTab = (tabKey) => {
    setActiveTab(tabKey);
    setSearchQuery("");
    setSidebarOpen(false);
  };

  const goToJourneyPhases = async (journeyId) => {
    await loadJourney(String(journeyId));
    changeTab("phases");
  };

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
      setError(err?.response?.data?.detail || err?.message || "Unable to load phases.");
    } finally {
      setLoading(false);
    }
  };

  const loadServices = async () => {
    try {
      const data = await listAdminServices();
      const list = Array.isArray(data?.services)
        ? data.services
            .map((service) => ({
              id: service.serviceId || service._id || service.id,
              serviceName: service.serviceName || service.name || "Service",
              serviceCode: service.serviceCode || "",
              journeyId: service.journeyId || service.journey_id || "",
              active: service.active !== false
            }))
            .filter((service) => service.active && service.journeyId)
        : [];

      setServices(list);

      if (list.length > 0) {
        const firstJourneyId = String(list[0].journeyId);
        setViewJourneyId(firstJourneyId);
        await loadJourney(firstJourneyId);
      }

      await loadServiceStats(list);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to load services.");
    }
  };

  // Dashboard-only aggregation: the nested phase/stage payload only ever
  // covers the currently-viewed journey, so fetch each service's journey tree.
  const loadServiceStats = async (list) => {
    try {
      const entries = await Promise.all(
        (list || []).map(async (service) => {
          const data = await listAdminJourney(service.journeyId);
          const servicePhases = Array.isArray(data?.journey) ? data.journey : [];
          const stageCount = servicePhases.reduce((sum, phase) => sum + (phase.stages || []).length, 0);
          const activeStageCount = servicePhases.reduce(
            (sum, phase) => sum + (phase.stages || []).filter((stage) => stage.is_active).length,
            0
          );
          return [service.id, { phaseCount: servicePhases.length, stageCount, activeStageCount, journeyId: service.journeyId }];
        })
      );
      setJourneyStats(Object.fromEntries(entries));
    } catch {
      // Non-fatal — the dashboard just shows "-" for counts it couldn't fetch.
    }
  };

  const loadDocuments = async () => {
    setDocumentsLoading(true);

    try {
      const data = await listAdminStageDocuments();
      setDocuments(Array.isArray(data?.documents) ? data.documents : []);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to load documents.");
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

  const loadMentors = async () => {
    try {
      const data = await listAdminStartupMentors();
      setMentors(Array.isArray(data?.mentors) ? data.mentors : []);
    } catch {
      // Non-fatal — agent_key selects just fall back to a free-text feel with no options.
    }
  };

  useEffect(() => {
    loadServices();
    loadMentors();
    loadDocuments();
    loadGlobalSources();
  }, []);

  const resetPhase = () => setPhaseForm(EMPTY_PHASE);

  // Phase order is unique per journey (journey_id, phase_order), so a form
  // that always defaults to 1 collides as soon as a journey already has a
  // phase 1. Look up that journey's existing phases and suggest the next
  // free order instead of leaving the stale default in place.
  const suggestNextPhaseOrder = async (journeyId) => {
    try {
      const data = await listAdminJourney(journeyId);
      const existingPhases = Array.isArray(data?.journey) ? data.journey : [];
      const maxOrder = existingPhases.reduce((max, phase) => Math.max(max, Number(phase.phase_order) || 0), 0);
      setPhaseForm((previous) =>
        String(previous.journey_id) === String(journeyId) ? { ...previous, phase_order: maxOrder + 1 } : previous
      );
    } catch {
      // Non-fatal — the admin can still type an order manually.
    }
  };

  const resetStage = () => setStageForm(EMPTY_STAGE);
  const resetDocument = () => {
    setDocumentForm(EMPTY_DOCUMENT);
    setDocumentFile(null);
  };
  const resetGlobalSource = () => {
    setGlobalSourceForm(EMPTY_GLOBAL_SOURCE);
    setGlobalSourceFile(null);
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
        search_focus: stageForm.search_focus,
        requires_deliverables: Boolean(stageForm.requires_deliverables),
        pass_score_threshold: Number(stageForm.pass_score_threshold || 60),
        is_active: Boolean(stageForm.is_active),
        mentor_id: stageForm.mentor_id ? Number(stageForm.mentor_id) : null
      };

      const { stage: savedStage } = stageForm.id
        ? await updateAdminJourneyStage(stageForm.id, payload)
        : await createAdminJourneyStage(payload);

      // Keep the (now-saved) stage loaded instead of resetting to a blank
      // form - a brand-new stage has no id until this point, and the
      // Deliverables editor below needs a real stage_id to do anything.
      loadStageIntoForm(savedStage);
      await loadJourney(viewJourneyId);
      loadServiceStats(services);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to save stage.");
    } finally {
      setSaving(false);
    }
  };

  const savePhase = async (event) => {
    event.preventDefault();

    if (!phaseForm.journey_id) {
      setError("Please select a service.");
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
      loadServiceStats(services);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to save phase.");
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
      mentor_id: mentorFromAgentKey?.id ? String(mentorFromAgentKey.id) : stage.mentor_id ? String(stage.mentor_id) : ""
    });
  };

  const editStage = (stage) => {
    loadStageIntoForm(stage);
  };

  const removePhase = async (phase) => {
    if (!window.confirm(`Delete phase "${phase.phase_name}"? This also removes its stages.`)) {
      return;
    }

    setSaving(true);

    try {
      await deleteAdminJourneyPhase(phase.id);
      await loadJourney(viewJourneyId);
      loadServiceStats(services);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to delete phase.");
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
      loadServiceStats(services);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to delete stage.");
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

  const editDocument = (document) => {
    setDocumentForm({
      ...EMPTY_DOCUMENT,
      ...document,
      stage_id: String(document.stage_id || ""),
      tags: Array.isArray(document.tags) ? document.tags.join(", ") : document.tags || ""
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
      setError(err?.response?.data?.detail || err?.message || "Unable to delete document.");
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
      ...EMPTY_GLOBAL_SOURCE,
      ...source,
      tags: Array.isArray(source.tags) ? source.tags.join(", ") : source.tags || ""
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
      setError(err?.response?.data?.detail || err?.message || "Unable to delete global source.");
    } finally {
      setSaving(false);
    }
  };

  // Real, derived "needs attention" list for the bell — never fabricated
  // counts. Scoped to what's actually loaded on the client: inactive items
  // in the currently-viewed journey, plus inactive documents/sources (those
  // two lists are global, so they're always complete).
  const attentionItems = useMemo(() => {
    const items = [];
    phases
      .filter((phase) => !phase.is_active)
      .forEach((phase) => items.push({ title: phase.phase_name, detail: "Phase is inactive" }));
    stages
      .filter((stage) => !stage.is_active)
      .forEach((stage) => items.push({ title: stage.stage_name, detail: "Stage is inactive" }));
    documents
      .filter((doc) => !doc.is_active)
      .forEach((doc) => items.push({ title: doc.title, detail: "Stage document is inactive" }));
    globalSources
      .filter((source) => !source.is_active)
      .forEach((source) => items.push({ title: source.title, detail: "Global source is inactive" }));
    return items;
  }, [phases, stages, documents, globalSources]);

  const sidebarCounts = {
    phases: phases.length,
    stages: stages.length,
    "stage-documents": documents.length,
    "global-sources": globalSources.length,
    mentors: mentors.length
  };

  return (
    <main className="flex min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(255,127,41,0.08),transparent_30%),linear-gradient(135deg,#f8fafc_0%,#ffffff_50%,#fff7ed_100%)] text-slate-900">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={changeTab}
        counts={sidebarCounts}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-h-screen flex-1 flex-col">
        <TopBar
          activeTab={activeTab}
          onOpenSidebar={() => setSidebarOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          attentionItems={attentionItems}
          onLogout={handleLogout}
        />

        <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {error}
              </div>
            ) : null}

            {activeTab === "dashboard" ? (
              <DashboardTab
                services={services}
                serviceStats={journeyStats}
                documents={documents}
                globalSources={globalSources}
                mentors={mentors}
                loading={loading}
                onNavigate={changeTab}
                onViewJourney={goToJourneyPhases}
              />
            ) : null}

            {activeTab === "phases" ? (
              <PhasesTab
                services={services}
                viewJourneyId={viewJourneyId}
                loadJourney={loadJourney}
                phases={phases}
                phaseForm={phaseForm}
                setPhaseForm={setPhaseForm}
                savePhase={savePhase}
                editPhase={editPhase}
                removePhase={removePhase}
                resetPhase={resetPhase}
                suggestNextPhaseOrder={suggestNextPhaseOrder}
                saving={saving}
                loading={loading}
                searchQuery={searchQuery}
              />
            ) : null}

            {activeTab === "stages" ? (
              <StagesTab
                phases={phases}
                stages={stages}
                mentors={mentors}
                stageForm={stageForm}
                setStageForm={setStageForm}
                saveStage={saveStage}
                editStage={editStage}
                removeStage={removeStage}
                resetStage={resetStage}
                saving={saving}
                loading={loading}
                searchQuery={searchQuery}
              />
            ) : null}

            {activeTab === "stage-documents" ? (
              <StageDocumentsTab
                phases={phases}
                documents={documents}
                documentsLoading={documentsLoading}
                documentForm={documentForm}
                setDocumentForm={setDocumentForm}
                documentFile={documentFile}
                setDocumentFile={setDocumentFile}
                saveDocument={saveDocument}
                editDocument={editDocument}
                removeDocument={removeDocument}
                resetDocument={resetDocument}
                saving={saving}
                searchQuery={searchQuery}
              />
            ) : null}

            {activeTab === "global-sources" ? (
              <GlobalSourcesTab
                globalSources={globalSources}
                globalSourcesLoading={globalSourcesLoading}
                globalSourceForm={globalSourceForm}
                setGlobalSourceForm={setGlobalSourceForm}
                globalSourceFile={globalSourceFile}
                setGlobalSourceFile={setGlobalSourceFile}
                saveGlobalSource={saveGlobalSource}
                editGlobalSource={editGlobalSource}
                removeGlobalSource={removeGlobalSource}
                resetGlobalSource={resetGlobalSource}
                saving={saving}
                searchQuery={searchQuery}
              />
            ) : null}

            {activeTab === "mentors" ? <MentorManager onMentorsChanged={loadMentors} /> : null}

            {activeTab === "settings" ? <SettingsTab /> : null}
          </div>
        </div>
      </div>
    </main>
  );
}
