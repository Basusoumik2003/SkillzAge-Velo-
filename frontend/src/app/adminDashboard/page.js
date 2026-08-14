"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Pencil, RefreshCcw, ShieldAlert, Sparkles, Trash2, Users } from "lucide-react";
import AdminDashboardNav from "@/components/adminDashboard/AdminDashboardNav";
import { ADMIN_NAV_GROUPS } from "@/components/adminDashboard/adminNavData";
import {
  bulkUploadAdminProjects,
  createAdminMentor,
  createAdminProject,
  deleteAdminMentor,
  deleteAdminProjectDraft,
  getAdminProjectDraft,
  listAdminCompanies,
  listAdminDemoDocuments,
  listAdminMentors,
  listAdminProjects,
  saveAdminProjectDraft,
  updateAdminMentor,
} from "@/lib/admin";

const SECTION_TITLES = {
  overview: "Overview",
  token_management: "Token Management",
  rag_monitoring: "RAG Monitoring",
  stage_document_reviews: "Document Reviews",
  video_analytics: "Video Analytics",
  admin_access: "Admin Access",
  user_management: "User Management",
  certificate_requests: "Certificate Requests",
  project_usage: "Project Usage",
  project_create: "Create Project",
  project_catalog: "Project Catalog",
  companies: "Companies",
  project_documents: "Project Documents",
  global_documents: "Global Documents",
  demo_documents: "Demo Documents",
  assign_manual: "Manual Assign",
  assign_requests: "Assignment Requests",
  assigned_projects: "Assigned Projects",
  mentors: "Mentors",
  mentor_chat_rules: "Mentor Chat Rules",
  recommendations: "Recommendations",
  testimonials: "Testimonials",
  home_certificates: "Home Certificates",
  category_icons: "Category Icons",
  contact_messages: "Contact Messages",
  newsletters: "Newsletters",
  coin_pricing: "Coin Pricing",
  github_settings: "GitHub Settings",
  s3_cleanup: "S3 Cleanup",
  theme_management: "Theme Management",
};

const NAV_BADGES = {
  overview: 1,
  token_management: 2,
  rag_monitoring: 2,
  stage_document_reviews: 1,
  video_analytics: 1,
};

const OVERVIEW_STATS = [
  {
    label: "Total Users",
    value: "36",
    detail: "0% paid conversion",
    tone: "rose",
    icon: Users,
  },
  {
    label: "Paid Revenue",
    value: "₹0.00",
    detail: "0 coins sold",
    tone: "emerald",
    icon: Sparkles,
  },
  {
    label: "Active Projects",
    value: "9",
    detail: "0 total catalog projects",
    tone: "sky",
    icon: ChevronRight,
  },
  {
    label: "Certificate Requests",
    value: "0",
    detail: "0 pending review",
    tone: "amber",
    icon: ShieldAlert,
  },
];

const PROJECT_ACTIVITY = [
  { name: "IPL Cricket Dashboard", score: 5 },
  { name: "LinkForge: URL Shortener Backend Service", score: 2 },
  { name: "Customer Retention Campaign", score: 2 },
  { name: "J.A.R.V.I.S. - Just A Reliable Virtual Intelligence System", score: 1 },
  { name: "Commercial Contract Review and Risk Assessment", score: 1 },
];

const PROJECT_SCHEMA_FIELDS = [
  "company_id",
  "title",
  "description",
  "timeline_weeks",
  "project_coins",
  "category",
  "global_category",
  "complexity",
  "keywords",
  "skills_required",
  "skills_gained",
  "target_branch",
  "target_year",
  "tech_stack",
  "short_summary",
  "domain",
  "prerequisites",
  "learning_outcomes",
  "difficulty_score",
  "is_active",
  "is_demo_project",
  "introduction_document",
  "private_brd_document",
  "solution_document",
  "steps_json",
];

const PROJECT_DATABASE_TABLES = [
  { name: "companies", use: "Owner company / tenant mapping" },
  { name: "projects", use: "Main project catalog record" },
  { name: "project_steps", use: "Phase and stage source of truth" },
  { name: "project_documents", use: "Project-specific document links" },
  { name: "project_assignment_requests", use: "Project handoff requests" },
];

const PROJECT_PREVIEW_DATA = [
  {
    id: 1,
    title: "IPL Cricket Dashboard",
    company: "InternzBee Default",
    category: "web",
    weeks: 6,
    coins: 3,
    active: true,
  },
  {
    id: 2,
    title: "LinkForge URL Shortener",
    company: "InternzBee Default",
    category: "normal",
    weeks: 4,
    coins: 1,
    active: true,
  },
  {
    id: 3,
    title: "Customer Retention Campaign",
    company: "InternzBee Default",
    category: "web",
    weeks: 5,
    coins: 2,
    active: false,
  },
];

const GLOBAL_CATEGORIES = [
  { value: "", label: "No global RAG category" },
  { value: "business_commerce", label: "Business & Commerce" },
  { value: "technology_engineering", label: "Technology & Engineering" },
  { value: "science_research", label: "Science & Research" },
  { value: "human_social_science", label: "Human & Social Science" },
  { value: "media_communication", label: "Media & Communication" },
  { value: "law", label: "Law" },
];

const MENTOR_OUTPUT_FORMATS = [
  { value: "markdown", label: "Markdown" },
  { value: "plain_text", label: "Plain Text" },
  { value: "json", label: "JSON" },
];

const MENTOR_FORM_INITIAL = {
  agentKey: "",
  mentorName: "",
  role: "",
  goal: "",
  backstory: "",
  outputFormat: "markdown",
  isHidden: false,
};

function createEmptyStage(index = 0) {
  return {
    title: `Stage ${index + 1}`,
    agentKey: "",
    stageContext: "",
    objective: "",
    deliverable: "",
    documentRequired: false,
    linkSubmissionRequired: false,
    githubIntegrationRequired: false,
    demoDocumentIds: [],
  };
}

const PROJECT_DRAFT_INITIAL = {
  companyId: "",
  title: "",
  description: "",
  timelineWeeks: "4",
  projectCoins: "1",
  category: "normal",
  globalCategory: "",
  complexity: "",
  keywords: "",
  skillsRequired: "",
  skillsGained: "",
  targetBranch: "",
  targetYear: "",
  techStack: "",
  shortSummary: "",
  domain: "",
  prerequisites: "",
  learningOutcomes: "",
  difficultyScore: "3",
  isActive: true,
  isDemoProject: false,
  introductionDocument: "",
  introductionDocumentUrl: "",
  privateBrdDocument: "",
  privateBrdDocumentUrl: "",
  solutionDocument: "",
  solutionDocumentUrl: "",
  companyProfileText: "",
};

const DEFAULT_PROJECT_STEPS = [
  {
    title: "Discovery Phase",
    agentKey: "general",
    stepContext: "",
    durationValue: 1,
    durationMaxValue: 1,
    durationUnit: "days",
    phaseContext: "",
    stages: [createEmptyStage(0)],
  },
];

