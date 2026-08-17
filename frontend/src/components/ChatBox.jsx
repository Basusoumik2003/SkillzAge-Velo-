"use client";

import { useEffect, useRef, useState } from "react";

const MAX_MESSAGE_WORDS = 100;
const MAX_ATTACHMENTS = 8;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const TYPEWRITER_INTERVAL_MS = 14;
const ACCEPTED_ATTACHMENT_EXTENSIONS = [
  ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
  ".txt", ".csv", ".zip", ".png", ".jpg", ".jpeg", ".webp"
];
const THEME_KEY = "internlabs_chat_theme_v1";

function formatTime(isoString) {
  if (!isoString) return "";
  try {
    return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function countWords(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function avatarLookupKey(value) {
  return String(value || "").trim().toLowerCase();
}

function renderInline(text, dark) {
  const parts = String(text || "")
    .split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
    .filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} style={{ color: dark ? "#f1f5f9" : undefined }} className={dark ? "" : "font-black text-slate-900"}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          className="rounded-md px-1.5 py-0.5 text-[0.92em] font-black"
          style={{
            background: dark ? "rgba(148,163,184,0.16)" : "#f1f5f9",
            color: dark ? "#e2e8f0" : "#334155",
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function normalizeReviewScoreText(value) {
  return String(value || "").replace(
    /\bScore:\s*(\d{1,3})\s*\/\s*75\b/g,
    "Score: $1/100",
  );
}

function normalizeListText(value) {
  return normalizeReviewScoreText(value)
    .replace(/\(\s*(\d{1,2})\s*\)\s+/g, "\n$1. ")
    .replace(/,\s*(?:and\s+)?\(\s*(\d{1,2})\s*\)\s+/g, "\n$1. ")
    .replace(/(^|\s)(\d{1,2}\))\s+/g, (match, prefix, marker) => {
      const lead = prefix && prefix.trim() ? "\n" : prefix;
      return `${lead}${marker} `;
    })
    .replace(/([,;])\s+(\d{1,2}[.)])\s+/g, "\n$2 ");
}
function messageAnimationKey(message, index) {
  return `${index}:${message?.role || ""}:${message?.kind || ""}:${String(message?.content || "").slice(0, 80)}:${String(message?.content || "").length}`;
}

function shouldTypewriteMessage(message) {
  if (!message || message.role === "user") return false;
  if (!String(message.content || "").trim()) return false;
  if (message.kind === "stage-detail") return false;
  return true;
}

function isNumberedSectionHeading(number, text) {
  const value = Number(number);
  const heading = String(text || "").trim();
  if (!Number.isFinite(value) || value < 1 || value > 8) return false;
  if (!heading || heading.length > 90) return false;
  if (/[?.!]$/.test(heading)) return false;
  return /[a-zA-Z]/.test(heading);
}

function isPlainHeading(text) {
  const value = String(text || "").trim();
  if (!value || value.length > 72) return false;
  if (/[?.!,]$/.test(value)) return false;
  if (/^(and|or|but|the|this|that|it|you|your|a|an)\b/i.test(value)) return false;
  return /\b(stage|focus|review|suggestion|strength|improve|gap|next|question|objective|deliverable|needs|happens|works)\b/i.test(value);
}

function MessageContent({ content, compact = false, danger = false, dark = false }) {
  const baseColor = dark ? "#cbd5e1" : danger ? "#b91c1c" : "#475569";
  const headingColor = dark ? "#f1f5f9" : danger ? "#b91c1c" : "#1e293b";
  const lines = normalizeListText(content).split(/\r?\n/);
  return (
    <div
      style={{ color: baseColor, fontSize: compact ? "0.82rem" : "0.875rem", lineHeight: compact ? "1.35rem" : "1.55rem" }}
      className="mt-1 space-y-1.5 break-words"
    >
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed)
          return <div key={index} style={{ height: compact ? "0.375rem" : "0.5rem" }} />;

        const numberedHeading = trimmed.match(/^(\d{1,2})[.)]\s+(.+)$/);
        if (numberedHeading && isNumberedSectionHeading(numberedHeading[1], numberedHeading[2])) {
          return (
            <div key={index} className={index === 0 ? "pt-0" : compact ? "pt-1.5" : "pt-2"}>
              <p
                className="flex items-center gap-2 font-black"
                style={{ color: headingColor, fontSize: compact ? "0.82rem" : "0.9rem", lineHeight: compact ? "1.15rem" : "1.25rem" }}
              >
                <span
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[0.62rem] font-black"
                  style={{
                    background: dark ? "rgba(249,115,22,0.14)" : "#fff7ed",
                    color: "#f97316",
                  }}
                >
                  {numberedHeading[1]}
                </span>
                <span>{renderInline(numberedHeading[2], dark)}</span>
              </p>
            </div>
          );
        }

        if (/^#{1,3}\s+/.test(trimmed)) {
          return (
            <p key={index} style={{ color: headingColor, marginTop: "0.45rem", fontWeight: 900 }}>
              {renderInline(trimmed.replace(/^#{1,3}\s+/, ""), dark)}
            </p>
          );
        }

        if (isPlainHeading(trimmed)) {
          return (
            <p key={index} className={index === 0 ? "font-black" : "pt-1.5 font-black"} style={{ color: headingColor }}>
              {renderInline(trimmed, dark)}
            </p>
          );
        }

        if (/^[-*]\s+/.test(trimmed)) {
          return (
            <p key={index} className="flex gap-2 pl-1">
              <span style={{ marginTop: "0.6em", height: "0.375rem", width: "0.375rem", borderRadius: "9999px", background: "currentColor", opacity: 0.5, flexShrink: 0, display: "inline-block" }} />
              <span>{renderInline(trimmed.replace(/^[-*]\s+/, ""), dark)}</span>
            </p>
          );
        }

        const numberedItem = trimmed.match(/^(\d{1,2})[.)]\s+(.+)$/);
        if (numberedItem) {
          return (
            <p key={index} className="flex gap-2 pl-1">
              <span className="mt-[0.1rem] min-w-5 shrink-0 text-right font-black opacity-70">{numberedItem[1]}.</span>
              <span>{renderInline(numberedItem[2], dark)}</span>
            </p>
          );
        }

        return <p key={index} className="max-w-none">{renderInline(trimmed, dark)}</p>;
      })}
    </div>
  );
}

