"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { disclaimerAccepted } from "@/components/DisclaimerModal";
import { getMentorChatHistory, reviewStageDocument, saveLocalChatMessage, sendMentorMessage } from "@/lib/chat";
import { getStartupMentors, getStartupWorkspace } from "@/lib/startup";
import {
  completeDashboardTask,
  getCatalogProject,
  getDashboardMentors,
  getDashboardProgress,
  getDashboardStageProgress,
  getWorkspaceStatus,
  markDashboardStageDocumentReviewFailed,
  uploadDashboardStageDocument,
  updateDashboardProgress,
  updateDashboardStageProgress
} from "@/lib/dashboard";
import { useToast } from "@/components/ToastProvider";
import { getStoredProfile, getStoredUser } from "@/lib/authStorage";
import { getProfile, resolveAuthAssetUrl } from "@/lib/profile";
import usePresenceHeartbeat from "@/lib/usePresenceHeartbeat";

const AGENT_LABELS = {
  pm_agent: "Project Manager",
  business_analyst_agent: "Business Analyst",
  team_lead_agent: "Technical Architect",
  dev_agent: "UI/UX Specialist",
  marketing_lead_agent: "Marketing Lead",
  customer_experience_agent: "Customer Experience Specialist",
  qa_agent: "Frontend Engineering Lead",
  devops_agent: "Evaluation Reviewer",
  mentor_agent: "Evaluation Reviewer",
  startup_mentor: "Startup Mentor"
};

const STAGE_PROMPT_INITIAL_DELAY_MS = 1000;
const STAGE_PROMPT_MESSAGE_GAP_MS = 1600;
const MIN_MENTOR_THINKING_MS = 1200;
const MENTOR_RETRY_MIN_MINUTES = 1;
const MENTOR_RETRY_MAX_MINUTES = 3;
const MENTOR_BACK_MESSAGE = "I am back now. Let me answer your question.";
const DOCUMENT_REVIEW_FAILED_MESSAGE = "Your document was uploaded, but the review could not be completed. Please re-upload the document or try again manually when you are ready.";
const STAGE_PROMPT_SEEN_VERSION = "v2";
const WORKSPACE_TOUR_SEEN_KEY = "internlabs_workspace_tour_seen_v1";
const STAGE_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;
const STAGE_DOCUMENT_ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
  ".txt", ".csv", ".zip", ".png", ".jpg", ".jpeg", ".webp"
]);

const WORKSPACE_AGENT_ACCENTS = [
  "from-sky-500 to-blue-700",
  "from-violet-500 to-fuchsia-600",
  "from-emerald-500 to-teal-700",
  "from-amber-500 to-orange-600",
  "from-slate-700 to-slate-950"
];

const DEMO_WORKSPACE_TITLE = "Trial Workspace";

function createDemoWorkspaceProject(title = DEMO_WORKSPACE_TITLE) {
  const projectTitle = String(title || DEMO_WORKSPACE_TITLE).trim() || DEMO_WORKSPACE_TITLE;
  return {
    title: projectTitle,
    is_demo_project: true,
    company_profile_text:
      "This is a local demo workspace. It works without backend login so you can explore the UI, stages, chat flow, and task layout immediately.",
    introduction_document: "Open the workspace directly and try the guided trial flow without connecting any backend services.",
    introduction_document_url: "",
    demo_documents_by_id: {
      "1": {
        id: 1,
        document_name: "Trial reference brief",
        preview_url: "",
        download_url: "",
        description: "Sample context for the first trial stage."
      }
    },
    phase_timeline: {
      step_number: 1,
      due_at: "",
      days_left: 5
    },
    steps: [
      {
        step_order: 1,
        title: "Explore the brief",
        agent_key: "pm_agent",
        phase_context: "Review the sample brief and understand the workspace layout before you start working.",
        step_context:
          "Step 1: Explore the brief\n\nRead the trial project overview, get familiar with the task breakdown, and inspect the reference document.",
        duration_value: 1,
        duration_max_value: 2,
        duration_unit: "week",
        stages: [
          {
            title: "Read the project context",
            agent_key: "pm_agent",
            stage_context: "Look through the project overview and understand what this workspace is for.",
            objective: "Understand the demo flow.",
            deliverable: "A clear mental map of the workspace.",
            document_required: false,
            github_integration_required: false,
            demo_document_id: 1
          },
          {
            title: "Check the reference document",
            agent_key: "business_analyst_agent",
            stage_context: "Open the sample reference document and see how stage guidance is presented.",
            objective: "Learn how to review supporting material.",
            deliverable: "Notes from the reference brief.",
            document_required: false,
            github_integration_required: false,
            demo_document_id: 1
          }
        ]
      },
      {
        step_order: 2,
        title: "Plan the work",
        agent_key: "team_lead_agent",
        phase_context: "Turn the brief into a simple action plan and understand the stage progression.",
        step_context:
          "Step 2: Plan the work\n\nUse the workspace panels to see how tasks, sources, and assets are organised.",
        duration_value: 1,
        duration_max_value: 2,
        duration_unit: "week",
        stages: [
          {
            title: "Map the next actions",
            agent_key: "team_lead_agent",
            stage_context: "Identify the next things you would do in a real project.",
            objective: "Practice planning.",
            deliverable: "A small action list.",
            document_required: false,
            github_integration_required: false
          },
          {
            title: "Review the workflow",
            agent_key: "qa_agent",
            stage_context: "Look at the surrounding panels and understand how the UI is structured.",
            objective: "Understand the workflow rails.",
            deliverable: "Confirmation that the flow makes sense.",
            document_required: false,
            github_integration_required: false
          }
        ]
      },
      {
        step_order: 3,
        title: "Practice delivery",
        agent_key: "dev_agent",
        phase_context: "Use the final stage to simulate a delivery and see how completion feels.",
        step_context:
          "Step 3: Practice delivery\n\nTry the completion flow and observe how the workspace reacts when a stage is marked done.",
        duration_value: 1,
        duration_max_value: 2,
        duration_unit: "week",
        stages: [
          {
            title: "Prepare a response",
            agent_key: "dev_agent",
            stage_context: "Pretend you are preparing the final output for a client handoff.",
            objective: "Understand the delivery loop.",
            deliverable: "A simulated final response.",
            document_required: false,
            github_integration_required: false
          },
          {
            title: "Close the trial",
            agent_key: "mentor_agent",
            stage_context: "Finish the demo flow and see the end of the workspace journey.",
            objective: "Complete the trial flow.",
            deliverable: "A completed workspace walkthrough.",
            document_required: false,
            github_integration_required: false
          }
        ]
      }
    ]
  };
}


function labelForAgent(agentKey) {
  const key = String(agentKey || "").trim();
  return AGENT_LABELS[key] || "No data available";
}

function backendKeyForStageAgent(agentKey) {
  const key = String(agentKey || "").trim();
  if (key.startsWith("startup_")) return "startup_mentor";
  if (key === "qa_agent" || key === "devops_agent" || key === "mentor_agent") return "qa";
  if (key === "architect_agent" || key === "team_lead_agent") return "architect";
  if (key === "dev_agent" || key === "engineer_agent" || key === "marketing_lead_agent" || key === "customer_experience_agent") return "tech_lead";
  return "pm";
}

function findMentorForStage(workspaceAgents, stageAgentKey) {
  const exactKey = String(stageAgentKey || "").trim().toLowerCase();
  if (!exactKey) return null;
  return (workspaceAgents || []).find((agent) => String(agent.agent_key || "").trim().toLowerCase() === exactKey) || null;
}

function normalizeStageDocuments(source, fallback = {}) {
  const list = Array.isArray(source?.documents) ? source.documents : [];
  const docs = list
    .map((doc) => ({
      id: doc?.id ?? null,
      document_url: String(doc?.document_url || ""),
      document_name: String(doc?.document_name || ""),
      document_public_id: String(doc?.document_public_id || "")
    }))
    .filter((doc) => doc.document_url || doc.document_name);

  if (!docs.length && (source?.document_url || source?.document_name || fallback?.document_url || fallback?.document_name)) {
    docs.push({
      id: null,
      document_url: String(source?.document_url || fallback?.document_url || ""),
      document_name: String(source?.document_name || fallback?.document_name || ""),
      document_public_id: String(source?.document_public_id || fallback?.document_public_id || "")
    });
  }
  return docs;
}

function stageAgentName(agent, fallbackKey = "") {
  return String(agent?.name || agent?.role || labelForAgent(fallbackKey) || "No data available").trim() || "No data available";
}

function isGenericStageAgentName(agentName) {
  const normalized = String(agentName || "").trim().toLowerCase();
  return !normalized || ["internzbee crew", "internzbee", "mentor", "assistant", "project manager"].includes(normalized);
}

function displayStageAgentName(agentName, fallbackName = "No data available") {
  const raw = String(agentName || "").trim();
  const fallback = String(fallbackName || "No data available").trim() || "No data available";
  if (isGenericStageAgentName(raw)) {
    return fallback;
  }
  return raw;
}