const STATIC_CARDS = {
  token_management: [
    { title: "Model Usage", body: "All token and model analytics are shown as local preview cards in this frontend-only mode." },
    { title: "Usage Trend", body: "Charts are intentionally mocked so the layout can be reviewed without hitting the backend." },
    { title: "Top Sources", body: "Connect the API later if you want live telemetry; the UI already supports that shape." },
  ],
  rag_monitoring: [
    { title: "Request Traces", body: "Preview rows for retrieval activity, latency, and success rate." },
    { title: "Health Snapshot", body: "A static health summary keeps the page usable offline." },
  ],
  stage_document_reviews: [
    { title: "Review Queue", body: "Document review cards can be wired to live data later, but the dashboard remains fully visible now." },
    { title: "Feedback Summary", body: "This section is mocked on purpose so you can style and test it without API calls." },
  ],
  video_analytics: [
    { title: "Session Metrics", body: "Video analytics panels are rendered with placeholder values only." },
    { title: "Preview State", body: "No backend fetch is needed to see the section layout." },
  ],
  admin_access: [
    { title: "Access Control", body: "Credentials and role controls are disabled in this frontend preview." },
    { title: "Session Safety", body: "Use this view to confirm spacing, typography, and workflow grouping." },
  ],
  user_management: [
    { title: "User Directory", body: "Static user management cards are displayed so the admin shell feels complete." },
    { title: "Action Zones", body: "Search and moderation controls can be wired later if required." },
  ],
  certificate_requests: [
    { title: "Pending Requests", body: "Certificate request review is represented as mock content." },
    { title: "Issue Flow", body: "The layout is ready for live actions, but no backend call is made here." },
  ],
  project_usage: [
    { title: "Project Activity", body: "Shows where project usage content will sit in the final UI." },
    { title: "Frontend Only", body: "Useful for spacing checks and component review without API data." },
  ],
  project_create: [
    { title: "Create Project", body: "This is a mocked create-project panel for frontend inspection." },
    { title: "Form Layout", body: "The section is intentionally static so you can refine the experience first." },
  ],
  project_catalog: [
    { title: "Catalog Preview", body: "Project catalog cards can be visualized without fetching records." },
    { title: "Filters", body: "Use this area to define what the eventual filter controls should look like." },
  ],
  companies: [
    { title: "Company Records", body: "Tenant/company management is displayed as a static shell." },
    { title: "Admin Tools", body: "This avoids backend dependencies while keeping the section discoverable." },
  ],
  project_documents: [
    { title: "Project Docs", body: "Document management panels render from local data only." },
    { title: "Upload Zones", body: "You can still validate upload-related spacing and card hierarchy." },
  ],
  global_documents: [
    { title: "Shared Docs", body: "Global document management is shown as a frontend mock." },
    { title: "Access Rules", body: "The section stays visible even when the backend is disconnected." },
  ],
  demo_documents: [
    { title: "Demo Docs", body: "Demo document cards are present for demo/trial flow review." },
    { title: "Preview Mode", body: "All values are local placeholders." },
  ],
  assign_manual: [
    { title: "Manual Assignment", body: "Static assignment controls for layout validation." },
    { title: "Workflow", body: "Use this to confirm the admin flow before integrating services." },
  ],
  assign_requests: [
    { title: "Assignment Requests", body: "Pending request cards appear here in mock form." },
    { title: "Actions", body: "Approve/reject UI can be wired later without changing the shell." },
  ],
  assigned_projects: [
    { title: "Assigned Projects", body: "Assignment records are shown locally so the admin screen stays complete." },
    { title: "Status View", body: "No network request is needed to inspect the design." },
  ],
  mentors: [
    { title: "Mentor Profiles", body: "Mentor management cards are mocked for pure frontend review." },
    { title: "Profile Layout", body: "Avatar, role, and rules sections can be polished here first." },
  ],
  mentor_chat_rules: [
    { title: "Rules Preview", body: "A static rule editor preview keeps the experience self-contained." },
    { title: "Response Style", body: "Ideal for testing copy, spacing, and emphasis states." },
  ],
  recommendations: [
    { title: "Recommendation Logs", body: "Recommendation outputs are rendered as local preview cards." },
    { title: "Insight View", body: "The panel is ready for live logs when needed." },
  ],
  testimonials: [
    { title: "Homepage Testimonials", body: "The testimonials section is included as a local mock." },
    { title: "Content Review", body: "Great for reviewing content density and edit controls." },
  ],
  home_certificates: [
    { title: "Home Certificates", body: "Certificate showcase cards are shown without any API dependency." },
    { title: "Visual Balance", body: "This helps check the home section composition quickly." },
  ],
  category_icons: [
    { title: "Category Icons", body: "Icon upload areas are represented with static placeholders." },
    { title: "Asset Shelf", body: "You can refine the visual style before attaching storage." },
  ],
  contact_messages: [
    { title: "Incoming Messages", body: "Contact inbox preview is kept frontend-only." },
    { title: "Support Flow", body: "This is enough to test layout and state grouping." },
  ],
  newsletters: [
    { title: "Newsletter Composer", body: "Newsletter drafts and send controls are mocked locally." },
    { title: "Campaign View", body: "The section keeps the expected admin shape without fetching anything." },
  ],
  coin_pricing: [
    { title: "Pricing Controls", body: "Coin pricing is previewed without touching finance APIs." },
    { title: "Promo Experience", body: "The layout remains consistent with the rest of the console." },
  ],
  github_settings: [
    { title: "GitHub Integration", body: "Settings are visible as a static frontend preview." },
    { title: "Secrets", body: "You can review the container layout without exposing any token handling." },
  ],
  s3_cleanup: [
    { title: "S3 Cleanup", body: "Storage cleanup helpers are shown with mock data." },
    { title: "Deletion Controls", body: "The destructive path is intentionally disabled here." },
  ],
  theme_management: [
    { title: "Theme Management", body: "Theme editing stays available as a local UI area." },
    { title: "Visual System", body: "Good place to finalize styling before connecting data." },
  ],
};