function PlainMessageContent({ content, compact = false, dark = false }) {
  const baseColor = dark ? "#cbd5e1" : "#475569";
  const lines = normalizeListText(content).split(/\r?\n/);
  return (
    <div
      style={{ color: baseColor, fontSize: compact ? "0.82rem" : "0.875rem", lineHeight: compact ? "1.35rem" : "1.55rem" }}
      className="mt-1 space-y-1.5 break-words font-medium"
    >
      {lines.map((line, index) => (
        line.trim()
          ? <p key={index} className="max-w-none whitespace-pre-wrap">{line}</p>
          : <div key={index} style={{ height: compact ? "0.375rem" : "0.5rem" }} />
      ))}
    </div>
  );
}

/* ─── Themes ─────────────────────────────────────────────────── */
const CHAT_THEMES = [
  {
    id: "snow",
    label: "Snow",
    swatchA: "#f1f5f9", swatchB: "#e2e8f0",
    sectionBg: "#ffffff", sectionBorder: "#e2e8f0",
    feedBg: "#f8fafc",
    inputBg: "#f1f5f9", inputBorder: "#e2e8f0", inputFocusBg: "#ffffff",
    inputText: "#1e293b", inputPlaceholder: "#94a3b8", wordCountColor: "#94a3b8",
    agentBg: "#ffffff", agentBorder: "1.5px solid #e2e8f0", agentShadow: "0 2px 8px -3px rgba(15,23,42,0.08)",
    userBg: "#f1f5f9", userBorder: "1.5px solid #cbd5e1", userShadow: "0 2px 6px -3px rgba(15,23,42,0.08)",
    agentAvatarBg: "linear-gradient(135deg,#cbd5e1,#94a3b8)", agentAvatarColor: "#1e293b",
    userAvatarBg: "linear-gradient(135deg,#94a3b8,#64748b)", userAvatarColor: "#ffffff",
    tsAgent: "#94a3b8", tsUser: "rgba(100,116,139,0.7)", tickColor: "#64748b",
    titleColor: "#1e293b", dark: false,
  },
  {
    id: "lavender",
    label: "Lavender",
    swatchA: "#ede9f7", swatchB: "#fdf4ff",
    sectionBg: "#fdf4ff", sectionBorder: "#e9d5ff",
    feedBg: "#f5f0ff",
    inputBg: "#f3e8ff", inputBorder: "#e9d5ff", inputFocusBg: "#faf5ff",
    inputText: "#3b0764", inputPlaceholder: "#a78bfa", wordCountColor: "#a78bfa",
    agentBg: "#ffffff", agentBorder: "1.5px solid #e9d5ff", agentShadow: "0 2px 10px -4px rgba(139,92,246,0.12)",
    userBg: "#ede9f7", userBorder: "1.5px solid #ddd6f3", userShadow: "0 2px 8px -3px rgba(124,58,237,0.18)",
    agentAvatarBg: "linear-gradient(135deg,#c4b5fd,#a78bfa)", agentAvatarColor: "#4c1d95",
    userAvatarBg: "linear-gradient(135deg,#8b5cf6,#7c3aed)", userAvatarColor: "#ffffff",
    tsAgent: "#a78bfa", tsUser: "rgba(124,58,237,0.6)", tickColor: "#8b5cf6",
    titleColor: "#3b0764", dark: false,
  },
  {
    id: "ocean",
    label: "Ocean",
    swatchA: "#bfdbfe", swatchB: "#e0f2fe",
    sectionBg: "#f0f9ff", sectionBorder: "#bae6fd",
    feedBg: "#e0f2fe",
    inputBg: "#dbeafe", inputBorder: "#93c5fd", inputFocusBg: "#eff6ff",
    inputText: "#1e3a8a", inputPlaceholder: "#60a5fa", wordCountColor: "#60a5fa",
    agentBg: "#ffffff", agentBorder: "1.5px solid #bae6fd", agentShadow: "0 2px 10px -4px rgba(14,165,233,0.12)",
    userBg: "#bfdbfe", userBorder: "1.5px solid #93c5fd", userShadow: "0 2px 8px -3px rgba(59,130,246,0.2)",
    agentAvatarBg: "linear-gradient(135deg,#7dd3fc,#38bdf8)", agentAvatarColor: "#0c4a6e",
    userAvatarBg: "linear-gradient(135deg,#3b82f6,#1d4ed8)", userAvatarColor: "#ffffff",
    tsAgent: "#7dd3fc", tsUser: "rgba(59,130,246,0.65)", tickColor: "#3b82f6",
    titleColor: "#0c4a6e", dark: false,
  },
  {
    id: "emerald",
    label: "Emerald",
    swatchA: "#bbf7d0", swatchB: "#dcfce7",
    sectionBg: "#f0fdf4", sectionBorder: "#bbf7d0",
    feedBg: "#dcfce7",
    inputBg: "#d1fae5", inputBorder: "#86efac", inputFocusBg: "#ecfdf5",
    inputText: "#14532d", inputPlaceholder: "#4ade80", wordCountColor: "#4ade80",
    agentBg: "#ffffff", agentBorder: "1.5px solid #bbf7d0", agentShadow: "0 2px 10px -4px rgba(34,197,94,0.12)",
    userBg: "#bbf7d0", userBorder: "1.5px solid #86efac", userShadow: "0 2px 8px -3px rgba(34,197,94,0.2)",
    agentAvatarBg: "linear-gradient(135deg,#86efac,#22c55e)", agentAvatarColor: "#14532d",
    userAvatarBg: "linear-gradient(135deg,#16a34a,#15803d)", userAvatarColor: "#ffffff",
    tsAgent: "#86efac", tsUser: "rgba(22,163,74,0.65)", tickColor: "#22c55e",
    titleColor: "#14532d", dark: false,
  },
  {
    id: "rose",
    label: "Rose",
    swatchA: "#fecdd3", swatchB: "#ffe4e6",
    sectionBg: "#fff1f2", sectionBorder: "#fecdd3",
    feedBg: "#ffe4e6",
    inputBg: "#fce7eb", inputBorder: "#fda4af", inputFocusBg: "#fff1f2",
    inputText: "#881337", inputPlaceholder: "#fb7185", wordCountColor: "#fb7185",
    agentBg: "#ffffff", agentBorder: "1.5px solid #fecdd3", agentShadow: "0 2px 10px -4px rgba(244,63,94,0.1)",
    userBg: "#fecdd3", userBorder: "1.5px solid #fda4af", userShadow: "0 2px 8px -3px rgba(244,63,94,0.18)",
    agentAvatarBg: "linear-gradient(135deg,#fda4af,#fb7185)", agentAvatarColor: "#881337",
    userAvatarBg: "linear-gradient(135deg,#f43f5e,#e11d48)", userAvatarColor: "#ffffff",
    tsAgent: "#fda4af", tsUser: "rgba(244,63,94,0.65)", tickColor: "#f43f5e",
    titleColor: "#881337", dark: false,
  },
  {
    id: "amber",
    label: "Amber",
    swatchA: "#fde68a", swatchB: "#fef3c7",
    sectionBg: "#fffbeb", sectionBorder: "#fde68a",
    feedBg: "#fef3c7",
    inputBg: "#fef9c3", inputBorder: "#fcd34d", inputFocusBg: "#fffbeb",
    inputText: "#78350f", inputPlaceholder: "#f59e0b", wordCountColor: "#f59e0b",
    agentBg: "#ffffff", agentBorder: "1.5px solid #fde68a", agentShadow: "0 2px 10px -4px rgba(245,158,11,0.12)",
    userBg: "#fde68a", userBorder: "1.5px solid #fcd34d", userShadow: "0 2px 8px -3px rgba(245,158,11,0.2)",
    agentAvatarBg: "linear-gradient(135deg,#fcd34d,#f59e0b)", agentAvatarColor: "#78350f",
    userAvatarBg: "linear-gradient(135deg,#d97706,#b45309)", userAvatarColor: "#ffffff",
    tsAgent: "#fcd34d", tsUser: "rgba(245,158,11,0.65)", tickColor: "#f59e0b",
    titleColor: "#78350f", dark: false,
  },
  {
    id: "slate",
    label: "Slate Pro",
    swatchA: "#cbd5e1", swatchB: "#e2e8f0",
    sectionBg: "#f1f5f9", sectionBorder: "#cbd5e1",
    feedBg: "#e2e8f0",
    inputBg: "#e2e8f0", inputBorder: "#cbd5e1", inputFocusBg: "#f1f5f9",
    inputText: "#1e293b", inputPlaceholder: "#94a3b8", wordCountColor: "#94a3b8",
    agentBg: "#ffffff", agentBorder: "1.5px solid #e2e8f0", agentShadow: "0 2px 10px -4px rgba(15,23,42,0.1)",
    userBg: "#cbd5e1", userBorder: "1.5px solid #94a3b8", userShadow: "0 2px 8px -3px rgba(71,85,105,0.18)",
    agentAvatarBg: "linear-gradient(135deg,#94a3b8,#64748b)", agentAvatarColor: "#ffffff",
    userAvatarBg: "linear-gradient(135deg,#475569,#334155)", userAvatarColor: "#ffffff",
    tsAgent: "#94a3b8", tsUser: "rgba(71,85,105,0.65)", tickColor: "#64748b",
    titleColor: "#1e293b", dark: false,
  },
  {
    id: "midnight",
    label: "Midnight",
    swatchA: "#1e1b4b", swatchB: "#0f172a",
    sectionBg: "#0f172a", sectionBorder: "#1e293b",
    feedBg: "#0f172a",
    inputBg: "#1e293b", inputBorder: "#334155", inputFocusBg: "#1e293b",
    inputText: "#e2e8f0", inputPlaceholder: "#475569", wordCountColor: "#475569",
    agentBg: "#1e293b", agentBorder: "1.5px solid #334155", agentShadow: "0 2px 10px -4px rgba(0,0,0,0.4)",
    userBg: "#1e1b4b", userBorder: "1.5px solid #3730a3", userShadow: "0 2px 8px -3px rgba(99,102,241,0.35)",
    agentAvatarBg: "linear-gradient(135deg,#334155,#475569)", agentAvatarColor: "#e2e8f0",
    userAvatarBg: "linear-gradient(135deg,#4338ca,#6366f1)", userAvatarColor: "#e0e7ff",
    tsAgent: "#475569", tsUser: "#6366f1", tickColor: "#818cf8",
    titleColor: "#e2e8f0", dark: true,
  },
];