function summarizeStageDocuments(documents = []) {
  const list = Array.isArray(documents) ? documents : [];
  return list
    .map((doc) => String(doc?.document_name || doc?.name || "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function isDemoDocumentRequest(text = "") {
  const value = String(text || "").toLowerCase();
  if (!value.trim()) return false;
  return (
    /\bdemo\s*(doc|docs|document|documents|file|files)\b/.test(value) ||
    /\breference\s*(doc|docs|document|documents|file|files)\b/.test(value) ||
    /\bsample\s*(doc|docs|document|documents|file|files)\b/.test(value)
  );
}

function validateStageDocumentFiles(files = []) {
  for (const file of files) {
    const name = String(file?.name || "");
    const lowerName = name.toLowerCase();
    const extension = lowerName.includes(".") ? lowerName.slice(lowerName.lastIndexOf(".")) : "";
    if (!STAGE_DOCUMENT_ALLOWED_EXTENSIONS.has(extension)) {
      return `${name || "This file"} is not a supported file type.`;
    }
    if (Number(file?.size || 0) > STAGE_DOCUMENT_MAX_BYTES) {
      return `${name || "This file"} is larger than 25 MB.`;
    }
  }
  return "";
}

function agentListKey(agent) {
  return String(agent?.id || agent?.agent_key || agent?.name || "").trim();
}

function uniqueAgents(agents = []) {
  const seen = new Set();
  return agents.filter((agent) => {
    const key = agentListKey(agent);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clampStep(step, total) {
  const max = Math.max(1, Number(total) || 1);
  return Math.min(max, Math.max(1, Number(step) || 1));
}

function createFallbackStage(title) {
  return {
    title: String(title || "Stage").trim() || "Stage",
    agent_key: "pm_agent",
    stage_context: "",
    objective: "",
    deliverable: "",
    github_integration_required: false
  };
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForMinimumThinking(startedAt) {
  const elapsed = Date.now() - Number(startedAt || 0);
  const remaining = MIN_MENTOR_THINKING_MS - elapsed;
  if (remaining > 0) await wait(remaining);
}

function createMentorRetryDelay() {
  const min = MENTOR_RETRY_MIN_MINUTES;
  const max = MENTOR_RETRY_MAX_MINUTES;
  const minutes = Math.floor(Math.random() * (max - min + 1)) + min;
  return {
    minutes,
    delayMs: minutes * 60 * 1000,
    message: "I am busy right now. Please wait here, I will be back with your reply."
  };
}

function normalizeDurationUnit(value) {
  const unit = String(value || "week").trim().toLowerCase();
  return unit.startsWith("day") ? "day" : "week";
}

function normalizeDurationValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(365, Math.round(n)));
}

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function parseDurationLine(line) {
  const match = String(line || "").match(/^duration:\s*(\d+)(?:\s*-\s*(\d+))?\s*(day|days|week|weeks)?\s*$/i);
  if (!match) return null;
  const min = normalizeDurationValue(match[1]);
  const max = normalizeDurationValue(match[2] || match[1]);
  return {
    duration_value: min,
    duration_max_value: Math.max(min, max),
    duration_unit: normalizeDurationUnit(match[3] || "week")
  };
}

function formatShortDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatPhaseDuration(point) {
  if (!point?.duration_defined) return null;
  const value = normalizeDurationValue(point.duration_value);
  const unit = normalizeDurationUnit(point.duration_unit);
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

function splitStageBlocks(stagesRaw) {
  const blocks = [];
  let current = [];
  String(stagesRaw || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .forEach((line) => {
      if (/^\d+\.\s+/.test(line) && current.length) {
        blocks.push(current.join("\n").trim());
        current = [];
      }
      current.push(line);
    });
  if (current.length) blocks.push(current.join("\n").trim());
  return blocks.filter(Boolean);
}

function parseStageBlockFields(blockLines = []) {
  const fields = {};
  let currentKey = "";
  const labelMap = {
    agent: "agent",
    context: "context",
    objective: "objective",
    deliverable: "deliverable",
    "document required": "document_required",
    "link submission required": "link_submission_required",
    "github integration required": "github_integration_required",
    "demo document id": "demo_document_id",
  };

  blockLines.slice(1).forEach((rawLine) => {
    const line = String(rawLine || "");
    const match = line.match(/^\s*([^:]+):\s*(.*)$/);
    const key = match ? labelMap[String(match[1] || "").trim().toLowerCase()] : "";
    if (key) {
      if (key === "demo_document_id") {
        if (!Array.isArray(fields.demo_document_ids)) fields.demo_document_ids = [];
        fields.demo_document_ids.push(String(match[2] || "").trim());
        currentKey = "";
        return;
      }
      fields[key] = String(match[2] || "").trim();
      currentKey = key;
      return;
    }
    if (currentKey && !["document_required", "link_submission_required", "github_integration_required"].includes(currentKey)) {
      fields[currentKey] = `${fields[currentKey] || ""}\n${line.trimEnd()}`.trim();
    }
  });

  return fields;
}
function parseStepContextWithStages(raw, fallbackTitle = "Stage") {
  const text = String(raw || "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const stagesIndex = lines.findIndex((l) => String(l || "").trim() === "Stages:");
  const durationLine = lines.map((line) => String(line || "").trim()).find((line) => /^duration:/i.test(line));
  const parsedDuration = parseDurationLine(durationLine);
  const contextLines = (stagesIndex === -1 ? lines : lines.slice(0, stagesIndex)).filter((line) => !/^duration:/i.test(String(line || "").trim()));
  if (stagesIndex === -1) {
    return { baseContext: contextLines.join("\n").trim(), ...parsedDuration, stages: [createFallbackStage(fallbackTitle)] };
  }

  const baseContext = contextLines.join("\n").trim();
  const stagesRaw = lines.slice(stagesIndex + 1).join("\n").trim();
  if (!stagesRaw) return { baseContext, ...parsedDuration, stages: [createFallbackStage(fallbackTitle)] };

  const blocks = splitStageBlocks(stagesRaw);
  const stages = blocks
    .map((block, index) => {
      const blockLines = block.split("\n");
      const header = String(blockLines[0] || "").trim();
      const headerMatch = header.match(/^\d+\.\s*(.*)$/);
      const title = (headerMatch ? headerMatch[1] : header).trim() || "No data available";
      const parsedFields = parseStageBlockFields(blockLines);
      const demoDocumentIds = (parsedFields.demo_document_ids || [])
        .map((id) => Number(String(id || "").trim()))
        .filter((id) => Number.isFinite(id) && id > 0);
      const demoDocumentId = demoDocumentIds[0] || null;

      return {
        title,
        agent_key: String(parsedFields.agent || "pm_agent").slice(0, 60) || "pm_agent",
        stage_context: String(parsedFields.context || "").trim(),
        objective: String(parsedFields.objective || "").trim(),
        deliverable: String(parsedFields.deliverable || "").trim(),
        document_required: /^(yes|true|1|required)$/i.test(String(parsedFields.document_required || "").trim()),
        link_submission_required: /^(yes|true|1|required)$/i.test(String(parsedFields.link_submission_required || "").trim()),
        github_integration_required: /^(yes|true|1|required)$/i.test(String(parsedFields.github_integration_required || "").trim()),
        demo_document_id: demoDocumentId,
        demo_document_ids: demoDocumentIds
      };
    })
    .filter((stage) => stage.title || stage.objective || stage.deliverable);

  return { baseContext, ...parsedDuration, stages: stages.length ? stages : [createFallbackStage(fallbackTitle)] };
}

function normalizeWorkspaceStages(stages = []) {
  const list = Array.isArray(stages) ? stages : [];
  return list.map((stage) => ({
    title: String(stage?.title || "").trim() || "No data available",
    agent_key: String(stage?.agent_key || "pm_agent").slice(0, 60) || "pm_agent",
    stage_context: String(stage?.stage_context || "").trim(),
    objective: String(stage?.objective || "").trim(),
    deliverable: String(stage?.deliverable || "").trim(),
    document_required: Boolean(stage?.document_required),
    link_submission_required: Boolean(stage?.link_submission_required),
    github_integration_required: Boolean(stage?.github_integration_required),
    demo_document_id: Number(stage?.demo_document_id) || null,
    demo_document_ids: Array.isArray(stage?.demo_document_ids)
      ? stage.demo_document_ids.map(Number).filter((id) => Number.isFinite(id) && id > 0)
      : (Number(stage?.demo_document_id) > 0 ? [Number(stage.demo_document_id)] : [])
  })).filter((stage) => stage.title || stage.objective || stage.deliverable || stage.stage_context);
}
function stageProgressKey(projectName, stepNumber, stageIndex) {
  return [String(projectName || "project"), `step-${stepNumber}`, `stage-${stageIndex + 1}`].join("::");
}

function normalizeProjectName(value) {
  return String(value || "").trim().toLowerCase();
}

function projectTitle(project) {
  return String(project?.project_name || project?.name || "").trim();
}

function pickWorkspaceProject(projects, selectedProject, options = {}) {
  const list = Array.isArray(projects) ? projects : [];
  const selectedName = normalizeProjectName(selectedProject);
  const preferSelected = Boolean(options?.preferSelected);
  if (preferSelected && selectedName) {
    const exactSelected = list.find((project) => normalizeProjectName(projectTitle(project)) === selectedName);
    if (exactSelected) return exactSelected;
  }
  const incompleteProjects = list.filter((project) => !project?.is_complete);
  const completedProjects = list.filter((project) => project?.is_complete);

  if (incompleteProjects.length) {
    return (
      incompleteProjects[0] ||
      null
    );
  }

  return (
    (selectedName ? list.find((project) => normalizeProjectName(projectTitle(project)) === selectedName) : null) ||
    completedProjects[0] ||
    list[0] ||
    null
  );
}

function normalizeHistoryMessages(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .map((item) => {
      const metadata = item.metadata || {};
      const content = item.content || item.message || "";
      const reviewStatus = String(metadata.document_review_status || "").toLowerCase();
      const reviewKind =
        reviewStatus === "rejected" || /^document review needs revision/i.test(String(content || ""))
          ? "review-rejected"
          : reviewStatus === "approved" || /^document review passed/i.test(String(content || ""))
            ? "review-approved"
            : metadata.kind || item.kind || "";
      // Restore document link from metadata so it persists across reloads
      const metaDocs = Array.isArray(metadata.documents) ? metadata.documents : [];
      const latestDoc = metaDocs.length ? metaDocs[metaDocs.length - 1] : null;
      return {
        role: item.role === "user" ? "user" : "assistant",
        agent: item.agent || item.agent_name || (item.role === "user" ? "You" : "Mentor"),
        content,
        kind: reviewKind,
        metadata,
        link_url: metadata.link_url || (latestDoc ? (latestDoc.document_url || latestDoc.preview_url || latestDoc.download_url || "") : ""),
        link_label: metadata.link_label || (latestDoc ? (latestDoc.document_name || "Open document") : ""),
        stage_key: metadata.stage_key || item.stage_key || ""
      };
    })
    .filter((item) => item.content);
}

function groupHistoryMessagesByStage(messages = []) {
  return messages.reduce((acc, item) => {
    const key = String(item.stage_key || "").trim();
    if (!key) return acc;
    const { stage_key: _stageKey, ...message } = item;
    if (!acc[key]) acc[key] = [];
    acc[key].push(message);
    return acc;
  }, {});
}

function findPendingMentorRequest(messages = []) {
  const list = Array.isArray(messages) ? messages : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const message = list[index] || {};
    if (message.role !== "assistant" || message.kind !== "mentor-busy") continue;
    const hasLaterMentorReply = list
      .slice(index + 1)
      .some((item) => item?.role === "assistant" && item?.kind !== "mentor-busy");
    if (hasLaterMentorReply) return null;
    for (let userIndex = index - 1; userIndex >= 0; userIndex -= 1) {
      const userMessage = list[userIndex] || {};
      if (userMessage.role !== "user") continue;
      return {
        message: String(userMessage.content || "").trim(),
        clientMessageId: String(userMessage.metadata?.client_message_id || "").trim()
      };
    }
    return null;
  }
  return null;
}

const CHAT_CACHE_PREFIX = "internlabs_workspace_chat_cache::";

function createClientMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function chatCacheKey(projectName) {
  const key = normalizeProjectName(projectName);
  return key ? `${CHAT_CACHE_PREFIX}${key}` : "";
}

function readChatCache(projectName) {
  const key = chatCacheKey(projectName);
  if (!key || typeof window === "undefined") return null;
  try {
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    if (!cached || typeof cached !== "object") return null;
    return {
      messages: Array.isArray(cached.messages) ? cached.messages : [],
      stageMessagesByKey: cached.stageMessagesByKey && typeof cached.stageMessagesByKey === "object" ? cached.stageMessagesByKey : {}
    };
  } catch {
    return null;
  }
}

function writeChatCache(projectName, { messages = [], stageMessagesByKey = {} }) {
  const key = chatCacheKey(projectName);
  if (!key || typeof window === "undefined") return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        updatedAt: Date.now(),
        messages,
        stageMessagesByKey
      })
    );
  } catch {
    // Local chat cache is only a fallback for service outages.
  }
}

export default function useWorkspaceController() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [workspaceMode, setWorkspaceMode] = useState("backend");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [storedUserState, setStoredUserState] = useState(() => getStoredUser());
  const [storedProfileState, setStoredProfileState] = useState(() => getStoredProfile());
  const [authReady, setAuthReady] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(window.localStorage.getItem("internlabs_token"));
  });
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceClosed, setWorkspaceClosed] = useState({ closed: false, message: "" });
  const [projectName, setProjectName] = useState("");

  const [chatLoading, setChatLoading] = useState(false);
  const [chatServiceAvailable, setChatServiceAvailable] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState(null);

  const [githubLoading, setGithubLoading] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);

  const [catalogProject, setCatalogProject] = useState(null);
  const [methodState, setMethodState] = useState({ current_step: 1, tasks: [], completed_tasks: [] });
  const [githubState, setGithubState] = useState({
    repository: null,
    latestReview: null,
    previousReviews: [],
    commitHistory: []
  });

  const [centerMode, setCenterMode] = useState("context"); // context | chat | github | review
  const [selectedPoint, setSelectedPoint] = useState(1);
  const [selectedStageByStep, setSelectedStageByStep] = useState({});
  const [taskViewByStep, setTaskViewByStep] = useState({});
  const [understoodStages, setUnderstoodStages] = useState({});
  const [workingStages, setWorkingStages] = useState({});
  const [completedStages, setCompletedStages] = useState({});
  const [stageDocuments, setStageDocuments] = useState({});
  const [stageCompleteConfirm, setStageCompleteConfirm] = useState({ open: false, stepNumber: 0, stageIndex: 0 });
  const [workspaceAgents, setWorkspaceAgents] = useState([]);
  const [documentUploadTarget, setDocumentUploadTarget] = useState({ stepNumber: 0, stageIndex: 0 });
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [reviewingDocument, setReviewingDocument] = useState(false);
  const [pendingMentorReply, setPendingMentorReply] = useState(null);
  const [phaseListOpen, setPhaseListOpen] = useState(true);
  const [showTour, setShowTour] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [visibleStageMessageCount, setVisibleStageMessageCount] = useState(0);
  const [stagePromptAnimating, setStagePromptAnimating] = useState(false);
  const [stagePromptPhaseByKey, setStagePromptPhaseByKey] = useState({});
  const [stageDialogVisible, setStageDialogVisible] = useState(false);
  const [stageProgressLoaded, setStageProgressLoaded] = useState(false);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");

  const [messages, setMessages] = useState([]);
  const [stageMessagesByKey, setStageMessagesByKey] = useState({});
  const [historyLoadedProject, setHistoryLoadedProject] = useState("");

  usePresenceHeartbeat(workspaceMode === "backend");

  const lastAnnouncedStepRef = useRef(0);
  const workspacePositionRestoredRef = useRef("");
  const documentUploadInputRef = useRef(null);
  const chatCacheHydratedProjectRef = useRef("");
  const tourLaunchScheduledRef = useRef(false);

  const methodTotalSteps = useMemo(() => {
    if (!catalogProject?.steps?.length) return 0;
    return catalogProject.steps.length;
  }, [catalogProject]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncAuthReady = () => {
      setAuthReady(Boolean(window.localStorage.getItem("internlabs_token")));
    };

    const handleAuthReady = () => {
      syncAuthReady();
    };

    window.addEventListener("WORKSPACE_AUTH_READY", handleAuthReady);
    syncAuthReady();

    return () => {
      window.removeEventListener("WORKSPACE_AUTH_READY", handleAuthReady);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncStoredProfile = () => {
      console.log("[WORKSPACE PROFILE] Refreshing stored profile");
      setStoredUserState(getStoredUser());
      setStoredProfileState(getStoredProfile());
    };

    syncStoredProfile();
    window.addEventListener("internlabs_profile_updated", syncStoredProfile);

    return () => {
      window.removeEventListener("internlabs_profile_updated", syncStoredProfile);
    };
  }, []);

  const activateOfflineWorkspace = (fallbackTitle = "") => {
    const demoProject = createDemoWorkspaceProject(fallbackTitle || projectName || DEMO_WORKSPACE_TITLE);
    setWorkspaceMode("demo");
    setWorkspaceClosed({ closed: false, message: "" });
    setWorkspaceError("");
    setCatalogProject(demoProject);
    setProjectName(demoProject.title);
    setMethodState({ current_step: 1, tasks: [], completed_tasks: [] });
    setSelectedPoint(1);
    setSelectedStageByStep({});
    setTaskViewByStep({ 1: "about" });
    setUnderstoodStages({});
    setWorkingStages({});
    setCompletedStages({});
    setStageDocuments({});
    setStageCompleteConfirm({ open: false, stepNumber: 0, stageIndex: 0 });
    setWorkspaceAgents([]);
    setMessages([]);
    setStageMessagesByKey({});
    setHistoryLoadedProject("");
    setGithubState({
      repository: null,
      latestReview: null,
      previousReviews: [],
      commitHistory: []
    });
    setStageProgressLoaded(true);
    setReady(true);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    async function loadMentors() {
      if (!authReady || !projectName) return;
      try {
        const isStartupJourney = String(projectName).trim().toLowerCase() === "startup journey";
        const data = isStartupJourney ? await getStartupMentors() : await getDashboardMentors();
        const mentorList = Array.isArray(data?.mentors) ? data.mentors : Array.isArray(data?.startup_mentors) ? data.startup_mentors : [];
        const loaded = mentorList
          .filter((mentor) => mentor?.name || mentor?.mentor_name)
          .map((mentor, index) => ({
            id: mentor.id,
            agent_key: mentor.agent_key,
            name: mentor.mentor_name || mentor.name,
            role: mentor.role || "",
            avatar_url: mentor.avatar_url || "",
            goal: mentor.goal || mentor.mentor_json?.goal || "",
            backstory: mentor.backstory || mentor.mentor_json?.backstory || "",
            rules: mentor.backstory || mentor.mentor_json?.rules || "",
            boundaries: "",
            backend_key: String(mentor.backend_key || mentor.mentor_json?.backend_key || mentor.agent_key || "").trim(),
            accent: WORKSPACE_AGENT_ACCENTS[index % WORKSPACE_AGENT_ACCENTS.length] || "from-slate-700 to-slate-950"
          }));
        if (!cancelled) setWorkspaceAgents(loaded);
      } catch {
        if (!cancelled) setWorkspaceAgents([]);
      }
    }
    loadMentors();
    return () => {
      cancelled = true;
    };
  }, [authReady, projectName]);


  useEffect(() => {
  if (!ready || !authReady) return;

  let cancelled = false;

  getStartupWorkspace()
  .then((data) => {
    if (cancelled || !Array.isArray(data?.journey) || !data.journey.length) return;

    const startupMentorsByKey = new Map();
    const startupMentorsById = new Map();
    data.journey.forEach((phase, phaseIndex) => {
      (phase.stages || []).forEach((stage, stageIndex) => {
        const mentorId = Number(stage?.mentor_id);
        const mentorAgentKey = String(stage?.mentor_agent_key || stage?.agent_key || phase?.default_agent_key || "startup_mentor").trim() || "startup_mentor";
        const mapKey = Number.isFinite(mentorId) && mentorId > 0 ? `id:${mentorId}` : `key:${mentorAgentKey.toLowerCase()}`;
        if (startupMentorsByKey.has(mapKey)) return;
        const mentorRecord = {
          id: Number.isFinite(mentorId) && mentorId > 0 ? mentorId : `${mentorAgentKey}:${phaseIndex}:${stageIndex}`,
          agent_key: mentorAgentKey,
          name: stage?.mentor_name || mentorAgentKey.replaceAll("_", " ") || "Startup Mentor",
          role: stage?.mentor_role || stage?.mentor_name || "Startup Mentor",
          avatar_url: stage?.mentor_avatar_url || "",
          goal: stage?.mentor_goal || "",
          backstory: stage?.mentor_backstory || "",
          rules: stage?.mentor_backstory || "",
          boundaries: "",
          backend_key: mentorAgentKey.startsWith("startup_") ? "startup_mentor" : mentorAgentKey,
          accent: WORKSPACE_AGENT_ACCENTS[(phaseIndex + stageIndex) % WORKSPACE_AGENT_ACCENTS.length] || "from-slate-700 to-slate-950"
        };
        startupMentorsByKey.set(mapKey, mentorRecord);
        if (Number.isFinite(mentorId) && mentorId > 0) {
          startupMentorsById.set(mentorId, mentorRecord);
        }
      });
    });
    const startupMentors = [...startupMentorsByKey.values()];
    if (startupMentors.length) setWorkspaceAgents(startupMentors);

    const startupProject = {
      title: "Startup Journey",
      steps: data.journey.map((phase) => ({
        title: phase.phase_name || phase.phase_key || "Phase",
        phase_context: phase.phase_description || phase.phase_objective || "",
        agent_key: String(phase.default_agent_key || phase.agent_key || "startup_mentor").trim() || "startup_mentor",
        stages: (phase.stages || []).map((stage) => ({
          title: stage.stage_name || stage.stage_key || "Stage",
          stage_context: stage.stage_context || "",
          objective: stage.stage_objective || "",
          deliverable: stage.expected_outcome || "",
          readiness_criteria: stage.readiness_criteria || "",
          recommended_actions: stage.recommended_actions || "",
          document_required: false,
          github_integration_required: false,
          mentor_id: stage.mentor_id || null,
          mentor_name: stage.mentor_name || "",
          agent_key: String(stage.mentor_agent_key || stage.agent_key || phase.default_agent_key || "startup_mentor").trim() || "startup_mentor"
        }))
      }))
    };

    setCatalogProject(startupProject);
    setProjectName("Startup Journey");
    setMethodState({
      current_step: 1,
      tasks: startupProject.steps.map((step) => step.title),
      completed_tasks: []
    });
    setSelectedPoint(1);
    setSelectedStageByStep({});
    setTaskViewByStep({ 1: "about" });
  })
  .catch((error) => {
    console.error("Unable to load startup journey:", error);
  });

  return () => {
    cancelled = true;
  };
}, [authReady, ready]);

  const methodDisplayStep = useMemo(() => {
    return clampStep(methodState.current_step, methodTotalSteps || 1);
  }, [methodState.current_step, methodTotalSteps]);

  const currentMethodStep = useMemo(() => {
    if (!catalogProject?.steps?.length) return null;
    const idx = clampStep(methodState.current_step, catalogProject.steps.length) - 1;
    return catalogProject.steps[idx] || null;
  }, [catalogProject, methodState.current_step]);

  const centerTabs = useMemo(() => {
    return [{ key: "context", label: "Tasks" }];
  }, []);

  useEffect(() => {
    if (centerMode !== "context") {
      setCenterMode("context");
    }
  }, [centerMode]);

  const workspacePoints = useMemo(() => {
    if (catalogProject?.steps?.length) {
      return catalogProject.steps.map((s) => {
        const title = String(s?.title || "").trim() || "Step";
        const parsed = Array.isArray(s?.stages) && s.stages.length
          ? { baseContext: String(s?.phase_context || "").trim(), duration_value: Number(s?.duration_value) || null, duration_max_value: Number(s?.duration_max_value) || null, duration_unit: normalizeDurationUnit(s?.duration_unit), stages: normalizeWorkspaceStages(s.stages) }
          : parseStepContextWithStages(s?.step_context, title);
        return {
          title,
          context: parsed.baseContext,
          duration_defined: Boolean(Number(s?.duration_value) > 0 || parsed.duration_value),
          duration_value: Number(s?.duration_value) > 0 ? normalizeDurationValue(s.duration_value) : parsed.duration_value,
          duration_max_value:
            Number(s?.duration_max_value) > 0
              ? Math.max(
                  Number(s?.duration_value) > 0 ? normalizeDurationValue(s.duration_value) : normalizeDurationValue(parsed.duration_value),
                  normalizeDurationValue(s.duration_max_value)
                )
              : Math.max(
                  Number(s?.duration_value) > 0 ? normalizeDurationValue(s.duration_value) : normalizeDurationValue(parsed.duration_value),
                  normalizeDurationValue(parsed.duration_max_value || parsed.duration_value)
                ),
          duration_unit: Number(s?.duration_value) > 0 ? normalizeDurationUnit(s.duration_unit) : parsed.duration_unit,
          stages: parsed.stages.map((stage) => ({
            ...stage,
            agent_key: String(stage?.agent_key || s?.agent_key || "pm_agent").trim() || "pm_agent",
            stage_context: String(stage?.stage_context || "").trim()
          })),
          agent_key: s?.agent_key || "pm_agent"
        };
      });
    }
    return [];
  }, [catalogProject]);
  const hasProjectMethodology = workspacePoints.length > 0;

  const projectWorkspaceAgents = useMemo(() => {
    const agentKeys = new Set();
    const addAgentKey = (value) => {
      const key = String(value || "").trim().toLowerCase();
      if (key) agentKeys.add(key);
    };

    workspacePoints.forEach((point) => {
      addAgentKey(point?.agent_key);
      (point?.stages || []).forEach((stage) => {
        addAgentKey(stage?.agent_key);
      });
    });
    if (!agentKeys.size) return [];

    return uniqueAgents(workspaceAgents.filter((agent) => {
      const directKey = String(agent.agent_key || "").trim().toLowerCase();
      return directKey && agentKeys.has(directKey);
    }));
  }, [workspaceAgents, workspacePoints]);



  useEffect(() => {
    if (!selectedAgent) return;
    const selectedKey = agentListKey(selectedAgent);
    if (!projectWorkspaceAgents.some((agent) => agentListKey(agent) === selectedKey)) {
      setSelectedAgent(null);
    }
  }, [projectWorkspaceAgents, selectedAgent]);

  const workspaceCurrentStep = useMemo(() => {
    const total = Math.max(1, workspacePoints.length || methodTotalSteps || 1);
    return clampStep(methodState.current_step, total);
  }, [methodState.current_step, methodTotalSteps, workspacePoints.length]);

  const workspaceProgress = useMemo(() => {
    const totalStages = workspacePoints.reduce((sum, point) => sum + Math.max(1, point.stages?.length || 1), 0);
    const doneStages = workspacePoints.reduce((sum, point, index) => {
      if ((methodState.completed_tasks || []).includes(point.title)) return sum + Math.max(1, point.stages?.length || 1);
      const done = (point.stages || []).filter((_, stageIndex) => completedStages[stageProgressKey(projectName, index + 1, stageIndex)]).length;
      return sum + done;
    }, 0);
    return Math.max(0, (doneStages / Math.max(1, totalStages)) * 100);
  }, [completedStages, methodState.completed_tasks, projectName, workspacePoints]);

  const methodCompleted = useMemo(() => {
    if (!methodTotalSteps) return false;
    return (methodState.completed_tasks || []).length >= methodTotalSteps;
  }, [methodState.completed_tasks, methodTotalSteps]);

  const currentInstruction = useMemo(() => {
    if (catalogProject?.steps?.length) {
      const idx = clampStep(methodState.current_step, catalogProject.steps.length) - 1;
      const step = catalogProject.steps[idx];
      const parsed = Array.isArray(step?.stages) && step.stages.length
        ? { baseContext: String(step?.phase_context || "").trim() }
        : parseStepContextWithStages(step?.step_context, step?.title || "");
      return parsed.baseContext || "No data available.";
    }
    return "No data available.";
  }, [catalogProject, methodState.current_step]);

  const selectedPointData = useMemo(() => workspacePoints[selectedPoint - 1] || {}, [selectedPoint, workspacePoints]);
  const selectedPointStages = useMemo(() => selectedPointData.stages || [], [selectedPointData]);
  const workingStageIndex = selectedPointStages.findIndex((_, stageIndex) => workingStages[stageProgressKey(projectName, selectedPoint, stageIndex)]);
  const nextOpenStageIndex = selectedPointStages.findIndex((_, stageIndex) => !completedStages[stageProgressKey(projectName, selectedPoint, stageIndex)]);
  const selectedStageIndex = selectedStageByStep[selectedPoint] ?? (workingStageIndex >= 0 ? workingStageIndex : nextOpenStageIndex);
  const activeStageIndex = selectedStageIndex >= 0 ? selectedStageIndex : 0;
  const activeStageData = selectedPointStages[activeStageIndex] || selectedPointStages[0] || null;
  const activeStageAgentKey = String(activeStageData?.agent_key || selectedPointData?.agent_key || "").trim();
  const activeStageMentor = findMentorForStage(projectWorkspaceAgents, activeStageAgentKey);
  const visibleProjectWorkspaceAgents = useMemo(() => {
    const activeKey = agentListKey(activeStageMentor);
    return projectWorkspaceAgents.filter((agent) => agentListKey(agent) !== activeKey);
  }, [activeStageMentor, projectWorkspaceAgents]);
  const activeStageContext = String(activeStageData?.stage_context || "").trim();
  const activeStageDemoDocumentIds = Array.isArray(activeStageData?.demo_document_ids)
    ? activeStageData.demo_document_ids
    : (activeStageData?.demo_document_id ? [activeStageData.demo_document_id] : []);
  const activeStageDemoDocuments = catalogProject?.demo_documents_by_id
    ? activeStageDemoDocumentIds.map((id) => catalogProject.demo_documents_by_id[String(id)]).filter(Boolean)
    : [];
  const activeStageDemoDocument = activeStageDemoDocuments[0] || null;
  const currentStageKey = stageProgressKey(projectName, selectedPoint, activeStageIndex);
  const currentStageChatMessages = stageMessagesByKey[currentStageKey] || [];
  const workspacePositionKey = projectName ? `internlabs_workspace_position::${projectName}` : "";
  const stagePromptSeenKey = currentStageKey ? `internlabs_stage_prompt_seen::${STAGE_PROMPT_SEEN_VERSION}::${currentStageKey}` : "";

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleStageEventFailure = (event) => {
      const detail = event?.detail || {};
      const stageLabel =
        detail.project_name && detail.step_number
          ? ` for ${detail.project_name} step ${detail.step_number}${Number(detail.stage_index) >= 0 ? ` stage ${Number(detail.stage_index) + 1}` : ""}`
          : "";
      toast.error(`GitHub review could not start automatically${stageLabel}. Please save the stage again or reconnect GitHub.`);
    };

    window.addEventListener("internlabs_github_stage_event_failed", handleStageEventFailure);
    return () => {
      window.removeEventListener("internlabs_github_stage_event_failed", handleStageEventFailure);
    };
  }, [toast]);

  // Declare these early since they're used in hooks above the main render section
  const isPointCompleted = (point) => {
    const idx = Number(point) - 1;
    const title = String(workspacePoints[idx]?.title || "").trim();
    if (!title) return false;
    return (methodState.completed_tasks || []).includes(title);
  };
  const selectedPointCompleted = isPointCompleted(selectedPoint);
  const activeStageKey = currentStageKey;
  const activeStageCompleted = Boolean(completedStages[activeStageKey]) || selectedPointCompleted;
  const activeStageWorking = Boolean(workingStages[activeStageKey]) && !activeStageCompleted;
  const activeStageChecked = Boolean(understoodStages[activeStageKey]) || activeStageWorking || activeStageCompleted;

  useEffect(() => {
    if (!activeStageMentor) {
      if (selectedAgent) setSelectedAgent(null);
      return;
    }
    if (agentListKey(selectedAgent) !== agentListKey(activeStageMentor)) {
      setSelectedAgent(activeStageMentor);
    }
  }, [activeStageMentor, selectedAgent]);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      setLoading(true);
      setWorkspaceError("");
      try {
        const token = localStorage.getItem("internlabs_token");
        const forcedProject = String(searchParams?.get("project") || "").trim();
        const forceOpen = String(searchParams?.get("force_open") || "") === "1";
        const selectedProject = forcedProject || localStorage.getItem("internlabs_project");
        if (!token) {
          activateOfflineWorkspace(selectedProject || DEMO_WORKSPACE_TITLE);
          return;
        }

        const preferSelected = Boolean(forceOpen && forcedProject);

        const status = await getWorkspaceStatus().catch(() => ({ closed: false, message: "" }));
        if (status?.closed) {
          if (!active) return;
          setWorkspaceClosed({
            closed: true,
            message: String(status.message || "The workspace is being updated right now. Please wait a little and try again shortly.")
          });
          setReady(true);
          setLoading(false);
          return;
        }
        if (active) setWorkspaceClosed({ closed: false, message: "" });

        const data = await getDashboardProgress();
        const projects = Array.isArray(data?.projects) ? data.projects : [];
        const selectedProjectMatch = pickWorkspaceProject(projects, selectedProject, { preferSelected });
        const dbProject = projectTitle(selectedProjectMatch);
        if (!dbProject) {
          activateOfflineWorkspace(selectedProject || DEMO_WORKSPACE_TITLE);
          return;
        }

        localStorage.setItem("internlabs_project", dbProject);
        if (!active) return;
        const found = selectedProjectMatch || projects.find((project) => normalizeProjectName(projectTitle(project)) === normalizeProjectName(dbProject));
        if (found) {
          setMethodState((prev) => ({
            ...prev,
            current_step: Number(found.current_step) || prev.current_step || 1,
            completed_tasks: Array.isArray(found.completed_tasks) ? found.completed_tasks : prev.completed_tasks
          }));
        }
        setProjectName(dbProject);
        setReady(true);
      } catch (err) {
        activateOfflineWorkspace(String(localStorage.getItem("internlabs_project") || searchParams?.get("project") || DEMO_WORKSPACE_TITLE).trim());
      }
    };
    boot();
    return () => {
      active = false;
    };
  }, [router, searchParams]);

  const loadBackendProgress = async (targetProjectName = projectName, progressData = null) => {
    if (workspaceMode === "demo") return null;
    if (!targetProjectName) return null;
    try {
      const data = progressData || await getDashboardProgress();
      const list = Array.isArray(data?.projects) ? data.projects : [];
      const found = list.find((p) => normalizeProjectName(p.project_name) === normalizeProjectName(targetProjectName));
      if (!found) return null;
      setMethodState((prev) => ({
        ...prev,
        current_step: Number(found.current_step) || prev.current_step || 1,
        completed_tasks: Array.isArray(found.completed_tasks) ? found.completed_tasks : prev.completed_tasks
      }));
      return found;
    } catch {
      // ignore
      return null;
    }
  };

  const applyStageRows = (rows = []) => {
    const understood = {};
    const working = {};
    const completed = {};
    const documents = {};
    rows.forEach((row) => {
      const stepNumber = Number(row.step_number);
      const stageIndex = Number(row.stage_index);
      if (!Number.isInteger(stepNumber) || !Number.isInteger(stageIndex)) return;
      const key = stageProgressKey(projectName, stepNumber, stageIndex);
      const status = String(row.status || "undone").toLowerCase();
      if (row.understood || status === "working" || status === "completed") understood[key] = true;
      if (status === "working") working[key] = true;
      if (status === "completed") completed[key] = true;
      const rowDocuments = normalizeStageDocuments(row);
      if (row.document_url || row.document_name || rowDocuments.length) {
        const latestDocument = rowDocuments[rowDocuments.length - 1] || {};
        documents[key] = {
          document_required: Boolean(row.document_required),
          document_url: String(row.document_url || latestDocument.document_url || ""),
          document_name: String(row.document_name || latestDocument.document_name || ""),
          documents: rowDocuments,
          document_review_status: String(row.document_review_status || ""),
          document_review_feedback: String(row.document_review_feedback || "")
        };
      }
    });
    setUnderstoodStages(understood);
    setWorkingStages(working);
    setCompletedStages(completed);
    setStageDocuments(documents);
    setStageProgressLoaded(true);
  };

  const loadStageProgress = async (targetProjectName = projectName) => {
    if (workspaceMode === "demo") {
      setStageProgressLoaded(true);
      return;
    }
    if (!targetProjectName) return;
    setStageProgressLoaded(false);
    try {
      const data = await getDashboardStageProgress({ project_name: targetProjectName });
      if (normalizeProjectName(targetProjectName) !== normalizeProjectName(projectName)) return;
      applyStageRows(Array.isArray(data?.stages) ? data.stages : []);
    } catch (err) {
      setUnderstoodStages({});
      setWorkingStages({});
      setCompletedStages({});
      setStageDocuments({});
      setStageProgressLoaded(true);
    }
  };

  const loadReviewState = async () => {
    if (workspaceMode === "demo") {
      setGithubState({
        repository: null,
        latestReview: null,
        previousReviews: [],
        commitHistory: []
      });
      setReviewLoading(false);
      return;
    }
    setReviewLoading(true);
    try {
      const data = await getGithubReviews(projectName ? { project_name: projectName } : {});
      setGithubState({
        repository: data.repository || null,
        latestReview: data.latest_review || null,
        previousReviews: data.previous_reviews || [],
        commitHistory: data.commit_history || []
      });
    } catch {
      setGithubState({
        repository: null,
        latestReview: null,
        previousReviews: [],
        commitHistory: []
      });
    } finally {
      setReviewLoading(false);
    }
  };

  const completeStepByNumber = async (stepNumber) => {
    if (!catalogProject?.steps?.length) return;
    const currentStepNumber = clampStep(methodState.current_step, catalogProject.steps.length);
    if (Number(stepNumber) !== currentStepNumber) return;

    const step = catalogProject.steps[currentStepNumber - 1];
    const stepTitle = String(step?.title || "").trim();
    if (!stepTitle) return;
    if ((methodState.completed_tasks || []).includes(stepTitle)) return;

    try {
      const doneRes = await completeDashboardTask({ project_name: projectName, task: stepTitle });
      const completedTasks = Array.isArray(doneRes?.completed_tasks) ? doneRes.completed_tasks : [];
      const maxSteps = catalogProject.steps.length;
      const nextStep = Math.min(maxSteps, currentStepNumber + 1);

      await updateDashboardProgress({ project_name: projectName, current_step: nextStep });

      setMethodState((prev) => ({
        ...prev,
        completed_tasks: completedTasks,
        current_step: nextStep
      }));

      if (currentStepNumber >= maxSteps) toast.success("All steps completed. Great job!");
      else toast.success("Step completed. Next step unlocked.");
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(detail || "Could not complete step. Please try again.");
      await loadBackendProgress();
    }
  };

  useEffect(() => {
    if (!ready) return;
    loadReviewState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, projectName, workspaceMode]);

  useEffect(() => {
    if (!ready) return undefined;
    const interval = window.setInterval(() => {
      loadReviewState();
    }, 30000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, projectName, workspaceMode]);

  // Disclaimer shows once on first visit; the tour starts only after the first stage UI is mounted.
  useEffect(() => {
    if (!ready) return;
    if (!disclaimerAccepted()) {
      setShowDisclaimer(true);
    }
  }, [ready]);

  const handleDisclaimerAccept = () => {
    setShowDisclaimer(false);
  };

  useEffect(() => {
    if (!ready || loading || workspaceClosed.closed || workspaceError || showDisclaimer || showTour) return;
    if (typeof window === "undefined") return;
    if (!disclaimerAccepted() || localStorage.getItem(WORKSPACE_TOUR_SEEN_KEY)) return;
    if (tourLaunchScheduledRef.current) return;
    if (!projectName || !catalogProject?.steps?.length || !workspacePoints.length || !activeStageData) return;
    if (selectedPoint !== 1 || activeStageIndex !== 0) return;

    tourLaunchScheduledRef.current = true;
    if (!localStorage.getItem(WORKSPACE_TOUR_SEEN_KEY)) {
      let attempts = 0;
      let timer = null;
      const tryStartTour = () => {
        attempts += 1;
        const firstStageMounted =
          document.querySelector('[data-tour="tour-phases"]') &&
          document.querySelector('[data-tour="tour-tabs"]') &&
          document.querySelector('[data-tour="tour-chat"]');
        if (!firstStageMounted && attempts < 12) {
          timer = window.setTimeout(tryStartTour, 250);
          return;
        }
        if (!firstStageMounted || localStorage.getItem(WORKSPACE_TOUR_SEEN_KEY)) {
          tourLaunchScheduledRef.current = false;
          return;
        }
        setShowTour(true);
      };
      timer = window.setTimeout(tryStartTour, 700);
      return () => {
        if (timer) clearTimeout(timer);
      };
    }
  }, [
    activeStageData,
    activeStageIndex,
    catalogProject,
    loading,
    projectName,
    ready,
    selectedPoint,
    showDisclaimer,
    showTour,
    workspaceClosed.closed,
    workspaceError,
    workspacePoints.length
  ]);

  const completeTour = () => {
    localStorage.setItem(WORKSPACE_TOUR_SEEN_KEY, "1");
    setShowTour(false);
    setTimeout(() => setShowWelcome(true), 300);
  };

  useEffect(() => {
    if (!ready || !projectName) return;
    if (chatCacheHydratedProjectRef.current === projectName) return;
    chatCacheHydratedProjectRef.current = projectName;
    const cached = readChatCache(projectName);
    if (!cached) return;
    if (cached.messages.length) setMessages(cached.messages);
    if (Object.keys(cached.stageMessagesByKey || {}).length) {
      setStageMessagesByKey((prev) => ({ ...prev, ...cached.stageMessagesByKey }));
    }
  }, [projectName, ready]);

  useEffect(() => {
    if (!ready || !projectName) return;
    const hasProjectMessages = Array.isArray(messages) && messages.length > 0;
    const hasStageMessages = Object.keys(stageMessagesByKey || {}).length > 0;
    if (!hasProjectMessages && !hasStageMessages) return;
    writeChatCache(projectName, { messages, stageMessagesByKey });
  }, [messages, projectName, ready, stageMessagesByKey]);

  useEffect(() => {
    if (!ready || !authReady || !projectName || workspaceMode === "demo") return;
    let active = true;
    const loadCatalog = async () => {
       if (projectName === "Startup Journey") return;
      setLoading(true);
      setWorkspaceError("");
      try {
        const progressData = await getDashboardProgress();
        if (!active) return;
        const progressRow = Array.isArray(progressData?.projects)
          ? progressData.projects.find((p) => normalizeProjectName(p.project_name) === normalizeProjectName(projectName))
          : null;
        const catalogTitle = String(progressRow?.project_name || projectName || "").trim();
        const data = await getCatalogProject({ title: catalogTitle });
        if (!active) return;
        const project = data?.project || null;
        const steps = Array.isArray(project?.steps) ? project.steps : [];
        steps.sort((a, b) => (Number(a?.step_order) || 0) - (Number(b?.step_order) || 0));
        setCatalogProject(project ? { ...project, steps } : null);
        if (steps.length) {
          setMethodState((prev) => ({
            current_step: Number(progressRow?.current_step) || prev.current_step || 1,
            tasks: steps.map((s) => String(s?.title || "").trim()).filter(Boolean),
            completed_tasks: Array.isArray(progressRow?.completed_tasks)
              ? progressRow.completed_tasks
              : Array.isArray(prev.completed_tasks)
              ? prev.completed_tasks
              : []
          }));
          lastAnnouncedStepRef.current = 0;
          setCenterMode("context");
        }
        loadStageProgress(catalogTitle).catch((err) => {
          console.error("Could not load stage progress", err);
        });
        getMentorChatHistory(catalogTitle)
          .then((historyData) => {
            if (!active) return;
            const historyMessages = normalizeHistoryMessages(historyData?.messages);
            if (!historyMessages.length) {
              setChatServiceAvailable(true);
              setHistoryLoadedProject(catalogTitle);
              return;
            }
            const historyByStage = groupHistoryMessagesByStage(historyMessages);
            const nextMessages = historyMessages.map(({ stage_key: _stageKey, ...message }) => message);
            setMessages(nextMessages);
            setStageMessagesByKey((prev) => ({
              ...prev,
              ...historyByStage
            }));
            setHistoryLoadedProject(catalogTitle);
            setChatServiceAvailable(true);
          })
          .catch((err) => {
            console.error("Could not load mentor chat history", err);
            setChatServiceAvailable(false);
            const cached = readChatCache(catalogTitle);
            if (!active || !cached) return;
            if (cached.messages.length) setMessages(cached.messages);
            if (Object.keys(cached.stageMessagesByKey || {}).length) {
              setStageMessagesByKey((prev) => ({ ...prev, ...cached.stageMessagesByKey }));
            }
          });
      } catch (err) {
        activateOfflineWorkspace(String(localStorage.getItem("internlabs_project") || searchParams?.get("project") || DEMO_WORKSPACE_TITLE).trim());
      } finally {
        if (active) setLoading(false);
      }
    };
    loadCatalog();
    loadBackendProgress(projectName);
    return () => {
      active = false;
    };
  }, [authReady, projectName, ready, workspaceMode]);

  useEffect(() => {
    if (!ready || !authReady || !projectName || historyLoadedProject === projectName || workspaceMode === "demo") return;
    let cancelled = false;
    async function loadChatHistory() {
      try {
        const historyData = await getMentorChatHistory(projectName);
        if (cancelled) return;
        const historyMessages = normalizeHistoryMessages(historyData?.messages);
        if (!historyMessages.length) {
          setChatServiceAvailable(true);
          setHistoryLoadedProject(projectName);
          return;
        }
        const historyByStage = groupHistoryMessagesByStage(historyMessages);
        const projectMessages = historyMessages.map(({ stage_key: _stageKey, ...message }) => message);
        setStageMessagesByKey((prev) => ({
          ...prev,
          ...historyByStage
        }));
        setMessages(projectMessages);
        setHistoryLoadedProject(projectName);
        setChatServiceAvailable(true);
      } catch (err) {
        console.error("Could not load mentor chat history", err);
        setChatServiceAvailable(false);
        const cached = readChatCache(projectName);
        if (!cancelled && cached) {
          if (cached.messages.length) setMessages(cached.messages);
          if (Object.keys(cached.stageMessagesByKey || {}).length) {
            setStageMessagesByKey((prev) => ({ ...prev, ...cached.stageMessagesByKey }));
          }
        }
      }
    }
    loadChatHistory();
    return () => {
      cancelled = true;
    };
  }, [authReady, currentStageKey, historyLoadedProject, projectName, ready, workspaceMode]);

  useEffect(() => {
    if (!ready || !authReady || !projectName || !currentStageKey || (taskViewByStep[selectedPoint] || "about") !== "stage" || workspaceMode === "demo") return;
    let cancelled = false;
    async function loadCurrentStageChatHistory() {
      try {
        const historyData = await getMentorChatHistory(projectName, {
          stage_key: currentStageKey,
          step_number: selectedPoint,
          stage_index: activeStageIndex
        });
        if (cancelled) return;
        const stageMessages = normalizeHistoryMessages(historyData?.messages).map(({ stage_key: _stageKey, ...message }) => message);
        setStageMessagesByKey((prev) => ({ ...prev, [currentStageKey]: stageMessages }));
        const pendingRequest = findPendingMentorRequest(stageMessages);
        if (pendingRequest?.message) {
          setPendingMentorReply((prev) => {
            if (prev?.payload) return prev;
            const clientMessageId = pendingRequest.clientMessageId || createClientMessageId();
            return {
              message: pendingRequest.message,
              retryDelayMs: 1000,
              payload: {
                client_message_id: clientMessageId,
                message: pendingRequest.message,
                project_name: projectName,
                preferred_agent: activeStageMentor?.backend_key || backendKeyForStageAgent(activeStageAgentKey),
                mentor_id: activeStageMentor?.id || null,
                stage_key: currentStageKey,
                step_number: selectedPoint,
                stage_index: activeStageIndex,
                phase_title: selectedPointData?.title || "",
                stage_title: activeStageData?.title || "",
                stage_context: activeStageData?.stage_context || "",
                objective: activeStageData?.objective || "",
                deliverable: activeStageData?.deliverable || "",
                document_required: Boolean(activeStageData?.document_required),
                complete_task: null,
                documents: normalizeStageDocuments(stageDocuments[currentStageKey])
              }
            };
          });
        }
        setChatServiceAvailable(true);
      } catch (err) {
        console.error("Could not load current stage chat history", err);
        setChatServiceAvailable(false);
        const cached = readChatCache(projectName);
        const cachedStageMessages = cached?.stageMessagesByKey?.[currentStageKey];
        if (!cancelled && Array.isArray(cachedStageMessages) && cachedStageMessages.length) {
          setStageMessagesByKey((prev) => ({ ...prev, [currentStageKey]: prev[currentStageKey]?.length ? prev[currentStageKey] : cachedStageMessages }));
        }
      }
    }
    loadCurrentStageChatHistory();
    return () => {
      cancelled = true;
    };
  }, [activeStageAgentKey, activeStageData, activeStageIndex, activeStageMentor, authReady, currentStageKey, projectName, ready, selectedPoint, selectedPointData, stageDocuments, taskViewByStep, workspaceMode]);

  useEffect(() => {
    if (!workspacePoints.length || !workspacePositionKey || workspaceMode === "demo") return;
    if (workspacePositionRestoredRef.current === workspacePositionKey) return;

    workspacePositionRestoredRef.current = workspacePositionKey;
    const fallbackPoint = workspaceCurrentStep || 1;
    let nextPoint = fallbackPoint;
    let nextStageIndex = null;
    let nextView = "about";

    try {
      const saved = JSON.parse(localStorage.getItem(workspacePositionKey) || "{}");
      const savedPoint = Number(saved?.point);
      const savedStage = Number(saved?.stageIndex);
      const maxPoint = Math.max(1, clampStep(methodState.current_step, workspacePoints.length || 1));
      if (Number.isInteger(savedPoint) && savedPoint >= 1 && savedPoint <= maxPoint) {
        nextPoint = savedPoint;
        if (saved?.view === "stage") {
          const stages = workspacePoints[savedPoint - 1]?.stages || [];
          if (Number.isInteger(savedStage) && savedStage >= 0 && savedStage < Math.max(1, stages.length)) {
            nextStageIndex = savedStage;
            nextView = "stage";
          }
        }
      }
    } catch {
      // Use the current backend phase when no saved workspace position exists.
    }

    setSelectedPoint(nextPoint);
    setTaskViewByStep((prev) => ({ ...prev, [nextPoint]: nextView }));
    if (nextStageIndex !== null) {
      setSelectedStageByStep((prev) => ({ ...prev, [nextPoint]: nextStageIndex }));
      setCenterMode("context");
    }
  }, [methodState.current_step, workspaceCurrentStep, workspacePoints, workspacePositionKey, workspaceMode]);

  useEffect(() => {
    if (!workspacePositionKey || workspacePositionRestoredRef.current !== workspacePositionKey) return;
    localStorage.setItem(
      workspacePositionKey,
      JSON.stringify({
        point: selectedPoint,
        stageIndex: activeStageIndex,
        view: taskViewByStep[selectedPoint] || "about"
      })
    );
  }, [activeStageIndex, selectedPoint, taskViewByStep, workspacePositionKey]);

  useEffect(() => {
    if (!catalogProject?.steps?.length) return;
    const stepNumber = clampStep(methodState.current_step, catalogProject.steps.length);
    if (stepNumber <= 0) return;
    if (lastAnnouncedStepRef.current === stepNumber) return;

    const idx = Math.max(0, stepNumber - 1);
    const step = catalogProject.steps[idx];
    if (!step) return;

    lastAnnouncedStepRef.current = stepNumber;
    const point = workspacePoints[stepNumber - 1];
    const stageList = point?.stages || [];
    const firstOpenStage = stageList.find((_, index) => !completedStages[stageProgressKey(projectName, stepNumber, index)]) || stageList[0];
    const agent = labelForAgent(firstOpenStage?.agent_key || step.agent_key);
    const publicStepContext = parseStepContextWithStages(step.step_context, step.title).baseContext;
    const contentParts = [
      `Step ${stepNumber}/${catalogProject.steps.length}: ${step.title}`,
      firstOpenStage?.title ? `Current stage: ${firstOpenStage.title}` : "",
      publicStepContext || "No public context added yet for this step.",
      "Complete every stage in this step to move forward."
    ];
    setMessages((prev) => [...prev, { role: "assistant", agent, content: contentParts.join("\n\n") }]);
  }, [catalogProject, completedStages, methodState.current_step, projectName, workspacePoints]);

  const sendMessage = async ({ text = "", attachments = [], completedTask = null, documents = [] } = {}) => {
    const trimmedText = String(text || "").trim();
    const normalizedDocuments = Array.isArray(documents) ? documents : [];
    const stageKey = currentStageKey;
    const triggerText = trimmedText.toLowerCase();
    const currentDialogPhase = stagePromptPhaseByKey[stageKey];

    // Fuzzy re-trigger: if waiting for understanding and user signals they get it
    if (currentDialogPhase === "waiting_understand" && !attachments.length) {
      const understandKeywords = [
        "understand", "understood", "got it", "i get it", "makes sense",
        "all clear", "clear now", "i know", "figured", "know what to do",
        "ready to proceed", "grasp", "i'm clear", "im clear", "i have understood",
        "i understood", "now i know", "i think i know", "makes it clear"
      ];
      if (understandKeywords.some((kw) => triggerText.includes(kw))) {
        appendStageConversationMessage(stageKey, { role: "user", agent: "You", content: trimmedText, kind: "stage-action" }, { persist: true });
        setStagePromptPhase(stageKey, "understanding");
        return true;
      }
    }

    // Fuzzy re-trigger: if waiting to start and user signals they want to begin
    if (currentDialogPhase === "waiting_start" && !attachments.length) {
      const startKeywords = [
        "start", "begin", "ready", "let's go", "lets go",
        "want to start", "kick off", "starting", "i want to begin",
        "start my work", "begin my work", "ready to work", "start now",
        "begin now", "i'm ready", "im ready", "let us start", "let us begin"
      ];
      if (startKeywords.some((kw) => triggerText.includes(kw))) {
        appendStageConversationMessage(stageKey, { role: "user", agent: "You", content: trimmedText, kind: "stage-action" }, { persist: true });
        setStagePromptPhase(stageKey, "ready");
        return true;
      }
    }

    if (!attachments.length && isDemoDocumentRequest(trimmedText)) {
      const userMessage = {
        role: "user",
        agent: "You",
        content: trimmedText,
        kind: "stage-action"
      };
      appendStageConversationMessage(stageKey, userMessage, { persist: true });

      const demoDocAgent = stageAgentName(activeStageMentor, activeStageAgentKey);
      if (activeStageDemoDocuments.length) {
        activeStageDemoDocuments.forEach((doc, index) => {
          const demoLink = String(doc?.preview_url || doc?.download_url || "").trim();
          if (!demoLink) return;
          appendStageConversationMessage(stageKey, {
            role: "assistant",
            agent: demoDocAgent,
            kind: "stage-note",
            content: index === 0 ? "Here are the trial documents selected for this stage." : "Another trial document for this stage.",
            link_url: demoLink,
            link_label: doc.name || doc.original_filename || `Open trial document ${index + 1}`
          }, { persist: true });
        });
      } else {
        appendStageConversationMessage(stageKey, {
          role: "assistant",
          agent: demoDocAgent,
          kind: "stage-note",
          content: "No trial docs are available for this stage."
        }, { persist: true });
      }
      return true;
    }

    if (attachments.length) {
      if (!activeStageRequiresDocument) {
        toast.error("This stage does not require a document submission.");
        return false;
      }
      if (!activeStageUnlocked || activeStageCompleted) {
        toast.error("Document upload is not available for this stage.");
        return false;
      }
      const uploadedNames = summarizeStageDocuments(attachments);
      const uploadSummary = uploadedNames.length
        ? `Uploaded documents:\n${uploadedNames.map((name) => `- ${name}`).join("\n")}`
        : "Uploaded documents for this stage.";
      const uploaded = await uploadStageDocumentFile({
        stepNumber: selectedPoint,
        stageIndex: activeStageIndex,
        files: attachments,
        userMessageContent: trimmedText ? `${uploadSummary}\n\n${trimmedText}` : uploadSummary
      });
      if (!uploaded) return false;
      return true;
    }

    const baseMessages = stageMessagesByKey[stageKey] || [];
    const nextMessages = [...baseMessages, { role: "user", agent: "You", content: trimmedText }];
    setMessages(nextMessages);
    setStageMessagesByKey((prev) => ({ ...prev, [stageKey]: nextMessages }));
    setChatLoading(true);
    const thinkingStartedAt = Date.now();
    const requestPayload = {
      client_message_id: createClientMessageId(),
      message: trimmedText,
      project_name: projectName,
      preferred_agent: activeStageMentor?.backend_key || selectedAgent?.backend_key || backendKeyForStageAgent(activeStageAgentKey),
      mentor_id: activeStageMentor?.id || selectedAgent?.id || null,
      stage_key: stageKey,
      step_number: selectedPoint,
      stage_index: activeStageIndex,
      phase_title: selectedPointData?.title || "",
      stage_title: activeStageData?.title || "",
      stage_context: activeStageData?.stage_context || "",
      objective: activeStageData?.objective || "",
      deliverable: activeStageData?.deliverable || "",
      document_required: Boolean(activeStageData?.document_required),
      complete_task: completedTask,
      documents: normalizedDocuments
    };
    try {
      const data = await sendMentorMessage(requestPayload);
      await waitForMinimumThinking(thinkingStartedAt);
      const replyAgentName = displayStageAgentName(data.agent, stageAgentName(activeStageMentor, activeStageAgentKey));
      setMessages((prev) => [...prev, { role: "assistant", agent: replyAgentName, content: data.message }]);
      setStageMessagesByKey((prev) => ({
        ...prev,
        [stageKey]: [...(prev[stageKey] || nextMessages), { role: "assistant", agent: replyAgentName, content: data.message }]
      }));
      setChatServiceAvailable(true);
      setPendingMentorReply(null);
    } catch {
      await waitForMinimumThinking(thinkingStartedAt);
      const retryDelay = createMentorRetryDelay();
      const fallbackAgentName =
        activeStageMentor?.name ||
        selectedAgent?.name ||
        activeStageMentor?.role ||
          selectedAgent?.role ||
          stageAgentLabel ||
          "Mentor";
      setChatServiceAvailable(false);
      const busyMessage = {
        role: "assistant",
        agent: fallbackAgentName,
        content: retryDelay.message,
        client_message_id: `${requestPayload.client_message_id}:busy`,
        kind: "mentor-busy"
      };
      persistLocalStageMessage(stageKey, {
        role: "user",
        agent: "You",
        content: trimmedText,
        client_message_id: requestPayload.client_message_id,
        kind: "mentor-request"
      });
      setMessages((prev) => [
        ...prev,
        busyMessage
      ]);
      setStageMessagesByKey((prev) => ({
        ...prev,
        [stageKey]: [
          ...(prev[stageKey] || nextMessages),
          busyMessage
        ]
      }));
      persistLocalStageMessage(stageKey, busyMessage);
      setPendingMentorReply({
        message: trimmedText,
        retryDelayMs: retryDelay.delayMs,
        payload: requestPayload
      });
    } finally {
      setChatLoading(false);
    }
    return true;
  };

  useEffect(() => {
    if (!pendingMentorReply?.payload) return undefined;
    if (chatLoading) return undefined;
    const retryDelayMs = Number(pendingMentorReply.retryDelayMs || createMentorRetryDelay().delayMs);
    const retryTimer = window.setTimeout(async () => {
      setChatLoading(true);
      const thinkingStartedAt = Date.now();
      try {
        const data = await sendMentorMessage(pendingMentorReply.payload);
        await waitForMinimumThinking(thinkingStartedAt);
        const pendingStageKey = String(pendingMentorReply.payload.stage_key || currentStageKey);
        const agentName = displayStageAgentName(data.agent, stageAgentName(activeStageMentor, activeStageAgentKey));
        const replyMessage = { role: "assistant", agent: agentName, content: `${MENTOR_BACK_MESSAGE}\n\n${data.message}` };
        setMessages((prev) => [...prev, replyMessage]);
        setStageMessagesByKey((prev) => ({
          ...prev,
          [pendingStageKey]: [
            ...(prev[pendingStageKey] || []),
            replyMessage
          ]
        }));
        setChatServiceAvailable(true);
        setPendingMentorReply(null);
      } catch {
        await waitForMinimumThinking(thinkingStartedAt);
        setChatServiceAvailable(false);
      } finally {
        setChatLoading(false);
      }
    }, retryDelayMs);
    return () => window.clearTimeout(retryTimer);
  }, [activeStageAgentKey, activeStageMentor, pendingMentorReply, chatLoading, currentStageKey]);

  const addStageCompletionMessage = (stageKey, { finalStage = false } = {}) => {
    const message = {
      role: "assistant",
      agent: stageAgentName(activeStageMentor, activeStageAgentKey),
      kind: "stage-note",
      content: finalStage
        ? "Outstanding work! You have wrapped up every stage in this phase. Hit 'Go to next phase' when you are ready to take on the next challenge - keep this momentum going!"
        : "Excellent work! Stage completed. Hit 'Next' to keep moving - you are doing great!"
    };
    setStageMessagesByKey((prev) => {
      const existingMessages = prev[stageKey] || [];
      const alreadyAdded = existingMessages.some((item) => item.content === message.content);
      if (!alreadyAdded) persistLocalStageMessage(stageKey, message);
      return {
        ...prev,
        [stageKey]: alreadyAdded ? existingMessages : [...existingMessages, message]
      };
    });
    setMessages((prev) => prev.some((item) => item.content === message.content) ? prev : [...prev, message]);
    setCenterMode("context");
  };

  const persistLocalStageMessage = (stageKey, message) => {
    if (!projectName || !stageKey || !message?.content) return;
    const clientMessageId = message.client_message_id || createClientMessageId();
    return saveLocalChatMessage({
      project_name: projectName,
      role: message.role === "user" ? "user" : "assistant",
      message: String(message.content || ""),
      client_message_id: clientMessageId,
      agent_name: message.agent || (message.role === "user" ? "You" : stageAgentLabel || "Mentor"),
      stage_key: stageKey,
      step_number: selectedPoint,
      stage_index: activeStageIndex,
      kind: message.kind || "local",
      metadata: {
        ...(message.metadata || {}),
        link_url: message.link_url || "",
        link_label: message.link_label || ""
      }
    }).catch((err) => {
      console.error("Could not persist local chat message", err);
    });
  };

  const appendStageConversationMessage = (stageKey, message, options = {}) => {
    if (!stageKey || !message?.content) return;
    const nextMessage = options?.persist && !message.client_message_id
      ? { ...message, client_message_id: createClientMessageId() }
      : message;
    setMessages((prev) => [...prev, nextMessage]);
    setStageMessagesByKey((prev) => ({
      ...prev,
      [stageKey]: [...(prev[stageKey] || []), nextMessage]
    }));
    return options?.persist ? persistLocalStageMessage(stageKey, nextMessage) : Promise.resolve();
  };

  const setStagePromptPhase = (stageKey, phase) => {
    if (!stageKey) return;
    setStagePromptPhaseByKey((prev) => ({ ...prev, [stageKey]: phase }));
  };

  const handleStagePromptAction = async (item, action) => {
    const stageKey = currentStageKey;
    if (!stageKey || !action?.id) return;

    // Persist dialog as a plain note in history (no buttons shown in feed).
    appendStageConversationMessage(stageKey, {
      role: item.role,
      agent: item.agent,
      content: item.content,
      kind: "stage-note"
    }, { persist: true });
    setStagePromptPhase(stageKey, "none");

    const userMessageMap = {
      understand_yes: "Yes, I have gone through the stage details - all clear!",
      understand_no: "I need a bit more time to go through the details.",
      want_demo: "Yes, please show me the reference document!",
      no_demo: "No thanks, I will figure it out myself.",
      ready_yes: "Yes, let's get started!",
      ready_later: "I will start a bit later."
    };
    const userMessage = userMessageMap[action.id] || String(action.label || "").trim();
    appendStageConversationMessage(stageKey, { role: "user", agent: "You", content: userMessage, kind: "stage-action" }, { persist: true });

    if (action.id === "understand_yes") {
      const saved = await updateStageUnderstanding(selectedPoint, activeStageIndex, true);
      if (saved) {
        setStagePromptPhase(stageKey, activeStageDemoDocuments.length ? "demo_offer" : "ready");
      }
      return;
    }

    if (action.id === "understand_no") {
      const saved = await updateStageUnderstanding(selectedPoint, activeStageIndex, false);
      if (!saved) return;
      appendStageConversationMessage(stageKey, {
        role: "assistant",
        agent: stageAgentLabel,
        content: "No worries at all! Take all the time you need to go through the stage details. Feel free to ask me any questions below - I am here to help clarify. Whenever you feel ready, just say something like \"I understand\" or \"I got it\" and I will check in with you again!",
        kind: "stage-note"
      }, { persist: true });
      setStagePromptPhase(stageKey, "waiting_understand");
      return;
    }

    if (action.id === "want_demo") {
      if (activeStageDemoDocuments.length) {
        activeStageDemoDocuments.forEach((doc, index) => {
          appendStageConversationMessage(stageKey, {
            role: "assistant",
            agent: stageAgentLabel,
            kind: "stage-note",
            content: index === 0 ? "Here are the reference documents the admin prepared for this stage. Give them a thorough read so the expected output format is clear." : "Another reference document for this stage.",
            link_url: doc.preview_url || doc.download_url || "",
            link_label: doc.name || `Open reference document ${index + 1}`
          }, { persist: true });
        });
      }
      setStagePromptPhase(stageKey, "ready");
      return;
    }

    if (action.id === "no_demo") {
      appendStageConversationMessage(stageKey, {
        role: "assistant",
        agent: stageAgentLabel,
        content: "Absolutely! I have full confidence in you. Let us move forward!",
        kind: "stage-note"
      }, { persist: true });
      setStagePromptPhase(stageKey, "ready");
      return;
    }

    if (action.id === "ready_yes") {
      await startStageWork(selectedPoint, activeStageIndex);
      return;
    }

    if (action.id === "ready_later") {
      await updateStageUnderstanding(selectedPoint, activeStageIndex, true);
      appendStageConversationMessage(stageKey, {
        role: "assistant",
        agent: stageAgentLabel,
        content: "No rush at all! I will be right here whenever you are ready. Whenever you want to begin, just say something like \"start\", \"I want to start\" or \"let's go\" and we will kick things off together!",
        kind: "stage-note"
      }, { persist: true });
      setStagePromptPhase(stageKey, "waiting_start");
      return;
    }
  };

  const updateStageUnderstanding = async (stepNumber, stageIndex, checked) => {
    const key = stageProgressKey(projectName, stepNumber, stageIndex);
    const previous = {
      selectedStageByStep,
      understood: understoodStages,
      working: workingStages,
      completed: completedStages
    };
    setUnderstoodStages((prev) => {
      const next = { ...prev, [key]: Boolean(checked) };
      if (!checked) delete next[key];
      return next;
    });
    if (!checked) {
      setWorkingStages((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setCompletedStages((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    try {
      await updateDashboardStageProgress({
        project_name: projectName,
        step_number: stepNumber,
        stage_index: stageIndex,
        understood: Boolean(checked),
        status: checked ? "undone" : "undone"
      });
    } catch {
      setUnderstoodStages(previous.understood);
      setWorkingStages(previous.working);
      setCompletedStages(previous.completed);
      toast.error("Could not save stage progress. Please try again.");
      return false;
    }
    return true;
  };

  const startStageWork = async (stepNumber, stageIndex) => {
    const key = stageProgressKey(projectName, stepNumber, stageIndex);
    const previous = {
      understood: understoodStages,
      working: workingStages,
      completed: completedStages
    };
    setSelectedStageByStep((prev) => ({ ...prev, [stepNumber]: stageIndex }));
    setUnderstoodStages((prev) => ({ ...prev, [key]: true }));
    setWorkingStages((prev) => {
      const next = { ...prev, [key]: true };
      return next;
    });
    setStagePromptPhaseByKey((prev) => ({ ...prev, [key]: "none" }));
    try {
      await updateDashboardStageProgress({
        project_name: projectName,
        step_number: stepNumber,
        stage_index: stageIndex,
        understood: true,
        status: "working"
      });
    } catch (err) {
      setSelectedStageByStep(previous.selectedStageByStep);
      setUnderstoodStages(previous.understood);
      setWorkingStages(previous.working);
      setCompletedStages(previous.completed);
      const detail = err?.response?.data?.detail;
      toast.error(detail || "Could not save working status. Please try again.");
      return false;
    }
    const point = workspacePoints[stepNumber - 1];
    const stage = point?.stages?.[stageIndex];
    const stageTitle = String(stage?.title || "No data available").trim();
    toast.success(`Started work on ${stageTitle}.`);
    appendStageConversationMessage(key, {
      role: "assistant",
      agent: stageAgentName(findMentorForStage(projectWorkspaceAgents, stage?.agent_key || point?.agent_key || activeStageAgentKey), stage?.agent_key || point?.agent_key || activeStageAgentKey),
      kind: "stage-note",
      content: stage?.document_required
        ? `Great, you are officially working on "${stageTitle}". Build the deliverable, and when it is ready, submit it here with the attachment button. I will review it and tell you clearly whether it passes or what needs revision.`
        : stage?.github_integration_required
          ? `Great, you are officially working on "${stageTitle}". Before you mark this stage completed, connect your GitHub repository from the GitHub tab so I can verify your project is linked.`
        : `Great, you are officially working on "${stageTitle}". Do the work for this stage, and when you are done, use the Completed button below so we can move to the next stage.`
    }, { persist: true });
    return true;
  };

  const requestStageComplete = (stepNumber, stageIndex) => {
    const key = stageProgressKey(projectName, stepNumber, stageIndex);
    const point = workspacePoints[stepNumber - 1] || {};
    const stage = point?.stages?.[stageIndex] || {};
    if (stage?.github_integration_required && !githubState.repository?.repository_url) {
      appendStageConversationMessage(key, {
        role: "assistant",
        agent: stageAgentName(findMentorForStage(projectWorkspaceAgents, stage?.agent_key || point?.agent_key || activeStageAgentKey), stage?.agent_key || point?.agent_key || activeStageAgentKey),
        kind: "stage-note",
        content: "Please connect your GitHub repository before completing this stage. Open the GitHub tab, add your repository details, then come back here and mark the stage completed."
      }, { persist: true });
      toast.info("Connect GitHub before completing this stage.");
      setCenterMode("github");
      return;
    }
    setStageCompleteConfirm({ open: true, stepNumber, stageIndex });
  };

  const requestStageDocumentUpload = (stepNumber, stageIndex) => {
    if (uploadingDocument) return;
    const key = stageProgressKey(projectName, stepNumber, stageIndex);
    const existing = stageDocuments[key];
    if (String(existing?.document_review_status || "").toLowerCase() === "pending") {
      toast.info("A document is already under review for this stage. Please wait for the review result before uploading another document.");
      return;
    }
    setDocumentUploadTarget({ stepNumber, stageIndex });
    documentUploadInputRef.current?.click();
  };

  const uploadStageDocumentFile = async ({ stepNumber, stageIndex, files, userMessageContent = "" }) => {
    const selectedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
    if (!selectedFiles.length) {
      return false;
    }
    const validationError = validateStageDocumentFiles(selectedFiles);
    if (validationError) {
      toast.error(validationError);
      return false;
    }
    const key = stageProgressKey(projectName, stepNumber, stageIndex);
    const existing = stageDocuments[key];
    if (String(existing?.document_review_status || "").toLowerCase() === "pending") {
      toast.info("A document is already under review for this stage. Please wait for the review result before uploading another document.");
      return false;
    }

    setUploadingDocument(true);
    let result = false;
    let pendingReviewRequest = null;
    let pendingReviewAgentName = "Mentor";
    let pendingReviewStageKey = "";
    try {
      const data = await uploadDashboardStageDocument({
        project_name: projectName,
        step_number: stepNumber,
        stage_index: stageIndex,
        files: selectedFiles
      });
      const stage = data?.stage || {};
      const stageDocumentList = normalizeStageDocuments(stage, {
        document_name: selectedFiles.length === 1 ? selectedFiles[0]?.name : ""
      });
      const latestDocument = stageDocumentList[stageDocumentList.length - 1] || {};
      pendingReviewStageKey = key;
      setCompletedStages((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setWorkingStages((prev) => ({ ...prev, [key]: true }));
      setUnderstoodStages((prev) => ({ ...prev, [key]: true }));
      setStageDocuments((prev) => ({
        ...prev,
        [key]: {
          document_required: true,
          document_url: String(stage.document_url || latestDocument.document_url || ""),
          document_name: String(stage.document_name || latestDocument.document_name || selectedFiles[0]?.name || ""),
          documents: stageDocumentList,
          document_review_status: String(stage.document_review_status || "pending"),
          document_review_feedback: String(stage.document_review_feedback || "")
        }
      }));
      setDocumentUploadTarget({ stepNumber: 0, stageIndex: 0 });
      const uploadMessage = String(userMessageContent || "").trim() || (
        stageDocumentList.length
          ? `Uploaded documents:\n${stageDocumentList.map((doc) => `- ${doc.document_name || doc.document_url || "Document"}`).join("\n")}`
          : "Uploaded documents for this stage."
      );
      await appendStageConversationMessage(key, {
        role: "user",
        agent: "You",
        content: uploadMessage,
        kind: "stage_document_upload",
        metadata: {
          document_submission_group_id: String(latestDocument.submission_group_id || stage.document_submission_group_id || ""),
          documents: stageDocumentList
        }
      }, { persist: true });
      toast.success(
        stageDocumentList.length > 1
          ? `${stageDocumentList.length} documents uploaded. Reviewing against the stage deliverable...`
          : `${stageDocumentList[0]?.document_name || "Document"} uploaded. Reviewing against the stage deliverable...`
      );
      result = {
        stage,
        pendingReview: true,
        documents: stageDocumentList
      };

      setReviewingDocument(true);
      const point = workspacePoints[stepNumber - 1];
      const reviewStage = point?.stages?.[stageIndex] || {};
      const selectedAgent =
        findMentorForStage(projectWorkspaceAgents, reviewStage?.agent_key || point?.agent_key || "pm_agent") ||
        projectWorkspaceAgents[0] ||
        null;
      pendingReviewAgentName = selectedAgent?.name || stageAgentName(activeStageMentor, activeStageAgentKey);
      pendingReviewRequest = {
        project_name: projectName,
        step_number: stepNumber,
        stage_index: stageIndex,
        stage_key: key,
        stage_title: reviewStage.title || "No data available",
        objective: reviewStage.objective || "",
        deliverable: reviewStage.deliverable || "",
        stage_context: reviewStage.stage_context || "",
        preferred_agent: selectedAgent?.backend_key || backendKeyForStageAgent(reviewStage?.agent_key || point?.agent_key || "pm_agent"),
        mentor_id: selectedAgent?.id || null,
        document_url: String(stage.document_url || ""),
        document_name: String(stage.document_name || latestDocument.document_name || selectedFiles[0]?.name || ""),
        documents: stageDocumentList
      };
      const reviewData = await reviewStageDocument(pendingReviewRequest);
      const reviewedStage = reviewData?.stage || {};
      const passed = Boolean(reviewData?.passed);
      const reviewedDocumentList = normalizeStageDocuments(reviewedStage, {
        document_url: stage.document_url,
        document_name: stage.document_name || latestDocument.document_name || selectedFiles[0]?.name
      });
      const reviewedLatestDocument = reviewedDocumentList[reviewedDocumentList.length - 1] || {};
      setStageDocuments((prev) => ({
        ...prev,
        [key]: {
          document_required: true,
          document_url: String(reviewedStage.document_url || stage.document_url || reviewedLatestDocument.document_url || ""),
          document_name: String(reviewedStage.document_name || stage.document_name || reviewedLatestDocument.document_name || selectedFiles[0]?.name || ""),
          documents: reviewedDocumentList,
          document_review_status: String(reviewedStage.document_review_status || (passed ? "approved" : "rejected")),
          document_review_feedback: String(reviewedStage.document_review_feedback || reviewData?.message || "")
        }
      }));
      if (reviewData?.message && !reviewData?.already_reviewed) {
        const reviewMessage = {
          role: "assistant",
          agent: selectedAgent?.name || stageAgentName(activeStageMentor, activeStageAgentKey),
          content: reviewData.message,
          kind: passed ? "review-approved" : "review-rejected"
        };
        setMessages((prev) => [...prev, reviewMessage]);
        setStageMessagesByKey((prev) => ({
          ...prev,
          [key]: [...(prev[key] || []), reviewMessage]
        }));
        setCenterMode("context");
      }
      if (passed) {
        const nextCompletedForCheck = { ...completedStages, [key]: true };
        setCompletedStages((prev) => ({ ...prev, [key]: true }));
        setWorkingStages((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        toast.success("Document approved. Stage completed.");
        const stages = workspacePoints[stepNumber - 1]?.stages || [];
        const allStagesCompleted = stages.length > 0 && stages.every((_, index) => nextCompletedForCheck[stageProgressKey(projectName, stepNumber, index)]);
        addStageCompletionMessage(key, { finalStage: allStagesCompleted });
        if (allStagesCompleted) {
          completeStepByNumber(stepNumber);
        }
      } else {
        const githubOnlyBlock = String(reviewedStage.document_review_status || "").toLowerCase() === "approved";
        setCompletedStages((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setWorkingStages((prev) => ({ ...prev, [key]: true }));
        if (githubOnlyBlock) {
          toast.info("Document approved. Connect GitHub to complete this stage.");
          setCenterMode("github");
        } else if (reviewData?.size_validation_failed) {
          toast.error("Document is too large. Please re-upload a shorter document.");
        } else {
          toast.error("Document needs revision. Check the mentor feedback in chat.");
        }
      }
      result = {
        stage: reviewedStage,
        passed,
        documents: reviewedDocumentList,
        reviewData
      };
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (pendingReviewRequest) {
        setChatServiceAvailable(false);
        let failedStage = null;
        try {
          const failedData = await markDashboardStageDocumentReviewFailed({
            project_name: projectName,
            step_number: stepNumber,
            stage_index: stageIndex,
            feedback: DOCUMENT_REVIEW_FAILED_MESSAGE
          });
          failedStage = failedData?.stage || null;
        } catch (markError) {
          console.error("Could not clear pending document review status", markError);
        }
        appendStageConversationMessage(pendingReviewStageKey, {
          role: "assistant",
          agent: pendingReviewAgentName,
          content: DOCUMENT_REVIEW_FAILED_MESSAGE,
          kind: "mentor-busy"
        }, { persist: true });
        setStageDocuments((prev) => ({
          ...prev,
          [pendingReviewStageKey]: {
            ...(prev[pendingReviewStageKey] || {}),
            ...(failedStage || {}),
            document_review_status: "not_submitted",
            document_review_feedback: DOCUMENT_REVIEW_FAILED_MESSAGE
          }
        }));
        toast.error("Document uploaded, but review failed. Please re-upload or try again manually.");
      } else {
        toast.error(detail || "Could not upload document. Please try again.");
      }
    } finally {
      setUploadingDocument(false);
      setReviewingDocument(false);
    }
    return result;
  };

  const handleStageDocumentFileChange = async (event) => {
    const files = Array.from(event.target.files || []);
    const { stepNumber, stageIndex } = documentUploadTarget;
    event.target.value = "";
    if (!files.length || !stepNumber) return;
    await uploadStageDocumentFile({ stepNumber, stageIndex, files });
  };

  const confirmStageComplete = async () => {
    const { stepNumber, stageIndex } = stageCompleteConfirm;
    const key = stageProgressKey(projectName, stepNumber, stageIndex);
    const nextCompletedForCheck = { ...completedStages, [key]: true };
    const previous = {
      understood: understoodStages,
      working: workingStages,
      completed: completedStages
    };
    setCompletedStages((prev) => {
      const next = { ...prev, [key]: true };
      return next;
    });
    setWorkingStages((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setUnderstoodStages((prev) => {
      const next = { ...prev, [key]: true };
      return next;
    });
    setStageCompleteConfirm({ open: false, stepNumber: 0, stageIndex: 0 });
    try {
      await updateDashboardStageProgress({
        project_name: projectName,
        step_number: stepNumber,
        stage_index: stageIndex,
        understood: true,
        status: "completed"
      });
    } catch (err) {
      setUnderstoodStages(previous.understood);
      setWorkingStages(previous.working);
      setCompletedStages(previous.completed);
      const detail = err?.response?.data?.detail;
      toast.error(detail || "Could not save completed status. Please try again.");
      return;
    }
    toast.success("Stage marked completed.");
    const stages = workspacePoints[stepNumber - 1]?.stages || [];
    const allStagesCompleted = stages.length > 0 && stages.every((_, index) => nextCompletedForCheck[stageProgressKey(projectName, stepNumber, index)]);
    addStageCompletionMessage(key, { finalStage: allStagesCompleted });
    if (allStagesCompleted) {
      completeStepByNumber(stepNumber);
    }
  };

  const handleConnectGithub = async (payload) => {
    setGithubLoading(true);
    try {
      const data = await connectGithub(payload);
      await loadReviewState();
      if (data?.webhook_status?.enabled) {
        toast.success("GitHub connected and webhook is active.");
      } else if (data?.webhook_status?.status === "failed") {
        toast.error("GitHub connected, but webhook setup failed. Push reviews will not run yet.");
      } else {
        toast.info("GitHub connected. Webhook setup is not configured yet.");
      }
      setCenterMode("review");
    } finally {
      setGithubLoading(false);
    }
  };

  const openAgentChat = (agent) => {
    const existingStageMessages = stageMessagesByKey[currentStageKey] || [];
    if (existingStageMessages.length) {
      setSelectedAgent(agent);
      setMessages(existingStageMessages);
      return;
    }
    const nextMessages = [
      {
        role: "assistant",
        agent: agent.name,
        content: `Hi, I am ${agent.name}, your ${agent.role.toLowerCase()}. Tell me what you are working on, and I will help you move forward step by step.`
      }
    ];
    setSelectedAgent(agent);
    setMessages(nextMessages);
    setStageMessagesByKey((prev) => ({ ...prev, [currentStageKey]: nextMessages }));
  };

  const promptTaskView = taskViewByStep[selectedPoint] || "about";
  const promptActiveStageKey = currentStageKey;
  const storedUser = storedUserState;
  const storedProfile = storedProfileState;
 const studentName = useMemo(() => {

    const name = String(
        storedProfile?.full_name ||
        storedUser?.full_name ||
        storedUser?.name ||
        storedProfile?.email?.split("@")?.[0] ||
        storedUser?.email?.split("@")?.[0] ||
        ""
    ).trim();

    return name || "there";

}, [storedProfile, storedUser]);
const studentAvatarUrl = useMemo(() => {

    const avatar =
        storedProfile?.avatar_url ||
        storedProfile?.profile_image_url ||
        storedProfile?.profile_picture ||
        storedProfile?.image_url ||
        storedUser?.avatar_url ||
        storedUser?.profile_image_url ||
        storedUser?.profile_picture ||
        storedUser?.image_url ||
        profileAvatarUrl ||
        "";

    return resolveAuthAssetUrl(avatar);

}, [
    profileAvatarUrl,
    storedProfile,
    storedUser
]);
  const stageAgentLabel = stageAgentName(activeStageMentor, activeStageAgentKey);
  const stageDisplayAgentLabel = displayStageAgentName(
    stageAgentLabel,
    activeStageMentor?.name || selectedAgent?.name || stageAgentLabel || "Mentor"
  );
  const mentorAvatarMap = useMemo(() => {
    const entries = {};
    const add = (key, url) => {
      const normalizedKey = String(key || "").trim().toLowerCase();
      const normalizedUrl = String(url || "").trim();
      if (normalizedKey && normalizedUrl) entries[normalizedKey] = normalizedUrl;
    };
    (workspaceAgents || []).forEach((agent) => {
      const avatarUrl = agent?.avatar_url || "";
      add(agent?.name, avatarUrl);
      add(agent?.mentor_name, avatarUrl);
      add(agent?.role, avatarUrl);
      add(agent?.agent_key, avatarUrl);
      add(agent?.backend_key, avatarUrl);
    });
    add(activeStageMentor?.name, activeStageMentor?.avatar_url);
    add(activeStageMentor?.role, activeStageMentor?.avatar_url);
    add(activeStageMentor?.agent_key, activeStageMentor?.avatar_url);
    add(stageAgentLabel, activeStageMentor?.avatar_url || selectedAgent?.avatar_url);
    add(stageDisplayAgentLabel, activeStageMentor?.avatar_url || selectedAgent?.avatar_url);
    add("internzbee crew", activeStageMentor?.avatar_url || selectedAgent?.avatar_url);
    add("mentor", activeStageMentor?.avatar_url || selectedAgent?.avatar_url);
    add("project manager", activeStageMentor?.avatar_url || selectedAgent?.avatar_url);
    return entries;
  }, [activeStageMentor, selectedAgent, stageAgentLabel, stageDisplayAgentLabel, workspaceAgents]);

  useEffect(() => {
    let cancelled = false;
    if (!authReady || workspaceMode === "demo") {
      setProfileAvatarUrl("");
      return () => {
        cancelled = true;
      };
    }
    getProfile()
      .then((data) => {
        if (cancelled) return;
        setProfileAvatarUrl(resolveAuthAssetUrl(data?.profile?.profile_image_url || data?.profile_image_url || ""));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authReady, workspaceMode]);
  const stageIntroMessages = useMemo(() => {
    if (!activeStageData) return [];
    const agent = stageDisplayAgentLabel;
    const items = [];
    const isFirstProjectStage = selectedPoint === 1 && activeStageIndex === 0;
    if (isFirstProjectStage) {
      const projectTitle = String(catalogProject?.title || projectName || "this project").trim();
      const isDemoProject = Boolean(catalogProject?.is_demo_project);
      items.push({
        role: "assistant",
        agent,
        kind: "stage-note",
        content: isDemoProject
          ? `${timeGreeting()}, ${studentName}! Welcome to the ${projectTitle} trial project. This is a practice trial, not a paid internship project, so use it to understand the workflow before unlocking internship projects. Take your time reading through the context; it will make everything that follows much smoother!`
          : `${timeGreeting()}, ${studentName}! Welcome to the ${projectTitle} project. We are running this exactly like a real industry engagement - so before jumping into execution, let us make sure you have the full business picture. Take your time reading through the context; it will make everything that follows much smoother!`
      });
    }
    const objective = String(activeStageData.objective || activeStageData.stage_context || "").trim();
    if (objective) {
      items.push({ role: "assistant", agent, kind: "stage-detail", label: "Objective", content: objective });
    }
    const deliverable = String(activeStageData.deliverable || "").trim();
    if (deliverable) {
      items.push({ role: "assistant", agent, kind: "stage-detail", label: "Deliverable", content: deliverable });
    }
    if (activeStageData.github_integration_required) {
      items.push({
        role: "assistant",
        agent,
        kind: "stage-detail",
        label: "GitHub integration",
        content: "This stage needs your GitHub repository connected before you can move forward. Open the GitHub tab, connect your repo, then come back and mark this stage completed."
      });
    }
    return items;
  }, [activeStageData, activeStageIndex, catalogProject, projectName, selectedPoint, stageDisplayAgentLabel, studentName]);
  const stagePromptPhase = stagePromptPhaseByKey[currentStageKey] || "understanding";
  const stageDialogMessages = useMemo(() => {
    if (!activeStageData || activeStageCompleted || activeStageWorking) return [];
    if (stagePromptPhase === "none" || stagePromptPhase === "waiting_understand" || stagePromptPhase === "waiting_start") return [];
    const agent = stageDisplayAgentLabel;

    if (stagePromptPhase === "understanding") {
      return [
        {
          role: "assistant",
          agent,
          kind: "stage-action",
          content: "Take a moment to review the stage details above - the objective, context, and what you need to deliver. Once you feel confident about what is expected, let me know and we will move to the next step!",
          actions: [
            { id: "understand_yes", label: "Got it, let's move on!", variant: "primary" },
            { id: "understand_no", label: "I need more time" }
          ]
        }
      ];
    }

    if (stagePromptPhase === "demo_offer") {
      return [
        {
          role: "assistant",
          agent,
          kind: "stage-action",
          content: "Before we dive in - the admin has uploaded reference sample documents for this stage. Think of it as a guide to understand exactly what kind of output is expected. Would you like to take a look at it?",
          actions: [
            { id: "want_demo", label: "Yes, I want to see it!", variant: "primary" },
            { id: "no_demo", label: "No, I will do it myself" }
          ]
        }
      ];
    }

    if (stagePromptPhase === "ready") {
      return [
        {
          role: "assistant",
          agent,
          kind: "stage-action",
          content: "You are all set! Ready to roll up your sleeves and start working on this stage? Once you begin, there is no turning back - so give it everything you have got!",
          actions: [
            { id: "ready_yes", label: "Yes, let's get started!", variant: "primary" },
            { id: "ready_later", label: "I will start a bit later" }
          ]
        }
      ];
    }

    return [];
  }, [activeStageCompleted, activeStageData, activeStageWorking, stageDisplayAgentLabel, stagePromptPhase]);

  useEffect(() => {
    if (!stageDialogMessages.length) {
      setStageDialogVisible(false);
      return undefined;
    }
    setStageDialogVisible(false);
    const timer = window.setTimeout(() => setStageDialogVisible(true), 700);
    return () => window.clearTimeout(timer);
  }, [currentStageKey, stagePromptPhase, activeStageWorking, activeStageCompleted, stageDialogMessages.length]);

  const visibleStagePromptMessages = stageIntroMessages.slice(0, visibleStageMessageCount);
  const stageIntroComplete = visibleStageMessageCount >= stageIntroMessages.length;
  const stageDialogReady = stageIntroComplete && stageDialogVisible;
  const stageDialogThinking = stageIntroComplete && stageDialogMessages.length > 0 && !stageDialogVisible;
  const normalizeVisibleStageMessage = (message, fallbackAgentName = stageDisplayAgentLabel) => (
    message?.role === "assistant"
      ? { ...message, agent: displayStageAgentName(message.agent, fallbackAgentName) }
      : message
  );
  // Stage details appear first; the action dialog is rendered as the next chat bubble after them.
  const stageConversationMessages = [...visibleStagePromptMessages, ...currentStageChatMessages]
    .map((message) => normalizeVisibleStageMessage(message));
  const latestSpecificStageAgent = [...stageConversationMessages]
    .reverse()
    .find((message) => message?.role === "assistant" && !isGenericStageAgentName(message.agent))?.agent;
  const activeDialogMessage = stageDialogReady
    ? normalizeVisibleStageMessage(stageDialogMessages[0] || null, latestSpecificStageAgent || stageDisplayAgentLabel)
    : null;
  const loadingStageAgentLabel = displayStageAgentName(
    activeStageMentor?.name ||
      activeStageMentor?.role ||
      stageDisplayAgentLabel ||
      selectedAgent?.name ||
      selectedAgent?.role ||
      "Mentor",
    latestSpecificStageAgent ||
      activeStageMentor?.name ||
      selectedAgent?.name ||
      stageDisplayAgentLabel ||
      "Mentor"
  );

  useEffect(() => {
    if (!currentStageKey) return;
    if (activeStageCompleted || activeStageWorking) {
      setStagePromptPhaseByKey((prev) => {
        if (prev[currentStageKey] === "none") return prev;
        return { ...prev, [currentStageKey]: "none" };
      });
      return;
    }
    // Don't initialise until DB progress has loaded - avoids stale "understanding" flash
    if (!stageProgressLoaded) return;
    setStagePromptPhaseByKey((prev) => {
      const existing = prev[currentStageKey];
      // Preserve any explicit in-session choice (demo_offer, ready, waiting_understand, waiting_start, none)
      // but allow upgrading the default "understanding" if understood data arrives async
      const sessionLocked = ["demo_offer", "waiting_understand", "waiting_start", "none"];
      if (existing && sessionLocked.includes(existing)) return prev;
      // If already "ready" and understood is still true, keep it
      if (existing === "ready" && Boolean(understoodStages[currentStageKey])) return prev;
      // Compute correct initial phase based on DB-loaded understood flag
      const startPhase = Boolean(understoodStages[currentStageKey]) ? "ready" : "understanding";
      if (existing === startPhase) return prev;
      return { ...prev, [currentStageKey]: startPhase };
    });
  }, [activeStageCompleted, activeStageWorking, currentStageKey, understoodStages, stageProgressLoaded]);

  useEffect(() => {
    if (promptTaskView !== "stage" || !activeStageData) {
      setVisibleStageMessageCount(0);
      setStagePromptAnimating(false);
      return undefined;
    }

    if (stagePromptSeenKey && localStorage.getItem(stagePromptSeenKey) === "1") {
      setVisibleStageMessageCount(stageIntroMessages.length);
      setStagePromptAnimating(false);
      return undefined;
    }

    setVisibleStageMessageCount(0);
    setStagePromptAnimating(stageIntroMessages.length > 0);
    const timers = stageIntroMessages.map((_, index) =>
      window.setTimeout(() => {
        setVisibleStageMessageCount((count) => {
          const nextCount = Math.max(count, index + 1);
          if (nextCount >= stageIntroMessages.length) {
            if (stagePromptSeenKey) localStorage.setItem(stagePromptSeenKey, "1");
            setStagePromptAnimating(false);
          }
          return nextCount;
        });
      }, STAGE_PROMPT_INITIAL_DELAY_MS + index * STAGE_PROMPT_MESSAGE_GAP_MS)
    );
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [activeStageData, promptActiveStageKey, promptTaskView, stageIntroMessages, stagePromptSeenKey]);

  // ---- Derived values that were previously computed just before the JSX return ----
  const unlockedMaxPoint = Math.max(1, clampStep(methodState.current_step, workspacePoints.length || 1));
  const canSelectPoint = (point) => Number(point) <= unlockedMaxPoint;
  const progressForPoint = (point) => {
    if (isPointCompleted(point)) return 100;
    const stages = workspacePoints[Number(point) - 1]?.stages || [];
    const totalStages = Math.max(1, stages.length || 1);
    const doneStages = stages.filter((_, stageIndex) => completedStages[stageProgressKey(projectName, point, stageIndex)]).length;
    return Math.round((doneStages / totalStages) * 100);
  };
  const canAccessStage = (stepNumber, stageIndex) => {
    if (selectedPointCompleted) return false;
    for (let index = 0; index < stageIndex; index += 1) {
      if (!completedStages[stageProgressKey(projectName, stepNumber, index)]) {
        return false;
      }
    }
    return true;
  };
  const selectedPointProgress = progressForPoint(selectedPoint);
  const activePhaseTimeline =
    Number(catalogProject?.phase_timeline?.step_number) === Number(selectedPoint) ? catalogProject.phase_timeline : null;
  const activePhaseTimelineStatus = String(activePhaseTimeline?.status || "");
  const activePhaseDuration = formatPhaseDuration(selectedPointData);
  const activePhaseTimelineTone =
    activePhaseTimelineStatus === "not_defined" || !selectedPointData?.duration_defined
      ? "border-slate-200 bg-slate-50 text-slate-600"
      : activePhaseTimelineStatus === "delayed" || activePhaseTimelineStatus === "completed_late"
      ? "border-red-200 bg-red-50 text-red-700"
      : activePhaseTimelineStatus === "near_deadline"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";
  const activePhaseTimelineLabel =
    activePhaseTimelineStatus === "not_defined" || !selectedPointData?.duration_defined
      ? null
      : activePhaseTimelineStatus === "delayed" || activePhaseTimelineStatus === "completed_late"
      ? `${Math.abs(Number(activePhaseTimeline?.days_left) || 0)} day${Math.abs(Number(activePhaseTimeline?.days_left) || 0) === 1 ? "" : "s"} delayed`
      : activePhaseTimelineStatus === "near_deadline"
        ? `Near deadline: ${Number(activePhaseTimeline?.days_left) || 0} day${Number(activePhaseTimeline?.days_left) === 1 ? "" : "s"} left`
        : activePhaseTimelineStatus === "completed_on_time"
          ? "Completed on time"
        : activePhaseTimeline?.due_at
          ? "On track"
          : activePhaseDuration && activePhaseDuration !== "Not defined"
            ? `Timeline: ${activePhaseDuration}`
            : null;
  const taskView = taskViewByStep[selectedPoint] || "about";
  const activeStageUploadedDocument = stageDocuments[activeStageKey];
  const activeStageRequiresDocument = Boolean(activeStageData?.document_required) || Boolean(activeStageUploadedDocument?.document_required);
  const activeStageRequiresGithub = Boolean(activeStageData?.github_integration_required);
  const githubConnected = Boolean(githubState.repository?.repository_url);
  const activeStageUploadedDocuments = normalizeStageDocuments(activeStageUploadedDocument);
  const companyProfileText = String(catalogProject?.company_profile_text || catalogProject?.introduction_document || "").trim();
  const companyProfileUrl = String(catalogProject?.introduction_document_url || "").trim();
  const activeStageDocumentReviewStatus = String(activeStageUploadedDocument?.document_review_status || "").toLowerCase();
  const activeStageUnlocked = canAccessStage(selectedPoint, activeStageIndex);
  const activeStageStatusText = activeStageCompleted
    ? "Completed"
    : activeStageRequiresDocument && activeStageDocumentReviewStatus === "pending"
      ? "Review pending"
      : activeStageRequiresDocument && activeStageDocumentReviewStatus === "rejected"
        ? "Needs revision"
    : activeStageWorking
      ? "Working"
      : activeStageChecked
        ? "Ready to work"
        : activeStageUnlocked
          ? "Undone"
          : "Locked";
  const activeStageStatusClass = activeStageCompleted
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : activeStageRequiresDocument && activeStageDocumentReviewStatus === "pending"
      ? "border-sky-200 bg-sky-50 text-sky-700"
      : activeStageRequiresDocument && activeStageDocumentReviewStatus === "rejected"
        ? "border-red-200 bg-red-50 text-red-700"
    : activeStageWorking
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : activeStageChecked
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : !activeStageUnlocked
          ? "border-slate-200 bg-slate-100 text-slate-500"
          : "border-red-200 bg-red-50 text-red-700";
  const finalStageActive = activeStageIndex >= Math.max(0, selectedPointStages.length - 1);
  const hasNextPoint = selectedPoint < workspacePoints.length;
  const canGoBackInTaskFlow = taskView === "stage" || selectedPoint > 1;
  const openSelectedPointStages = () => {
    setTaskViewByStep((prev) => ({ ...prev, [selectedPoint]: "stage" }));
    setSelectedStageByStep((prev) => {
      if (prev[selectedPoint] !== undefined) return prev;
      const firstStageIndex = nextOpenStageIndex >= 0 ? nextOpenStageIndex : 0;
      return { ...prev, [selectedPoint]: firstStageIndex };
    });
  };
  const goBackInTaskFlow = () => {
    if (taskView === "stage") {
      if (activeStageIndex > 0) {
        setSelectedStageByStep((prev) => ({ ...prev, [selectedPoint]: activeStageIndex - 1 }));
        return;
      }
      setTaskViewByStep((prev) => ({ ...prev, [selectedPoint]: "about" }));
      return;
    }
    if (selectedPoint > 1) {
      const previousPoint = selectedPoint - 1;
      const previousStages = workspacePoints[previousPoint - 1]?.stages || [];
      setSelectedPoint(previousPoint);
      setTaskViewByStep((prev) => ({ ...prev, [previousPoint]: "stage" }));
      setSelectedStageByStep((prev) => ({ ...prev, [previousPoint]: Math.max(0, previousStages.length - 1) }));
      setCenterMode("context");
    }
  };
  const goToNextTaskStep = async () => {
    if (taskView !== "stage") {
      openSelectedPointStages();
      return;
    }
    if (!activeStageCompleted) return;
    if (finalStageActive) {
      if (!hasNextPoint) return;
      if (!selectedPointCompleted) {
        await completeStepByNumber(selectedPoint);
      }
      const nextPoint = selectedPoint + 1;
      setSelectedPoint(nextPoint);
      setTaskViewByStep((prev) => ({ ...prev, [nextPoint]: "about" }));
      setCenterMode("context");
      return;
    }
    setSelectedStageByStep((prev) => ({ ...prev, [selectedPoint]: activeStageIndex + 1 }));
  };
  const navbarProjectTitle = String(catalogProject?.title || projectName || "").trim() || "Workspace";
  const isDemoProject = Boolean(catalogProject?.is_demo_project);
  const navbarStageTitle =
    String(activeStageData?.title || currentMethodStep?.title || workspacePoints[workspaceCurrentStep - 1]?.title || "").trim() || "No data available";
  const navbarTotalSteps = Math.max(1, workspacePoints.length || methodTotalSteps || 1);
  const navbarTimeline = activePhaseTimelineLabel || activePhaseDuration || null;
  const navbarProgress = Math.round(selectedPointProgress);
  const navbarProgressComplete = navbarProgress >= 100;
  const navbarTimelineComplete = activePhaseTimelineStatus === "completed_on_time" || activePhaseTimelineStatus === "completed_late";
  const navbarTimelineAlert = activePhaseTimelineStatus === "delayed" || activePhaseTimelineStatus === "completed_late";
  const navbarTimelineNear = activePhaseTimelineStatus === "near_deadline";

  return {
    // routing / toast
    router,
    toast,

    // top-level gating state
    ready,
    loading,
    workspaceError,
    workspaceClosed,
    projectName,

    // chat / mentor state
    chatLoading,
    chatServiceAvailable,
    selectedAgent,
    setSelectedAgent,

    // github / review state
    githubLoading,
    reviewLoading,
    githubState,
    handleConnectGithub,
    loadReviewState,

    // catalog / methodology
    catalogProject,
    methodState,
    methodTotalSteps,
    methodDisplayStep,
    currentMethodStep,
    centerTabs,
    workspacePoints,
    hasProjectMethodology,
    projectWorkspaceAgents,
    visibleProjectWorkspaceAgents,
    workspaceCurrentStep,
    workspaceProgress,
    methodCompleted,
    currentInstruction,

    // center / navigation state
    centerMode,
    setCenterMode,
    selectedPoint,
    setSelectedPoint,
    selectedStageByStep,
    setSelectedStageByStep,
    taskViewByStep,
    setTaskViewByStep,

    // stage progress state
    understoodStages,
    workingStages,
    completedStages,
    stageDocuments,
    stageCompleteConfirm,
    setStageCompleteConfirm,
    workspaceAgents,
    documentUploadTarget,
    uploadingDocument,
    reviewingDocument,
    pendingMentorReply,

    // ui state
    phaseListOpen,
    setPhaseListOpen,
    showTour,
    setShowTour,
    showWelcome,
    setShowWelcome,
    showDisclaimer,
    setShowDisclaimer,
    visibleStageMessageCount,
    stagePromptAnimating,
    stagePromptPhaseByKey,
    stageDialogVisible,
    stageProgressLoaded,
    profileAvatarUrl,

    // chat messages
    messages,
    setMessages,
    stageMessagesByKey,
    historyLoadedProject,

    // refs
    documentUploadInputRef,

    // selected / active point + stage derived data
    selectedPointData,
    selectedPointStages,
    selectedStageIndex,
    activeStageIndex,
    activeStageData,
    activeStageAgentKey,
    activeStageMentor,
    activeStageContext,
    activeStageDemoDocumentIds,
    activeStageDemoDocuments,
    activeStageDemoDocument,
    currentStageKey,
    currentStageChatMessages,

    // stage status flags
    isPointCompleted,
    selectedPointCompleted,
    activeStageKey,
    activeStageCompleted,
    activeStageWorking,
    activeStageChecked,

    // handlers
    handleDisclaimerAccept,
    completeTour,
    sendMessage,
    addStageCompletionMessage,
    persistLocalStageMessage,
    appendStageConversationMessage,
    setStagePromptPhase,
    handleStagePromptAction,
    updateStageUnderstanding,
    startStageWork,
    requestStageComplete,
    requestStageDocumentUpload,
    uploadStageDocumentFile,
    handleStageDocumentFileChange,
    confirmStageComplete,
    openAgentChat,
    completeStepByNumber,
    loadBackendProgress,
    loadStageProgress,

    // stage prompt / dialog derived data
    promptTaskView,
    promptActiveStageKey,
    storedUser,
    storedProfile,
    studentName,
    studentAvatarUrl,
    stageAgentLabel,
    stageDisplayAgentLabel,
    mentorAvatarMap,
    stageIntroMessages,
    stagePromptPhase,
    stageDialogMessages,
    visibleStagePromptMessages,
    stageIntroComplete,
    stageDialogReady,
    stageDialogThinking,
    stageConversationMessages,
    latestSpecificStageAgent,
    activeDialogMessage,
    loadingStageAgentLabel,

    // post-gating derived values (safe to compute unconditionally)
    unlockedMaxPoint,
    canSelectPoint,
    progressForPoint,
    canAccessStage,
    selectedPointProgress,
    activePhaseTimeline,
    activePhaseTimelineStatus,
    activePhaseDuration,
    activePhaseTimelineTone,
    activePhaseTimelineLabel,
    taskView,
    activeStageUploadedDocument,
    activeStageRequiresDocument,
    activeStageRequiresGithub,
    githubConnected,
    activeStageUploadedDocuments,
    companyProfileText,
    companyProfileUrl,
    activeStageDocumentReviewStatus,
    activeStageUnlocked,
    activeStageStatusText,
    activeStageStatusClass,
    finalStageActive,
    hasNextPoint,
    canGoBackInTaskFlow,
    openSelectedPointStages,
    goBackInTaskFlow,
    goToNextTaskStep,
    navbarProjectTitle,
    isDemoProject,
    navbarStageTitle,
    navbarTotalSteps,
    navbarTimeline,
    navbarProgress,
    navbarProgressComplete,
    navbarTimelineComplete,
    navbarTimelineAlert,
    navbarTimelineNear,

    // helper functions exposed for presentation reuse
    labelForAgent,
    formatPhaseDuration,
    stageProgressKey
  };
}