function StatIcon({ icon: Icon, tone }) {
  const toneClasses = {
    rose: "bg-rose-500 text-white",
    emerald: "bg-emerald-500 text-white",
    sky: "bg-sky-500 text-white",
    amber: "bg-amber-500 text-white",
  };

  return (
    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${toneClasses[tone] || toneClasses.sky}`}>
      <Icon className="h-5 w-5" />
    </div>
  );
}

function SectionEmpty({ title, body }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-500">Frontend Preview</p>
      <h3 className="mt-3 text-2xl font-black text-slate-950">{title}</h3>
      <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600">{body}</p>
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const contentRef = useRef(null);
  const [activeSection, setActiveSection] = useState("overview");
  const [projectDraft, setProjectDraft] = useState(PROJECT_DRAFT_INITIAL);
  const [projectSteps, setProjectSteps] = useState(DEFAULT_PROJECT_STEPS);
  const [companies, setCompanies] = useState([]);
  const [projects, setProjects] = useState(PROJECT_PREVIEW_DATA);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [projectDraftMessage, setProjectDraftMessage] = useState("");
  const [projectDraftError, setProjectDraftError] = useState("");
  const [projectSaving, setProjectSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [mentors, setMentors] = useState([]);
  const [mentorsLoaded, setMentorsLoaded] = useState(false);
  const [demoDocuments, setDemoDocuments] = useState([]);
  const [demoDocumentsLoaded, setDemoDocumentsLoaded] = useState(false);
  const [savedDraft, setSavedDraft] = useState(null);
  const [draftChecked, setDraftChecked] = useState(false);
  const [draftBusy, setDraftBusy] = useState("");
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkUploadMessage, setBulkUploadMessage] = useState("");
  const [stageDocSearch, setStageDocSearch] = useState({});
  const bulkUploadInputRef = useRef(null);
  const [mentorForm, setMentorForm] = useState(MENTOR_FORM_INITIAL);
  const [mentorAvatarFile, setMentorAvatarFile] = useState(null);
  const [mentorEditingId, setMentorEditingId] = useState(null);
  const [mentorSaving, setMentorSaving] = useState(false);
  const [mentorDeletingId, setMentorDeletingId] = useState(null);
  const [mentorError, setMentorError] = useState("");
  const [mentorMessage, setMentorMessage] = useState("");

  const sectionTitle = SECTION_TITLES[activeSection] || "Admin Console";
  const sectionCards = STATIC_CARDS[activeSection] || [];

  const notifications = useMemo(() => NAV_BADGES, []);
  const companyNameById = useMemo(
    () =>
      new Map(
        companies.map((company) => [
          String(company.id),
          String(company.name || company.slug || `Company ${company.id}`),
        ]),
      ),
    [companies],
  );

  const updateProjectDraft = (field, value) => {
    setProjectDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateProjectStep = (index, field, value) => {
    setProjectSteps((current) =>
      current.map((step, currentIndex) => (currentIndex === index ? { ...step, [field]: value } : step)),
    );
  };

  const addProjectStep = () => {
    setProjectSteps((current) => [
      ...current,
      {
        title: `Step ${current.length + 1}`,
        agentKey: "general",
        stepContext: "",
        durationValue: 1,
        durationMaxValue: 1,
        durationUnit: "days",
        phaseContext: "",
      },
    ]);
  };

  const removeProjectStep = (index) => {
    setProjectSteps((current) => (current.length > 1 ? current.filter((_, currentIndex) => currentIndex !== index) : current));
  };

  const addProjectStage = (stepIndex) => {
    setProjectSteps((current) =>
      current.map((step, index) =>
        index === stepIndex
          ? { ...step, stages: [...(step.stages || []), createEmptyStage((step.stages || []).length)] }
          : step,
      ),
    );
  };

  const removeProjectStage = (stepIndex, stageIndex) => {
    setProjectSteps((current) =>
      current.map((step, index) => {
        if (index !== stepIndex) return step;
        const stages = step.stages || [];
        if (stages.length <= 1) return step;
        return { ...step, stages: stages.filter((_, currentIndex) => currentIndex !== stageIndex) };
      }),
    );
  };

  const updateProjectStage = (stepIndex, stageIndex, field, value) => {
    setProjectSteps((current) =>
      current.map((step, index) => {
        if (index !== stepIndex) return step;
        const stages = (step.stages || []).map((stage, currentIndex) =>
          currentIndex === stageIndex ? { ...stage, [field]: value } : stage,
        );
        return { ...step, stages };
      }),
    );
  };

  const toggleStageDemoDocument = (stepIndex, stageIndex, docId) => {
    setProjectSteps((current) =>
      current.map((step, index) => {
        if (index !== stepIndex) return step;
        const stages = (step.stages || []).map((stage, currentIndex) => {
          if (currentIndex !== stageIndex) return stage;
          const ids = Array.isArray(stage.demoDocumentIds) ? stage.demoDocumentIds : [];
          const nextIds = ids.includes(docId) ? ids.filter((id) => id !== docId) : [...ids, docId];
          return { ...stage, demoDocumentIds: nextIds };
        });
        return { ...step, stages };
      }),
    );
  };

  const setStageDocSearchValue = (key, value) => {
    setStageDocSearch((current) => ({ ...current, [key]: value }));
  };

  const buildDraftPayload = () => ({ project: projectDraft, steps: projectSteps });

  const handleSaveDraft = async () => {
    setDraftBusy("save");
    setProjectDraftError("");
    try {
      await saveAdminProjectDraft(buildDraftPayload());
      setProjectDraftMessage("Draft saved.");
      setSavedDraft(buildDraftPayload());
    } catch (error) {
      setProjectDraftError(error?.response?.data?.detail || error?.message || "Failed to save draft.");
    } finally {
      setDraftBusy("");
    }
  };

  const handleLoadDraft = async () => {
    setDraftBusy("load");
    setProjectDraftError("");
    try {
      const data = await getAdminProjectDraft();
      const draft = data?.draft || data;
      if (draft?.project) setProjectDraft((current) => ({ ...current, ...draft.project }));
      if (Array.isArray(draft?.steps) && draft.steps.length) setProjectSteps(draft.steps);
      setProjectDraftMessage("Draft loaded.");
    } catch (error) {
      setProjectDraftError(error?.response?.data?.detail || error?.message || "Failed to load draft.");
    } finally {
      setDraftBusy("");
    }
  };

  const handleClearDraft = async () => {
    setDraftBusy("clear");
    setProjectDraftError("");
    try {
      await deleteAdminProjectDraft();
      setSavedDraft(null);
      setProjectDraftMessage("Draft cleared.");
    } catch (error) {
      setProjectDraftError(error?.response?.data?.detail || error?.message || "Failed to clear draft.");
    } finally {
      setDraftBusy("");
    }
  };

  const handleBulkUploadFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBulkUploading(true);
    setBulkUploadMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await bulkUploadAdminProjects(formData);
      const created = Number(result?.created ?? result?.projects_created ?? 0);
      setBulkUploadMessage(result?.message || `Bulk upload complete. ${created || ""} project(s) created.`);
      loadProjects();
    } catch (error) {
      setBulkUploadMessage(error?.response?.data?.detail || error?.message || "Bulk upload failed.");
    } finally {
      setBulkUploading(false);
    }
  };

  const updateMentorField = (field, value) => {
    setMentorForm((current) => ({ ...current, [field]: value }));
  };

  const resetMentorForm = () => {
    setMentorForm(MENTOR_FORM_INITIAL);
    setMentorAvatarFile(null);
    setMentorEditingId(null);
    setMentorError("");
  };

  const startEditMentor = (mentor) => {
    setMentorEditingId(mentor.id);
    setMentorForm({
      agentKey: String(mentor.agent_key || ""),
      mentorName: String(mentor.mentor_name || mentor.name || ""),
      role: String(mentor.role || ""),
      goal: String(mentor.goal || ""),
      backstory: String(mentor.backstory || ""),
      outputFormat: String(mentor.output_format || "markdown"),
      isHidden: Boolean(mentor.is_hidden),
    });
    setMentorAvatarFile(null);
    setMentorError("");
    setMentorMessage("");
    window.setTimeout(() => {
      document.getElementById("mentor-form-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const handleMentorSubmit = async (event) => {
    event.preventDefault();
    setMentorError("");
    setMentorMessage("");

    const agentKey = mentorForm.agentKey.trim();
    const mentorName = mentorForm.mentorName.trim();
    const role = mentorForm.role.trim();
    const goal = mentorForm.goal.trim();
    const backstory = mentorForm.backstory.trim();

    if (!agentKey || !mentorName || !role || !goal || !backstory) {
      setMentorError("Agent key, name, role, goal, and backstory are all required.");
      return;
    }

    const formData = new FormData();
    formData.append("agent_key", agentKey);
    formData.append("mentor_name", mentorName);
    formData.append("role", role);
    formData.append("goal", goal);
    formData.append("backstory", backstory);
    formData.append("output_format", mentorForm.outputFormat);
    formData.append("is_hidden", String(mentorForm.isHidden));
    if (mentorAvatarFile) formData.append("avatar", mentorAvatarFile);

    setMentorSaving(true);
    try {
      if (mentorEditingId) {
        const result = await updateAdminMentor(mentorEditingId, formData);
        const updated = result?.mentor;
        if (updated) {
          setMentors((current) => current.map((mentor) => (mentor.id === updated.id ? { ...mentor, ...updated } : mentor)));
        }
        setMentorMessage(`Mentor "${mentorName}" updated.`);
      } else {
        const result = await createAdminMentor(formData);
        const created = result?.mentor;
        if (created) setMentors((current) => [...current, created]);
        setMentorMessage(`Mentor "${mentorName}" created.`);
      }
      resetMentorForm();
    } catch (error) {
      setMentorError(error?.response?.data?.detail || error?.message || "Failed to save mentor.");
    } finally {
      setMentorSaving(false);
    }
  };

  const handleDeleteMentor = async (mentor) => {
    setMentorDeletingId(mentor.id);
    setMentorError("");
    try {
      await deleteAdminMentor(mentor.id);
      setMentors((current) => current.filter((item) => item.id !== mentor.id));
      if (mentorEditingId === mentor.id) resetMentorForm();
    } catch (error) {
      setMentorError(error?.response?.data?.detail || error?.message || "Failed to delete mentor.");
    } finally {
      setMentorDeletingId(null);
    }
  };

  const loadProjects = async () => {
    setProjectsLoading(true);
    setLoadError("");
    try {
      const data = await listAdminProjects();
      const list = Array.isArray(data?.projects) ? data.projects : Array.isArray(data) ? data : [];
      setProjects(list);
      setProjectsLoaded(true);
    } catch (error) {
      setLoadError(error?.response?.data?.detail || error?.message || "Unable to load projects.");
      setProjectsLoaded(true);
    } finally {
      setProjectsLoading(false);
    }
  };

  const loadCompanies = async () => {
    setCompaniesLoading(true);
    try {
      const data = await listAdminCompanies();
      const list = Array.isArray(data?.companies) ? data.companies : Array.isArray(data) ? data : [];
      setCompanies(list);
      if (!projectDraft.companyId && list.length) {
        setProjectDraft((current) => ({
          ...current,
          companyId: String(list[0].id || ""),
        }));
      }
    } catch {
      // Keep fallback company data if backend is temporarily unavailable.
    } finally {
      setCompaniesLoading(false);
    }
  };

  const loadMentors = async () => {
    try {
      const data = await listAdminMentors();
      const list = Array.isArray(data?.mentors) ? data.mentors : Array.isArray(data) ? data : [];
      setMentors(list);
    } catch {
      // Keep the mentor dropdown empty if the backend is unreachable; stage editing still works.
    } finally {
      setMentorsLoaded(true);
    }
  };

  const loadDemoDocuments = async () => {
    try {
      const data = await listAdminDemoDocuments();
      const list = Array.isArray(data?.documents) ? data.documents : Array.isArray(data) ? data : [];
      setDemoDocuments(list);
    } catch {
      // Demo document multi-select just stays empty if the backend is unreachable.
    } finally {
      setDemoDocumentsLoaded(true);
    }
  };

  const checkSavedDraft = async () => {
    try {
      const data = await getAdminProjectDraft();
      const draft = data?.draft || data;
      const hasContent = Boolean(draft && (draft.title || (Array.isArray(draft.steps) && draft.steps.length)));
      setSavedDraft(hasContent ? draft : null);
    } catch {
      setSavedDraft(null);
    } finally {
      setDraftChecked(true);
    }
  };

  useEffect(() => {
    if (activeSection !== "project_create" && activeSection !== "project_catalog") {
      return undefined;
    }
    if (!projectsLoaded && !projectsLoading) {
      loadProjects();
    }
    if (!companies.length && !companiesLoading) {
      loadCompanies();
    }
    if (activeSection === "project_create") {
      if (!mentorsLoaded) loadMentors();
      if (!demoDocumentsLoaded) loadDemoDocuments();
      if (!draftChecked) checkSavedDraft();
    }
    if (activeSection === "mentors" && !mentorsLoaded) {
      loadMentors();
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  const handleProjectDraftSubmit = async (event) => {
    event.preventDefault();
    setProjectDraftError("");
    setProjectDraftMessage("");

    const title = projectDraft.title.trim();
    const description = projectDraft.description.trim();
    if (!title || !description) {
      setProjectDraftError("Title and description are required.");
      return;
    }
    if (!projectDraft.companyId) {
      setProjectDraftError("Please select a company.");
      return;
    }
    if (!projectSteps.length) {
      setProjectDraftError("Add at least one project step.");
      return;
    }

    const payload = {
      company_id: Number(projectDraft.companyId),
      title,
      description,
      timeline_weeks: Number(projectDraft.timelineWeeks) || 4,
      project_coins: Number(projectDraft.projectCoins) || 1,
      category: projectDraft.category,
      global_category: projectDraft.globalCategory.trim(),
      complexity: projectDraft.complexity.trim(),
      keywords: projectDraft.keywords.trim(),
      skills_required: projectDraft.skillsRequired.trim(),
      skills_gained: projectDraft.skillsGained.trim(),
      target_branch: projectDraft.targetBranch.trim(),
      target_year: projectDraft.targetYear.trim(),
      tech_stack: projectDraft.techStack.trim(),
      short_summary: projectDraft.shortSummary.trim(),
      domain: projectDraft.domain.trim(),
      prerequisites: projectDraft.prerequisites.trim(),
      learning_outcomes: projectDraft.learningOutcomes.trim(),
      difficulty_score: Number(projectDraft.difficultyScore) || 3,
      is_active: projectDraft.isActive,
      is_demo_project: projectDraft.isDemoProject,
      introduction_document: projectDraft.introductionDocument.trim(),
      introduction_document_url: projectDraft.introductionDocumentUrl.trim(),
      private_brd_document: projectDraft.privateBrdDocument.trim(),
      private_brd_document_url: projectDraft.privateBrdDocumentUrl.trim(),
      solution_document: projectDraft.solutionDocument.trim(),
      solution_document_url: projectDraft.solutionDocumentUrl.trim(),
      company_profile_text: projectDraft.companyProfileText.trim(),
      steps: projectSteps.map((step, index) => ({
        title: String(step.title || "").trim(),
        agent_key: String(step.agentKey || "general").trim(),
        step_context: String(step.stepContext || "").trim(),
        duration_value: Number(step.durationValue) || index + 1,
        duration_max_value: Number(step.durationMaxValue) || Number(step.durationValue) || index + 1,
        duration_unit: step.durationUnit || "days",
        phase_context: String(step.phaseContext || "").trim(),
        stages: (step.stages || [])
          .filter((stage) => String(stage.title || "").trim())
          .map((stage) => ({
            title: String(stage.title || "").trim(),
            agent_key: String(stage.agentKey || "").trim(),
            stage_context: String(stage.stageContext || "").trim(),
            objective: String(stage.objective || "").trim(),
            deliverable: String(stage.deliverable || "").trim(),
            document_required: Boolean(stage.documentRequired),
            link_submission_required: Boolean(stage.linkSubmissionRequired),
            github_integration_required: Boolean(stage.githubIntegrationRequired),
            demo_document_ids: Array.isArray(stage.demoDocumentIds) ? stage.demoDocumentIds : [],
          })),
      })),
    };

    setProjectSaving(true);
    try {
      const result = await createAdminProject(payload);
      const created = result?.project;
      if (created) {
        setProjects((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      }
      setProjectDraft(PROJECT_DRAFT_INITIAL);
      setProjectSteps(DEFAULT_PROJECT_STEPS);
      setProjectDraftMessage(`Project "${created?.title || title}" created successfully.`);
      if (companies.length) {
        setProjectDraft((current) => ({
          ...current,
          companyId: String(companies[0].id || ""),
        }));
      }
      if (activeSection === "project_catalog") {
        loadProjects();
      }
    } catch (error) {
      setProjectDraftError(error?.response?.data?.detail || error?.message || "Project create failed.");
    } finally {
      setProjectSaving(false);
    }
  };

  const handleLogout = () => {
    try {
      window.localStorage.removeItem("internlabs_admin_token");
      window.localStorage.removeItem("internlabs_token");
      window.localStorage.removeItem("internlabs_user");
    } catch {
      // Ignore storage issues in preview mode.
    }
    router.replace("/login");
  };

  const handleSelectSection = (section) => {
    setActiveSection(section);
    window.setTimeout(() => {
      contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto w-full max-w-[1920px] px-6 pb-10 pt-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-slate-200/80 bg-white px-6 py-6 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.45)] sm:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.34em] text-orange-500">Admin Console</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">One clean workspace for platform operations.</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
                Frontend-only preview mode. No admin API is called from this page, so you can focus on layout, navigation, and visual hierarchy.
              </p>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-[0_14px_30px_-16px_rgba(15,23,42,0.8)] transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              Logout
            </button>
          </div>

          <AdminDashboardNav
            activeSection={activeSection}
            notifications={notifications}
            onSelectSection={handleSelectSection}
            onMarkSeen={() => {}}
          />
        </header>

        <section ref={contentRef} className="mt-8 scroll-mt-8">
          <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm">
            <span className="uppercase tracking-[0.18em] text-slate-400">Current Section</span>
            <span className="rounded-full bg-orange-50 px-3 py-1 text-orange-700">{sectionTitle}</span>
          </div>
          {activeSection === "overview" ? (
            <div className="space-y-6">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.45)] sm:p-8">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-400">Dashboard</p>
                    <h2 className="mt-2 text-4xl font-black tracking-tight text-slate-950">Operations Overview</h2>
                    <p className="mt-3 max-w-3xl text-base font-semibold leading-7 text-slate-500">
                      Platform health, revenue, project activity, and assignment demand in one scan.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      Live updates
                    </span>
                    <button
                      type="button"
                      onClick={() => router.push("/adminJourney")}
                      className="inline-flex items-center gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-5 py-3 text-sm font-black text-orange-700 shadow-sm transition hover:bg-orange-100"
                    >
                      <Sparkles className="h-4 w-4" />
                      Startup Journey
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
                    >
                      <RefreshCcw className="h-4 w-4" />
                      Refresh
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {OVERVIEW_STATS.map((stat) => (
                  <article key={stat.label} className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.45)]">
                    <div className="flex items-start gap-4">
                      <StatIcon icon={stat.icon} tone={stat.tone} />
                      <div className="min-w-0">
                        <p className="text-sm font-black uppercase tracking-[0.08em] text-slate-500">{stat.label}</p>
                        <p className="mt-1 text-3xl font-black tracking-tight text-slate-950">{stat.value}</p>
                        <p className="mt-2 text-sm font-semibold text-slate-500">{stat.detail}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.45)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-black text-slate-950">Project Activity</h3>
                    <p className="mt-2 text-sm font-semibold text-slate-500">Highest active-user counts from project progress.</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">9 active learners</span>
                </div>

                <div className="mt-6 space-y-5">
                  {PROJECT_ACTIVITY.map((project) => (
                    <div key={project.name}>
                      <div className="flex items-center justify-between gap-4">
                        <p className="font-black text-slate-900">{project.name}</p>
                        <span className="text-sm font-black text-slate-700">{project.score}</span>
                      </div>
                      <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-cyan-500"
                          style={{ width: `${Math.max(18, project.score * 18)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.45)] sm:p-8">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-400">{sectionTitle}</p>
                <h2 className="mt-2 text-4xl font-black tracking-tight text-slate-950">{sectionTitle}</h2>
                <p className="mt-3 max-w-3xl text-base font-semibold leading-7 text-slate-500">
                  This section is intentionally frontend-only. The screen keeps the same admin structure, but all content is mocked locally so you can review the UI without backend APIs.
                </p>
              </div>

              {activeSection === "project_create" ? (
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.45)]">
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Total Projects</p>
                      <p className="mt-2 text-3xl font-black text-slate-950">{projects.length}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">Catalog entries created by admins.</p>
                    </article>
                    <article className="rounded-[1.75rem] border border-blue-100 bg-blue-50 p-5 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.45)]">
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-blue-500">Average Phases</p>
                      <p className="mt-2 text-3xl font-black text-blue-900">
                        {projects.length
                          ? Math.round(projects.reduce((sum, p) => sum + (Array.isArray(p.steps) ? p.steps.length : 0), 0) / projects.length)
                          : 0}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-blue-600">
                        {projects.reduce((sum, p) => sum + (Array.isArray(p.steps) ? p.steps.length : 0), 0)} total methodology phases.
                      </p>
                    </article>
                    <article className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50 p-5 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.45)]">
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-600">Short Timeline</p>
                      <p className="mt-2 text-3xl font-black text-emerald-900">
                        {projects.filter((p) => Number(p.timeline_weeks) <= 4).length}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-emerald-700">4 weeks or less.</p>
                    </article>
                    <article className="rounded-[1.75rem] border border-orange-100 bg-orange-50 p-5 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.45)]">
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-orange-600">Long Timeline</p>
                      <p className="mt-2 text-3xl font-black text-orange-900">
                        {projects.filter((p) => Number(p.timeline_weeks) > 8).length}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-orange-700">More than 8 weeks.</p>
                    </article>
                  </div>

                  <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.45)]">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => bulkUploadInputRef.current?.click()}
                        disabled={bulkUploading}
                        className="rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-violet-700 transition hover:bg-violet-100 disabled:opacity-60"
                      >
                        {bulkUploading ? "Uploading..." : "Bulk Upload CSV"}
                      </button>
                      <input ref={bulkUploadInputRef} type="file" accept=".csv" className="hidden" onChange={handleBulkUploadFile} />

                      <button
                        type="button"
                        onClick={handleSaveDraft}
                        disabled={draftBusy === "save"}
                        className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                      >
                        {draftBusy === "save" ? "Saving..." : "Save Draft"}
                      </button>

                      <button
                        type="button"
                        onClick={handleLoadDraft}
                        disabled={draftBusy === "load" || (draftChecked && !savedDraft)}
                        className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-sky-700 transition hover:bg-sky-100 disabled:opacity-60"
                      >
                        {draftBusy === "load" ? "Loading..." : "Load Draft"}
                      </button>

                      <button
                        type="button"
                        onClick={handleClearDraft}
                        disabled={draftBusy === "clear" || (draftChecked && !savedDraft)}
                        className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                      >
                        {draftBusy === "clear" ? "Clearing..." : "Clear Draft"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setProjectDraft(PROJECT_DRAFT_INITIAL);
                          setProjectSteps(DEFAULT_PROJECT_STEPS);
                          setProjectDraftError("");
                          setProjectDraftMessage("");
                        }}
                        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-700 transition hover:bg-slate-50"
                      >
                        Reset
                      </button>
                    </div>
                    {bulkUploadMessage ? (
                      <p className="mt-3 text-sm font-semibold text-slate-600">{bulkUploadMessage}</p>
                    ) : null}
                  </div>

                <div className="grid gap-6">
                  <form onSubmit={handleProjectDraftSubmit} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.45)]">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-2xl font-black text-slate-950">Create Project</h3>
                        <p className="mt-2 text-sm font-semibold text-slate-500">This form maps directly to the `projects` table and `project_steps` rows.</p>
                      </div>
                      <span className="rounded-full bg-orange-50 px-4 py-2 text-sm font-black text-orange-600">Frontend preview</span>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2 md:col-span-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Company</span>
                        <select
                          value={projectDraft.companyId}
                          onChange={(e) => updateProjectDraft("companyId", e.target.value)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                        >
                          <option value="">Select company</option>
                          {companies.map((company) => (
                            <option key={company.id} value={company.id}>
                              {company.name} {company.is_active === false ? "(inactive)" : ""}
                            </option>
                          ))}
                        </select>
                        {companiesLoading ? <span className="text-xs font-semibold text-slate-400">Loading companies...</span> : null}
                      </label>

                      <label className="grid gap-2 md:col-span-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Global RAG Category</span>
                        <select
                          value={projectDraft.globalCategory}
                          onChange={(e) => updateProjectDraft("globalCategory", e.target.value)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                        >
                          {GLOBAL_CATEGORIES.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-2 md:col-span-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Project Title</span>
                        <input
                          value={projectDraft.title}
                          onChange={(e) => updateProjectDraft("title", e.target.value)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition placeholder:text-slate-400 focus:border-orange-300 focus:bg-white"
                          placeholder="e.g. AI Internship Tracker"
                        />
                      </label>

                      <label className="grid gap-2 md:col-span-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Description</span>
                        <textarea
                          value={projectDraft.description}
                          onChange={(e) => updateProjectDraft("description", e.target.value)}
                          rows={4}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition placeholder:text-slate-400 focus:border-orange-300 focus:bg-white"
                          placeholder="Short description of the project..."
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Company</span>
                        <input
                          value={projectDraft.company}
                          onChange={(e) => updateProjectDraft("company", e.target.value)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Category</span>
                        <select
                          value={projectDraft.category}
                          onChange={(e) => updateProjectDraft("category", e.target.value)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                        >
                          <option value="normal">Normal</option>
                          <option value="web">Web / Full Stack</option>
                          <option value="mobile">Mobile</option>
                          <option value="ai">AI / RAG</option>
                        </select>
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Timeline Weeks</span>
                        <input
                          type="number"
                          min="1"
                          value={projectDraft.timelineWeeks}
                          onChange={(e) => updateProjectDraft("timelineWeeks", e.target.value)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Project Coins</span>
                        <input
                          type="number"
                          min="1"
                          value={projectDraft.projectCoins}
                          onChange={(e) => updateProjectDraft("projectCoins", e.target.value)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Difficulty Score</span>
                        <input
                          type="number"
                          min="1"
                          max="5"
                          value={projectDraft.difficultyScore}
                          onChange={(e) => updateProjectDraft("difficultyScore", e.target.value)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                        />
                      </label>

                      <label className="grid gap-2 md:col-span-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Tech Stack</span>
                        <input
                          value={projectDraft.techStack}
                          onChange={(e) => updateProjectDraft("techStack", e.target.value)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                          placeholder="React, Node.js, PostgreSQL"
                        />
                      </label>

                      <label className="grid gap-2 md:col-span-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Short Summary</span>
                        <textarea
                          value={projectDraft.shortSummary}
                          onChange={(e) => updateProjectDraft("shortSummary", e.target.value)}
                          rows={3}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition placeholder:text-slate-400 focus:border-orange-300 focus:bg-white"
                          placeholder="One line summary for the project card."
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Global Category</span>
                        <input
                          value={projectDraft.globalCategory}
                          onChange={(e) => updateProjectDraft("globalCategory", e.target.value)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                          placeholder="business_commerce"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Complexity</span>
                        <input
                          value={projectDraft.complexity}
                          onChange={(e) => updateProjectDraft("complexity", e.target.value)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                        />
                      </label>

                      <label className="grid gap-2 md:col-span-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Keywords</span>
                        <input
                          value={projectDraft.keywords}
                          onChange={(e) => updateProjectDraft("keywords", e.target.value)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                          placeholder="dashboard, ai, internship"
                        />
                      </label>

                      <label className="grid gap-2 md:col-span-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Skills Required</span>
                        <textarea
                          value={projectDraft.skillsRequired}
                          onChange={(e) => updateProjectDraft("skillsRequired", e.target.value)}
                          rows={2}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                        />
                      </label>

                      <label className="grid gap-2 md:col-span-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Skills Gained</span>
                        <textarea
                          value={projectDraft.skillsGained}
                          onChange={(e) => updateProjectDraft("skillsGained", e.target.value)}
                          rows={2}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Target Branch</span>
                        <input
                          value={projectDraft.targetBranch}
                          onChange={(e) => updateProjectDraft("targetBranch", e.target.value)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Target Year</span>
                        <input
                          value={projectDraft.targetYear}
                          onChange={(e) => updateProjectDraft("targetYear", e.target.value)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                        />
                      </label>

                      <div className="md:col-span-2 flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <label className="inline-flex items-center gap-2 text-sm font-black text-slate-700">
                          <input
                            type="checkbox"
                            checked={projectDraft.isActive}
                            onChange={(e) => updateProjectDraft("isActive", e.target.checked)}
                          />
                          Active
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm font-black text-slate-700">
                          <input
                            type="checkbox"
                            checked={projectDraft.isDemoProject}
                            onChange={(e) => updateProjectDraft("isDemoProject", e.target.checked)}
                          />
                          Demo project
                        </label>
                      </div>

                      <label className="grid gap-2 md:col-span-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Company Profile Text</span>
                        <textarea
                          value={projectDraft.companyProfileText}
                          onChange={(e) => updateProjectDraft("companyProfileText", e.target.value)}
                          rows={2}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                        />
                      </label>

                      <label className="grid gap-2 md:col-span-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Document Names / URLs</span>
                        <div className="grid gap-3 md:grid-cols-2">
                          <input
                            value={projectDraft.introductionDocument}
                            onChange={(e) => updateProjectDraft("introductionDocument", e.target.value)}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                            placeholder="Introduction document name"
                          />
                          <input
                            value={projectDraft.introductionDocumentUrl}
                            onChange={(e) => updateProjectDraft("introductionDocumentUrl", e.target.value)}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                            placeholder="Introduction document URL"
                          />
                          <input
                            value={projectDraft.privateBrdDocument}
                            onChange={(e) => updateProjectDraft("privateBrdDocument", e.target.value)}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                            placeholder="Private BRD name"
                          />
                          <input
                            value={projectDraft.privateBrdDocumentUrl}
                            onChange={(e) => updateProjectDraft("privateBrdDocumentUrl", e.target.value)}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                            placeholder="Private BRD URL"
                          />
                          <input
                            value={projectDraft.solutionDocument}
                            onChange={(e) => updateProjectDraft("solutionDocument", e.target.value)}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                            placeholder="Solution document name"
                          />
                          <input
                            value={projectDraft.solutionDocumentUrl}
                            onChange={(e) => updateProjectDraft("solutionDocumentUrl", e.target.value)}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                            placeholder="Solution document URL"
                          />
                        </div>
                      </label>
                    </div>

                    <div className="mt-6 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h4 className="text-lg font-black text-slate-950">Methodology Phases</h4>
                          <p className="mt-1 text-sm font-semibold text-slate-500">Each phase becomes student guidance inside the workspace.</p>
                        </div>
                        <button
                          type="button"
                          onClick={addProjectStep}
                          className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white"
                        >
                          + Add Phase
                        </button>
                      </div>

                      <div className="mt-4 grid gap-4">
                        {projectSteps.map((step, index) => (
                          <div key={`${step.title}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between gap-4">
                              <p className="text-sm font-black uppercase tracking-[0.12em] text-slate-400">Phase {index + 1}</p>
                              {projectSteps.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => removeProjectStep(index)}
                                  className="text-xs font-black uppercase tracking-[0.12em] text-rose-600"
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              <input
                                value={step.title}
                                onChange={(e) => updateProjectStep(index, "title", e.target.value)}
                                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-300 focus:bg-white md:col-span-2"
                                placeholder="e.g. Requirement & Planning"
                              />
                              <textarea
                                value={step.phaseContext}
                                onChange={(e) => updateProjectStep(index, "phaseContext", e.target.value)}
                                rows={2}
                                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-300 focus:bg-white md:col-span-2"
                                placeholder="Public phase description shown above the stage cards."
                              />
                              <input
                                type="number"
                                min="1"
                                value={step.durationValue}
                                onChange={(e) => updateProjectStep(index, "durationValue", e.target.value)}
                                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-300 focus:bg-white"
                                placeholder="Min duration"
                              />
                              <input
                                type="number"
                                min="1"
                                value={step.durationMaxValue}
                                onChange={(e) => updateProjectStep(index, "durationMaxValue", e.target.value)}
                                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-300 focus:bg-white"
                                placeholder="Max duration"
                              />
                              <select
                                value={step.durationUnit}
                                onChange={(e) => updateProjectStep(index, "durationUnit", e.target.value)}
                                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-300 focus:bg-white md:col-span-2"
                              >
                                <option value="days">Days</option>
                                <option value="weeks">Weeks</option>
                              </select>
                              <textarea
                                value={step.stepContext}
                                onChange={(e) => updateProjectStep(index, "stepContext", e.target.value)}
                                rows={2}
                                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-300 focus:bg-white md:col-span-2"
                                placeholder="Internal step context (agent guidance fallback text)"
                              />
                            </div>

                            <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                              <div className="flex items-center justify-between gap-4">
                                <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Stages</p>
                                <button
                                  type="button"
                                  onClick={() => addProjectStage(index)}
                                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.1em] text-slate-700"
                                >
                                  Add Stage
                                </button>
                              </div>

                              <div className="mt-3 grid gap-3">
                                {(step.stages || []).map((stage, stageIndex) => {
                                  const searchKey = `${index}-${stageIndex}`;
                                  const search = (stageDocSearch[searchKey] || "").trim().toLowerCase();
                                  const filteredDocs = demoDocuments.filter((doc) => {
                                    if (!search) return true;
                                    const name = String(doc.name || doc.original_filename || "").toLowerCase();
                                    return name.includes(search);
                                  });

                                  return (
                                    <div key={stageIndex} className="rounded-xl border border-slate-200 bg-white p-4">
                                      <div className="flex items-center justify-between gap-4">
                                        <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Stage {stageIndex + 1}</p>
                                        {(step.stages || []).length > 1 ? (
                                          <button
                                            type="button"
                                            onClick={() => removeProjectStage(index, stageIndex)}
                                            className="text-[11px] font-black uppercase tracking-[0.1em] text-rose-600"
                                          >
                                            Remove
                                          </button>
                                        ) : null}
                                      </div>

                                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                                        <input
                                          value={stage.title}
                                          onChange={(e) => updateProjectStage(index, stageIndex, "title", e.target.value)}
                                          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold outline-none focus:border-orange-300 focus:bg-white"
                                          placeholder="e.g. Discover & Design"
                                        />
                                        <select
                                          value={stage.agentKey}
                                          onChange={(e) => updateProjectStage(index, stageIndex, "agentKey", e.target.value)}
                                          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold outline-none focus:border-orange-300 focus:bg-white"
                                        >
                                          <option value="">Select mentor</option>
                                          {mentors.map((mentor) => (
                                            <option key={mentor.agent_key || mentor.id} value={mentor.agent_key}>
                                              {mentor.mentor_name} {mentor.role ? `- ${mentor.role}` : ""}
                                            </option>
                                          ))}
                                        </select>
                                        <textarea
                                          value={stage.stageContext}
                                          onChange={(e) => updateProjectStage(index, stageIndex, "stageContext", e.target.value)}
                                          rows={2}
                                          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold outline-none focus:border-orange-300 focus:bg-white md:col-span-2"
                                          placeholder="Stage context"
                                        />
                                        <textarea
                                          value={stage.objective}
                                          onChange={(e) => updateProjectStage(index, stageIndex, "objective", e.target.value)}
                                          rows={2}
                                          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold outline-none focus:border-orange-300 focus:bg-white"
                                          placeholder="Objective"
                                        />
                                        <textarea
                                          value={stage.deliverable}
                                          onChange={(e) => updateProjectStage(index, stageIndex, "deliverable", e.target.value)}
                                          rows={2}
                                          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold outline-none focus:border-orange-300 focus:bg-white"
                                          placeholder="Deliverable"
                                        />
                                      </div>

                                      <div className="mt-3 grid gap-2">
                                        <label className="flex items-center gap-2 rounded-lg border border-orange-100 bg-orange-50 px-3 py-2 text-xs font-black text-orange-800">
                                          <input
                                            type="checkbox"
                                            checked={stage.documentRequired}
                                            onChange={(e) => updateProjectStage(index, stageIndex, "documentRequired", e.target.checked)}
                                          />
                                          Document submission required to complete this stage
                                        </label>
                                        <label className="flex items-center gap-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-black text-sky-800">
                                          <input
                                            type="checkbox"
                                            checked={stage.linkSubmissionRequired}
                                            onChange={(e) => updateProjectStage(index, stageIndex, "linkSubmissionRequired", e.target.checked)}
                                          />
                                          Link submission required to complete this stage
                                        </label>
                                        <label className="flex items-center gap-2 rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-black text-violet-800">
                                          <input
                                            type="checkbox"
                                            checked={stage.githubIntegrationRequired}
                                            onChange={(e) => updateProjectStage(index, stageIndex, "githubIntegrationRequired", e.target.checked)}
                                          />
                                          GitHub integration required to complete this stage
                                        </label>
                                      </div>

                                      <div className="mt-3">
                                        <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">Demo Documents</p>
                                        <input
                                          value={stageDocSearch[searchKey] || ""}
                                          onChange={(e) => setStageDocSearchValue(searchKey, e.target.value)}
                                          className="mt-2 w-full rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-orange-300"
                                          placeholder="Search tag or document"
                                        />
                                        <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-slate-200">
                                          {demoDocumentsLoaded && !filteredDocs.length ? (
                                            <p className="px-3 py-3 text-xs font-semibold text-slate-400">No demo documents found.</p>
                                          ) : (
                                            filteredDocs.map((doc) => (
                                              <label
                                                key={doc.id}
                                                className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 last:border-b-0 hover:bg-slate-50"
                                              >
                                                <span className="flex items-center gap-2">
                                                  <input
                                                    type="checkbox"
                                                    checked={(stage.demoDocumentIds || []).includes(doc.id)}
                                                    onChange={() => toggleStageDemoDocument(index, stageIndex, doc.id)}
                                                  />
                                                  {doc.name || doc.original_filename}
                                                </span>
                                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] text-slate-500">
                                                  {doc.mime_type || "file"}
                                                </span>
                                              </label>
                                            ))
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {projectDraftError ? (
                      <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                        {projectDraftError}
                      </div>
                    ) : null}

                    {projectDraftMessage ? (
                      <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700">
                        {projectDraftMessage}
                      </div>
                    ) : null}

                    <button
                      type="submit"
                      disabled={projectSaving}
                      className="mt-6 inline-flex items-center justify-center rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {projectSaving ? "Saving..." : "Create Project"}
                    </button>
                  </form>
                </div>
                </div>
              ) : activeSection === "project_catalog" ? (
                <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.45)]">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-2xl font-black text-slate-950">Project Catalog</h3>
                        <p className="mt-2 text-sm font-semibold text-slate-500">Loaded from backend `/admin/projects`.</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">
                        {projectsLoaded ? projects.length : "..." } projects
                      </span>
                    </div>

                    <div className="mt-6 grid gap-4">
                      {projectsLoading && !projectsLoaded ? (
                        <SectionEmpty title="Loading projects" body="Fetching project catalog from backend." />
                      ) : projects.map((project) => (
                        <article key={project.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-500">
                                {project.company_name || companyNameById.get(String(project.company_id)) || "Unknown company"}
                              </p>
                              <h4 className="mt-1 text-xl font-black text-slate-950">{project.title}</h4>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${project.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                              {project.active ? "Active" : "Paused"}
                            </span>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-600">
                            <span className="rounded-full bg-white px-3 py-2">{project.category}</span>
                            <span className="rounded-full bg-white px-3 py-2">{project.timeline_weeks || project.weeks} weeks</span>
                            <span className="rounded-full bg-white px-3 py-2">{project.project_coins || project.coins} coins</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <SectionEmpty
                      title="Project Catalog Rules"
                      body="The admin-created project is stored in `projects` and its steps are cached in `steps_json`, while detailed phases are normalized in `project_steps`."
                    />
                    <SectionEmpty
                      title="Next API Hook"
                      body="The create form already posts to `/admin/projects`, so this is now a live create flow."
                    />
                    {loadError ? (
                      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-700">
                        {loadError}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : activeSection === "mentors" ? (
                <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                  <form
                    id="mentor-form-card"
                    onSubmit={handleMentorSubmit}
                    className="h-fit rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.45)]"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-2xl font-black text-slate-950">{mentorEditingId ? "Edit Mentor" : "Create Mentor"}</h3>
                        <p className="mt-2 text-sm font-semibold text-slate-500">Mentors map 1:1 to CrewAI agent keys used inside the workspace chat.</p>
                      </div>
                      {mentorEditingId ? (
                        <button
                          type="button"
                          onClick={resetMentorForm}
                          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-700"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-6 grid gap-4">
                      <label className="grid gap-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Agent Key</span>
                        <input
                          value={mentorForm.agentKey}
                          onChange={(e) => updateMentorField("agentKey", e.target.value)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                          placeholder="e.g. arjun"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Mentor Name</span>
                        <input
                          value={mentorForm.mentorName}
                          onChange={(e) => updateMentorField("mentorName", e.target.value)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                          placeholder="e.g. Arjun"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Role</span>
                        <input
                          value={mentorForm.role}
                          onChange={(e) => updateMentorField("role", e.target.value)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                          placeholder="e.g. Arjun - Product Manager Mentor"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Goal</span>
                        <textarea
                          value={mentorForm.goal}
                          onChange={(e) => updateMentorField("goal", e.target.value)}
                          rows={2}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                          placeholder="What this mentor is optimizing for."
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Backstory / Rules</span>
                        <textarea
                          value={mentorForm.backstory}
                          onChange={(e) => updateMentorField("backstory", e.target.value)}
                          rows={4}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                          placeholder="Persona and guardrails the agent must follow."
                        />
                      </label>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="grid gap-2">
                          <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Output Format</span>
                          <select
                            value={mentorForm.outputFormat}
                            onChange={(e) => updateMentorField("outputFormat", e.target.value)}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                          >
                            {MENTOR_OUTPUT_FORMATS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="grid gap-2">
                          <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">Avatar</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setMentorAvatarFile(e.target.files?.[0] || null)}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold outline-none transition focus:border-orange-300 focus:bg-white"
                          />
                        </label>
                      </div>

                      <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
                        <input
                          type="checkbox"
                          checked={mentorForm.isHidden}
                          onChange={(e) => updateMentorField("isHidden", e.target.checked)}
                        />
                        Hidden mentor (used internally, not shown to students)
                      </label>
                    </div>

                    {mentorError ? (
                      <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                        {mentorError}
                      </div>
                    ) : null}
                    {mentorMessage ? (
                      <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700">
                        {mentorMessage}
                      </div>
                    ) : null}

                    <button
                      type="submit"
                      disabled={mentorSaving}
                      className="mt-6 inline-flex items-center justify-center rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {mentorSaving ? "Saving..." : mentorEditingId ? "Save Changes" : "Create Mentor"}
                    </button>
                  </form>

                  <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.45)]">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-2xl font-black text-slate-950">Mentors</h3>
                        <p className="mt-2 text-sm font-semibold text-slate-500">Loaded from `project_mentors`.</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">
                        {mentorsLoaded ? mentors.length : "..."} mentors
                      </span>
                    </div>

                    <div className="mt-6 grid gap-3">
                      {!mentorsLoaded ? (
                        <SectionEmpty title="Loading mentors" body="Fetching mentor roster from the backend." />
                      ) : !mentors.length ? (
                        <SectionEmpty title="No mentors yet" body="Use the form on the left to create the first mentor." />
                      ) : (
                        mentors.map((mentor) => (
                          <div key={mentor.id} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-start gap-3 min-w-0">
                              {mentor.avatar_url ? (
                                <img
                                  src={mentor.avatar_url}
                                  alt={mentor.mentor_name || mentor.name}
                                  className="h-11 w-11 shrink-0 rounded-full border border-slate-200 object-cover"
                                />
                              ) : (
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-black text-white">
                                  {String(mentor.mentor_name || mentor.name || "?").trim().charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="truncate font-black text-slate-900">{mentor.mentor_name || mentor.name}</p>
                                <p className="truncate text-sm font-semibold text-slate-500">{mentor.role}</p>
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                                    {mentor.agent_key}
                                  </span>
                                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                                    {mentor.output_format || "markdown"}
                                  </span>
                                  {mentor.is_hidden ? (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-amber-700">
                                      Hidden
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                type="button"
                                onClick={() => startEditMentor(mentor)}
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100"
                                title="Edit mentor"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteMentor(mentor)}
                                disabled={mentorDeletingId === mentor.id}
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                                title="Delete mentor"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {sectionCards.map((card) => (
                    <SectionEmpty key={card.title} title={card.title} body={card.body} />
                  ))}

                  {!sectionCards.length ? (
                    <SectionEmpty
                      title={sectionTitle}
                      body="No static content is defined for this section yet, but the navigation, shell, and spacing are still visible."
                    />
                  ) : null}
                </div>
              )}
            </div>
          )}
        </section>

        <footer className="mt-8 rounded-[2rem] border border-slate-200 bg-white px-6 py-5 text-sm font-semibold text-slate-500 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.45)]">
          Frontend preview active. Admin API calls are disabled in this dashboard shell.
        </footer>
      </div>
    </main>
  );
}
