"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStartupWorkspace, saveStartupProfile, submitStartupQuery } from "@/lib/startup";
import useRequireAuth from "@/lib/useRequireAuth";

const EMPTY_PROFILE = {
  age: "",
  education_level: "",
  location_text: "",
  country: "",
  state_region: "",
  city: "",
  skills: "",
  interests: "",
  available_time_hours_per_week: "",
  available_resources: "",
  participation_mode: "individual",
  current_idea_text: "",
  startup_stage: "no_idea",
  preferred_language: "english",
  goal_type: "commercial",
  profile_summary: "",
  readiness_score: 0,
  idea_title: "",
  problem_statement: "",
  solution_summary: "",
  target_users: "",
  industry_tags: ""
};

function mapMessages(rows = []) {
  return rows.map((row) => ({
    role: row.role,
    content: row.content,
    created_at: row.created_at
  }));
}

export default function useStartupWorkspaceController() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [sending, setSending] = useState(false);
  const [workspace, setWorkspace] = useState({
    profile: null,
    journey: [],
    active_phase: null,
    active_stage: null,
    session_id: null,
    context: { stage_documents: [], knowledge_sources: [], recent_messages: [], memory_summaries: [] }
  });
  const [profileDraft, setProfileDraft] = useState(EMPTY_PROFILE);
  const [activePhaseId, setActivePhaseId] = useState(null);
  const [activeStageId, setActiveStageId] = useState(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [browserQueries, setBrowserQueries] = useState([]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState(null);
  const [stageDocuments, setStageDocuments] = useState([]);
  const [knowledgeSources, setKnowledgeSources] = useState([]);

  const selectedPhase = useMemo(
    () => workspace.journey.find((phase) => Number(phase.id) === Number(activePhaseId)) || workspace.active_phase || workspace.journey[0] || null,
    [activePhaseId, workspace.active_phase, workspace.journey]
  );

  const selectedStage = useMemo(
    () => selectedPhase?.stages?.find((stage) => Number(stage.id) === Number(activeStageId)) || workspace.active_stage || selectedPhase?.stages?.[0] || null,
    [activeStageId, selectedPhase, workspace.active_stage]
  );

  const contextSummary = useMemo(() => {
    const docs = workspace.context?.stage_documents?.length || 0;
    const sources = workspace.context?.knowledge_sources?.length || 0;
    const memories = workspace.context?.memory_summaries?.length || 0;
    return { docs, sources, memories };
  }, [workspace.context]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    getStartupWorkspace()
      .then((data) => {
        if (cancelled) return;
        setWorkspace(data);
        setActivePhaseId(data?.active_phase?.id || data?.journey?.[0]?.id || null);
        setActiveStageId(data?.active_stage?.id || data?.journey?.[0]?.stages?.[0]?.id || null);
        setMessages(mapMessages(data?.context?.recent_messages || []));
        setStageDocuments(Array.isArray(data?.context?.stage_documents) ? data.context.stage_documents : []);
        setKnowledgeSources(Array.isArray(data?.context?.knowledge_sources) ? data.context.knowledge_sources : []);
        setProfileDraft((prev) => ({
          ...EMPTY_PROFILE,
          age: data?.profile?.age ?? "",
          education_level: data?.profile?.education_level || "",
          location_text: data?.profile?.location_text || "",
          country: data?.profile?.country || "",
          state_region: data?.profile?.state_region || "",
          city: data?.profile?.city || "",
          skills: data?.profile?.skills || "",
          interests: data?.profile?.interests || "",
          available_time_hours_per_week: data?.profile?.available_time_hours_per_week ?? "",
          available_resources: data?.profile?.available_resources || "",
          participation_mode: data?.profile?.participation_mode || "individual",
          current_idea_text: data?.profile?.current_idea_text || "",
          startup_stage: data?.profile?.startup_stage || "no_idea",
          preferred_language: data?.profile?.preferred_language || "english",
          goal_type: data?.profile?.goal_type || "commercial",
          profile_summary: data?.profile?.profile_summary || "",
          readiness_score: data?.profile?.readiness_score ?? 0,
          idea_title: data?.profile?.idea_title || "",
          problem_statement: data?.profile?.problem_statement || "",
          solution_summary: data?.profile?.solution_summary || "",
          target_users: data?.profile?.target_users || "",
          industry_tags: data?.profile?.industry_tags || ""
        }));
        setAnswer("");
        setError("");
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.detail || err?.message || "Unable to load startup workspace.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const updateProfileField = (field, value) => {
    setProfileDraft((current) => ({ ...current, [field]: value }));
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    setError("");
    try {
      const payload = {
        ...profileDraft,
        age: profileDraft.age === "" ? null : Number(profileDraft.age),
        available_time_hours_per_week: profileDraft.available_time_hours_per_week === "" ? 0 : Number(profileDraft.available_time_hours_per_week),
        readiness_score: Number(profileDraft.readiness_score || 0)
      };
      const data = await saveStartupProfile(payload);
      setWorkspace((current) => ({
        ...current,
        profile: data.profile ? { ...data.profile, ...(data.idea || {}) } : current.profile,
        journey: current.journey
      }));
      return data;
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to save profile.");
      throw err;
    } finally {
      setSavingProfile(false);
    }
  };

  const sendQuestion = async (value) => {
    const text = String(value || question).trim();
    if (!text) return;
    setSending(true);
    setError("");
    try {
      const nextMessages = [...messages, { role: "user", content: text }];
      setMessages(nextMessages);
      setQuestion("");
      const result = await submitStartupQuery({
        question: text,
        phase_id: selectedPhase?.id || null,
        stage_id: selectedStage?.id || null,
        session_id: workspace.session_id || null
      });
      setWorkspace((current) => ({ ...current, session_id: result.session_id || current.session_id }));
      setAnswer(result.answer || "");
      setMessages([...nextMessages, { role: "assistant", content: result.answer || "" }]);
      setBrowserQueries(Array.isArray(result.browser_search_queries) ? result.browser_search_queries : []);
      setStageDocuments(Array.isArray(result.retrieved_context?.stage_documents) ? result.retrieved_context.stage_documents : []);
      setKnowledgeSources(Array.isArray(result.retrieved_context?.knowledge_sources) ? result.retrieved_context.knowledge_sources : []);
      setLastResult(result);
      return result;
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to answer the question.");
      throw err;
    } finally {
      setSending(false);
    }
  };

  return {
    ready,
    loading,
    savingProfile,
    sending,
    workspace,
    profileDraft,
    updateProfileField,
    saveProfile,
    selectedPhase,
    setSelectedPhaseId: setActivePhaseId,
    selectedStage,
    setSelectedStageId: setActiveStageId,
    question,
    setQuestion,
    sendQuestion,
    messages,
    browserQueries,
    answer,
    error,
    router,
    lastResult,
    contextSummary,
    stageDocuments,
    knowledgeSources
  };
}