function getStoredTheme() {
  try {
    const id = localStorage.getItem(THEME_KEY);
    return CHAT_THEMES.find((t) => t.id === id) || CHAT_THEMES[0];
  } catch {
    return CHAT_THEMES[0];
  }
}

/* ─── Component ──────────────────────────────────────────────── */
export default function ChatBox({
  messages,
  onSend,
  onAction,
  loading,
  className = "",
  title = "Agent Chat",
  subtitle = "Mentor online",
  offline = false,
  compact = false,
  loadingAgentName = "Mentor",
  placeholder = "Describe what you tried, what failed, and what you want next.",
  dialogMessage = null,
  userName = "You",
  userAvatarUrl = "",
  mentorAvatarUrl = "",
  mentorAvatars = {},
  attachmentDisabled = false,
  attachmentDisabledReason = "This stage does not require a document submission.",
  onAttachmentError,
}) {
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [theme, setTheme] = useState(CHAT_THEMES[0]);
  const [showPicker, setShowPicker] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [themeLoading, setThemeLoading] = useState(false);
  const [typewriter, setTypewriter] = useState({ key: "", content: "", complete: true });
  const feedRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const typewriterTimerRef = useRef(null);
  const lastAnimatedKeyRef = useRef("");
  const wordCount = countWords(message);

  useEffect(() => { setTheme(getStoredTheme()); }, []);

  const applyTheme = (t) => {
    setShowPicker(false);
    setThemeLoading(true);
    try { localStorage.setItem(THEME_KEY, t.id); } catch {}
    setTheme(t);
    setTimeout(() => setThemeLoading(false), 500);
  };

  const handleMessageChange = (nextValue) => {
    const nextText = String(nextValue || "");
    const currentCount = countWords(message);
    const nextCount = countWords(nextText);
    if (currentCount >= MAX_MESSAGE_WORDS && nextText.length > message.length) return;
    if (nextCount > MAX_MESSAGE_WORDS) return;
    setMessage(nextText);
  };

  useEffect(() => {
    if (!feedRef.current) return;
    feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (!feedRef.current) return;
    feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [typewriter.content]);

  useEffect(() => {
    if (typewriterTimerRef.current) {
      clearInterval(typewriterTimerRef.current);
      typewriterTimerRef.current = null;
    }

    const latestIndex = messages.length - 1;
    const latestMessage = messages[latestIndex];
    if (!shouldTypewriteMessage(latestMessage)) {
      setTypewriter((current) => (current.complete ? current : { key: "", content: "", complete: true }));
      return undefined;
    }

    const key = messageAnimationKey(latestMessage, latestIndex);
    const fullText = String(latestMessage.content || "");
    if (lastAnimatedKeyRef.current === key) {
      setTypewriter({ key, content: fullText, complete: true });
      return undefined;
    }

    lastAnimatedKeyRef.current = key;
    setTypewriter({ key, content: "", complete: false });
    let cursor = 0;
    const chunkSize = fullText.length > 1200 ? 8 : fullText.length > 600 ? 5 : 3;
    typewriterTimerRef.current = setInterval(() => {
      cursor = Math.min(fullText.length, cursor + chunkSize);
      setTypewriter({ key, content: fullText.slice(0, cursor), complete: cursor >= fullText.length });
      if (cursor >= fullText.length && typewriterTimerRef.current) {
        clearInterval(typewriterTimerRef.current);
        typewriterTimerRef.current = null;
      }
    }, TYPEWRITER_INTERVAL_MS);

    return () => {
      if (typewriterTimerRef.current) {
        clearInterval(typewriterTimerRef.current);
        typewriterTimerRef.current = null;
      }
    };
  }, [messages]);

  const openAttachmentPicker = () => {
    if (loading || submitting) return;
    if (attachmentDisabled) {
      setAttachmentError(attachmentDisabledReason);
      onAttachmentError?.(attachmentDisabledReason);
      return;
    }
    attachmentInputRef.current?.click();
  };

  const validateAttachment = (file) => {
    const name = String(file?.name || "").toLowerCase();
    const extension = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
    if (!ACCEPTED_ATTACHMENT_EXTENSIONS.includes(extension)) {
      return `${file.name} is not a supported file type.`;
    }
    if (Number(file?.size || 0) > MAX_ATTACHMENT_BYTES) {
      return `${file.name} is larger than 25 MB.`;
    }
    return "";
  };

  const handleAttachmentChange = (event) => {
    const files = Array.from(event.target.files || []).filter(Boolean);
    event.target.value = "";
    if (!files.length) return;
    setAttachmentError("");
    setAttachments((current) => {
      const next = [...current];
      for (const file of files) {
        if (next.length >= MAX_ATTACHMENTS) break;
        const validationError = validateAttachment(file);
        if (validationError) {
          setAttachmentError(validationError);
          onAttachmentError?.(validationError);
          continue;
        }
        const duplicate = next.some(
          (item) =>
            item.name === file.name &&
            item.size === file.size &&
            item.lastModified === file.lastModified,
        );
        if (!duplicate) next.push(file);
      }
      return next;
    });
  };

  const removeAttachment = (index) => {
    setAttachments((current) => current.filter((_, i) => i !== index));
  };

  const submit = (event) => {
    event.preventDefault();
    const text = message.trim();
    if (!text && !attachments.length) return;
    const submittedAttachments = attachments.slice();
    const previousMessage = message;
    setSubmitting(true);
    setMessage("");
    setAttachments([]);
    setAttachmentError("");
    Promise.resolve()
      .then(() => onSend({ text, attachments: submittedAttachments }))
      .then((result) => {
        if (result !== false) return;
        setMessage(previousMessage);
        setAttachments(submittedAttachments);
      })
      .catch((error) => {
        const message = error?.message || "Could not send. Please try again.";
        setMessage(previousMessage);
        setAttachments(submittedAttachments);
        setAttachmentError(message);
        onAttachmentError?.(message);
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <>
    <style>{`
      .chatbox-themed textarea::placeholder { color: var(--placeholder-color, #94a3b8); transition: color 0.3s; }
      @keyframes chatbox-spin { to { transform: rotate(360deg); } }
      .chatbox-theme-spinner { animation: chatbox-spin 0.65s linear infinite; }
      @keyframes chatbox-caret-blink { 0%, 45% { opacity: 1; } 46%, 100% { opacity: 0; } }
      .chatbox-typewriter-caret { animation: chatbox-caret-blink 0.85s steps(1) infinite; }
      @keyframes chatbox-message-in {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .chatbox-message-in { animation: chatbox-message-in 260ms ease-out both; }
    `}</style>
    <section
      className={`flex h-full max-h-full min-h-0 flex-col overflow-hidden rounded-xl ${compact ? "gap-1 p-1" : "gap-3 p-4"} ${className} chatbox-themed`}
      style={{ background: theme.sectionBg, border: `1.5px solid ${theme.sectionBorder}`, transition: "background 0.3s, border-color 0.3s", "--placeholder-color": theme.inputPlaceholder, position: "relative" }}
    >
      {/* Theme change loader overlay */}
      {themeLoading && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 60, borderRadius: "inherit",
          background: "rgba(255,255,255,0.38)", backdropFilter: "blur(3px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <span
            className="chatbox-theme-spinner"
            style={{
              display: "block", width: 30, height: 30, borderRadius: "50%",
              border: "3px solid rgba(249,115,22,0.2)",
              borderTopColor: "#f97316",
            }}
          />
        </div>
      )}
      {/* Header */}
      <div className={`flex shrink-0 items-center justify-between gap-2 ${compact ? "px-1.5 py-0.5" : "px-1"}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${offline ? "bg-red-400 shadow-[0_0_6px_2px_rgba(248,113,113,0.45)]" : "bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.45)]"}`} />
          <h3 className={`${compact ? "truncate text-[0.82rem]" : "text-base"} font-black`} style={{ color: theme.titleColor, transition: "color 0.3s" }}>
            {title}
          </h3>
        </div>

        {/* Right side: theme picker + status badge */}
        <div className="flex items-center gap-2">
          {/* Theme picker */}
          <div className="relative">
            <button
              data-tour="tour-theme"
              type="button"
              onClick={() => setShowPicker((v) => !v)}
              title="Change chat colour theme"
              className="flex h-6 w-6 items-center justify-center rounded-full border border-orange-200 bg-orange-50 text-[#f97316] transition hover:border-[#f97316] hover:bg-orange-100"
            >
              {/* Paint palette icon */}
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10a1.5 1.5 0 0 0 1.5-1.5c0-.38-.15-.73-.39-1a1.49 1.49 0 0 1-.38-1c0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="6.5" cy="11.5" r="1.2" fill="currentColor"/>
                <circle cx="9.5" cy="7.5" r="1.2" fill="currentColor"/>
                <circle cx="14.5" cy="7.5" r="1.2" fill="currentColor"/>
                <circle cx="17.5" cy="11.5" r="1.2" fill="currentColor"/>
              </svg>
            </button>

            {showPicker && (
              <div
                className="absolute right-0 top-8 z-50 flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
                style={{ minWidth: 130 }}
              >
                {CHAT_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTheme(t)}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50"
                  >
                    {/* Two-tone swatch */}
                    <span className="flex h-4 w-6 shrink-0 overflow-hidden rounded-full border border-slate-200">
                      <span style={{ flex: 1, background: t.swatchA }} />
                      <span style={{ flex: 1, background: t.swatchB }} />
                    </span>
                    <span
                      className="text-[0.72rem] font-black"
                      style={{ color: theme.id === t.id ? "#f97316" : "#64748b" }}
                    >
                      {t.label}
                    </span>
                    {theme.id === t.id && (
                      <svg viewBox="0 0 24 24" className="ml-auto h-3 w-3 text-[#f97316]" fill="none">
                        <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span
            className={`rounded-full font-black ${compact ? "px-2 py-0.5 text-[0.62rem]" : "px-3 py-1 text-xs"}`}
            style={offline
              ? { border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626" }
              : { border: `1px solid ${theme.sectionBorder}`, background: theme.inputBg, color: theme.titleColor, opacity: 0.8, transition: "background 0.3s, border-color 0.3s" }
            }
          >
            {subtitle}
          </span>
        </div>
      </div>

      {/* Messages feed */}
      <div
        ref={feedRef}
        className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-xl ${compact ? "space-y-3 p-2" : "space-y-4 p-4"}`}
        style={{ background: theme.feedBg, transition: "background 0.3s" }}
      >
        {messages.map((item, index) => {
          const isUser = item.role === "user";
          const animationKey = messageAnimationKey(item, index);
          const isTypewriting = typewriter.key === animationKey && !typewriter.complete;
          const visibleContent = typewriter.key === animationKey ? typewriter.content : item.content;
          const displayName = isUser
            ? String(userName || "You").split(" ")[0]
            : String(item.agent || "Mentor");
          const avatarLetter = displayName.slice(0, 1).toUpperCase();
          const mentorAvatarFromMap =
            mentorAvatars[avatarLookupKey(item.agent)] ||
            mentorAvatars[avatarLookupKey(displayName)] ||
            mentorAvatars[avatarLookupKey(item.agent_key)] ||
            "";
          const avatarImageUrl = isUser ? String(userAvatarUrl || "") : String(item.avatar_url || mentorAvatarFromMap || mentorAvatarUrl || "");
          const timeLabel = formatTime(item.created_at);

          /* Bubble colors — special kinds override user/agent defaults */
          let bubbleBg, bubbleBorder, bubbleShadow;
          if (item.kind === "review-rejected") {
            bubbleBg = theme.dark ? "#2d0a0a" : "#fef2f2";
            bubbleBorder = theme.dark ? "1.5px solid #7f1d1d" : "1.5px solid #fecaca";
            bubbleShadow = "0 2px 8px -3px rgba(239,68,68,0.15)";
          } else if (item.kind === "review-approved") {
            bubbleBg = theme.dark ? "#052e16" : "#f0fdf4";
            bubbleBorder = theme.dark ? "1.5px solid #14532d" : "1.5px solid #bbf7d0";
            bubbleShadow = "0 2px 8px -3px rgba(34,197,94,0.15)";
          } else if (item.kind === "mentor-busy") {
            bubbleBg = theme.dark ? "#30230a" : "#fff7ed";
            bubbleBorder = theme.dark ? "1.5px solid #92400e" : "1.5px solid #fed7aa";
            bubbleShadow = "0 2px 10px -4px rgba(249,115,22,0.28)";
          } else if (isUser) {
            bubbleBg = theme.userBg;
            bubbleBorder = theme.userBorder;
            bubbleShadow = theme.userShadow;
          } else {
            bubbleBg = theme.agentBg;
            bubbleBorder = theme.agentBorder;
            bubbleShadow = theme.agentShadow;
          }

          const avatarBg = isUser ? theme.userAvatarBg : theme.agentAvatarBg;
          const avatarColor = isUser ? theme.userAvatarColor : theme.agentAvatarColor;

          const isDanger = item.kind === "review-rejected";

          const bubble = (
            <div
              className={compact ? "rounded-xl px-3 py-2" : isUser ? "rounded-2xl rounded-tr-sm px-4 py-3" : "rounded-2xl rounded-tl-sm px-4 py-3"}
              style={{ background: bubbleBg, border: bubbleBorder, boxShadow: bubbleShadow, transition: "background 0.3s, border 0.3s" }}
            >
              {item.kind === "stage-detail" ? (
                <div className="mb-1.5 flex items-center gap-2">
                  <span style={{ background: theme.dark ? "#334155" : "#f1f5f9", color: theme.dark ? "#94a3b8" : "#64748b" }}
                    className="rounded-full px-2 py-0.5 text-[0.58rem] font-black uppercase tracking-[0.1em]">
                    {item.label || "Stage detail"}
                  </span>
                  <span style={{ height: 1, flex: 1, background: theme.dark ? "#334155" : "#e2e8f0" }} />
                </div>
              ) : null}
              {item.kind === "mentor-busy" ? (
                <div className="mb-2 flex items-center gap-2">
                  <span
                    style={{
                      background: theme.dark ? "rgba(251,146,60,0.16)" : "#ffedd5",
                      color: theme.dark ? "#fdba74" : "#c2410c",
                    }}
                    className="rounded-full px-2.5 py-1 text-[0.58rem] font-black uppercase tracking-[0.12em]"
                  >
                    Mentor status
                  </span>
                  <span style={{ height: 1, flex: 1, background: theme.dark ? "#78350f" : "#fed7aa" }} />
                </div>
              ) : null}

              {isUser ? (
                <PlainMessageContent content={visibleContent} compact={compact} dark={theme.dark} />
              ) : (
                <MessageContent
                  content={visibleContent}
                  compact={compact}
                  danger={isDanger}
                  dark={theme.dark}
                />
              )}
              {isTypewriting ? (
                <span
                  className="chatbox-typewriter-caret ml-0.5 inline-block h-4 w-1 translate-y-0.5 rounded-full"
                  style={{ background: theme.dark ? "#cbd5e1" : "#f97316" }}
                  aria-hidden="true"
                />
              ) : null}

              {item.link_url ? (
                <a
                  href={item.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ borderColor: theme.dark ? "#334155" : undefined, background: theme.dark ? "#0f172a" : undefined, color: theme.dark ? "#94a3b8" : undefined }}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[0.7rem] font-black text-slate-700 transition hover:border-slate-300 hover:bg-white"
                >
                  <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" aria-hidden="true">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {item.link_label || "Open document"}
                </a>
              ) : null}

              {timeLabel ? (
                <div className="mt-2 flex items-center justify-end gap-1">
                  <span style={{ fontSize: "0.58rem", color: isUser ? theme.tsUser : theme.tsAgent }}>
                    {timeLabel}
                  </span>
                  {isUser && (
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" aria-hidden="true" style={{ color: theme.tickColor }}>
                      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              ) : null}
            </div>
          );

          const avatar = (
            <div
              className="mt-0.5 shrink-0 overflow-hidden rounded-full flex items-center justify-center font-black"
              style={{
                width: compact ? 30 : 36,
                height: compact ? 30 : 36,
                fontSize: compact ? "0.62rem" : "0.72rem",
                background: avatarBg,
                color: avatarColor,
                boxShadow: "0 1px 4px -1px rgba(15,23,42,0.18)",
                transition: "background 0.3s",
              }}
            >
              {avatarImageUrl ? (
                <img src={avatarImageUrl} alt="" className="h-full w-full object-cover" />
              ) : avatarLetter}
            </div>
          );

          return (
            <article
              key={`${item.role}-${index}`}
              className={`chatbox-message-in flex items-start gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
            >
              {avatar}
              <div
                style={{ maxWidth: compact ? "90%" : "78%" }}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <p
                  className="mb-1 font-black uppercase tracking-[0.13em] text-[#f97316]"
                  style={{ fontSize: compact ? "0.55rem" : "0.62rem" }}
                >
                  {displayName}
                </p>
                {bubble}
              </div>
            </article>
          );
        })}

        {/* Dialog message — rendered as a chat bubble inside the feed */}
        {dialogMessage ? (
          <article className="chatbox-message-in flex flex-row items-start gap-3">
            <div
              className="mt-0.5 shrink-0 overflow-hidden rounded-full flex items-center justify-center font-black"
              style={{
                width: compact ? 30 : 36, height: compact ? 30 : 36,
                fontSize: compact ? "0.62rem" : "0.72rem",
                background: theme.agentAvatarBg, color: theme.agentAvatarColor,
                boxShadow: "0 1px 4px -1px rgba(15,23,42,0.18)",
              }}
            >
              {String(
                dialogMessage.avatar_url ||
                mentorAvatars[avatarLookupKey(dialogMessage.agent)] ||
                mentorAvatars[avatarLookupKey(dialogMessage.agent_key)] ||
                mentorAvatarUrl ||
                ""
              ) ? (
                <img
                  src={String(
                    dialogMessage.avatar_url ||
                    mentorAvatars[avatarLookupKey(dialogMessage.agent)] ||
                    mentorAvatars[avatarLookupKey(dialogMessage.agent_key)] ||
                    mentorAvatarUrl ||
                    ""
                  )}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : String(dialogMessage.agent || "M").slice(0, 1).toUpperCase()}
            </div>
            <div className="flex flex-col items-start" style={{ maxWidth: compact ? "90%" : "78%" }}>
              <p className="mb-1 font-black uppercase tracking-[0.13em] text-[#f97316]" style={{ fontSize: compact ? "0.55rem" : "0.62rem" }}>
                {dialogMessage.agent}
              </p>
              <div
                className={compact ? "rounded-xl px-3 py-2" : "rounded-2xl rounded-tl-sm px-4 py-3"}
                style={{ background: theme.agentBg, border: theme.agentBorder, boxShadow: theme.agentShadow }}
              >
                <MessageContent content={dialogMessage.content} compact={compact} dark={theme.dark} />
                {Array.isArray(dialogMessage.actions) && dialogMessage.actions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {dialogMessage.actions.map((action) => (
                      <button
                        key={action.id || action.label}
                        type="button"
                        onClick={() => onAction?.(dialogMessage, action)}
                        style={action.variant === "primary" ? {
                          padding: "5px 14px", borderRadius: 8, border: "none", fontSize: "0.72rem",
                          fontWeight: 900, cursor: "pointer", color: "white",
                          background: "linear-gradient(135deg,#f97316,#fb923c)",
                          boxShadow: "0 4px 12px -4px rgba(249,115,22,0.5)",
                        } : {
                          padding: "5px 14px", borderRadius: 8, fontSize: "0.72rem",
                          fontWeight: 700, cursor: "pointer",
                          border: `1px solid ${theme.dark ? "#334155" : "#e2e8f0"}`,
                          background: theme.dark ? "#0f172a" : "#f8fafc",
                          color: theme.dark ? "#94a3b8" : "#475569",
                        }}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </article>
        ) : null}

        {/* Loading indicator */}
        {loading ? (
          <article className="chatbox-message-in flex flex-row items-start gap-3">
            {(() => {
              const loadingAvatarUrl = String(
                mentorAvatars[avatarLookupKey(loadingAgentName)] ||
                mentorAvatarUrl ||
                ""
              );
              return (
                <div
                  className="mt-0.5 shrink-0 overflow-hidden rounded-full flex items-center justify-center font-black"
                  style={{
                    width: compact ? 30 : 36,
                    height: compact ? 30 : 36,
                    fontSize: compact ? "0.62rem" : "0.72rem",
                    background: theme.agentAvatarBg,
                    color: theme.agentAvatarColor,
                    boxShadow: "0 1px 4px -1px rgba(15,23,42,0.18)",
                  }}
                >
                  {loadingAvatarUrl ? (
                    <img src={loadingAvatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    String(loadingAgentName || "M").slice(0, 1).toUpperCase()
                  )}
                </div>
              );
            })()}
            <div className="flex flex-col items-start">
              <p className="mb-1 font-black uppercase tracking-[0.13em] text-[#f97316]" style={{ fontSize: compact ? "0.55rem" : "0.62rem" }}>
                {loadingAgentName}
              </p>
              <div
                className={compact ? "rounded-xl px-3 py-2.5" : "rounded-2xl rounded-tl-sm px-4 py-3"}
                style={{ background: theme.agentBg, border: theme.agentBorder, boxShadow: theme.agentShadow }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full" style={{ background: theme.dark ? "#475569" : "#94a3b8" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:120ms]" style={{ background: theme.dark ? "#475569" : "#94a3b8" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:240ms]" style={{ background: theme.dark ? "#475569" : "#94a3b8" }} />
                </div>
              </div>
            </div>
          </article>
        ) : null}
      </div>


      {/* Attachment preview */}
      {attachments.length ? (
        <div className="flex shrink-0 flex-wrap gap-1.5 px-0.5">
          {attachments.map((file, index) => (
            <div
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
              className="flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[0.7rem] shadow-sm"
            >
              <span className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-slate-500">
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" aria-hidden="true">
                  <path d="M8 7.5v8.2a3.2 3.2 0 0 0 6.4 0V6.8a2.2 2.2 0 0 0-4.4 0v8.4a1.1 1.1 0 0 0 2.2 0V8.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="max-w-[9rem] truncate font-semibold text-slate-700">{file.name}</span>
              <button
                type="button"
                onClick={() => removeAttachment(index)}
                className="grid h-4 w-4 place-items-center rounded-full bg-slate-100 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                aria-label={`Remove ${file.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {attachmentError ? (
        <p className="shrink-0 px-1 text-[0.68rem] font-black text-red-600">
          {attachmentError}
        </p>
      ) : null}

      {/* Input */}
      <form className="shrink-0" onSubmit={submit}>
        <div
          className="flex items-end gap-2 rounded-xl px-3 py-2 transition-all"
          style={{ background: theme.inputBg, border: `1.5px solid ${theme.inputBorder}`, transition: "background 0.3s, border-color 0.3s" }}
        >
          <button
            data-tour="tour-upload"
            type="button"
            onClick={openAttachmentPicker}
            disabled={loading || submitting}
            aria-label="Attach documents"
            title={attachmentDisabled ? attachmentDisabledReason : "Attach documents"}
            className={`mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-white transition disabled:cursor-not-allowed disabled:opacity-40 ${
              attachmentDisabled
                ? "border-slate-200 text-slate-400 hover:bg-slate-50"
                : "border-orange-200 text-[#f97316] hover:border-[#f97316] hover:bg-orange-50"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <textarea
            rows={1}
            value={message}
            onChange={(event) => handleMessageChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit(event);
              }
            }}
            placeholder={placeholder}
            className="max-h-[88px] min-h-[26px] flex-1 resize-none bg-transparent py-0.5 text-sm font-medium leading-relaxed outline-none"
            style={{ color: theme.inputText, caretColor: theme.inputText, transition: "color 0.3s" }}
          />

          <div className="mb-0.5 flex shrink-0 items-center gap-2">
            <span className="text-[0.62rem] font-semibold tabular-nums" style={{ color: theme.wordCountColor, transition: "color 0.3s" }}>
              {wordCount}/{MAX_MESSAGE_WORDS}
            </span>
            <button
              type="submit"
              aria-label="Send message"
              disabled={loading || submitting || (!message.trim() && !attachments.length)}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f97316] text-white shadow-[0_4px_10px_-3px_rgba(249,115,22,0.55)] transition hover:bg-[#ea580c] active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:shadow-none"
            >
              {loading ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
              ) : (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                  <path d="M12 19V6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  <path d="M7 10l5-5 5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </form>

      <input
        ref={attachmentInputRef}
        type="file"
        multiple
        accept={ACCEPTED_ATTACHMENT_EXTENSIONS.join(",")}
        className="hidden"
        onChange={handleAttachmentChange}
      />
    </section>
    </>
  );
}

