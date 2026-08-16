"use client";

import { useEffect } from "react";

export const reviewGuidelinesConfig = [
  {
    title: "Code Quality",
    percentage: 20,
    description: "We evaluate readability, naming conventions, modularity, and maintainability.",
    checklist: [
      "Clean and readable code",
      "Meaningful variable/function names",
      "Proper folder structure",
      "Reusable functions/components"
    ],
    icon: "code",
    tone: {
      icon: "bg-violet-50 text-violet-600",
      pill: "bg-violet-50 text-violet-700",
      check: "text-violet-600"
    }
  },
  {
    title: "Architecture & Design",
    percentage: 20,
    description: "Checks software design quality.",
    checklist: ["Separation of concerns", "Scalable architecture", "Reusability", "Proper state/data management"],
    icon: "layers",
    tone: {
      icon: "bg-blue-50 text-blue-600",
      pill: "bg-blue-50 text-blue-700",
      check: "text-blue-600"
    }
  },
  {
    title: "Functionality & Requirements",
    percentage: 25,
    description: "Verifies business requirements implementation.",
    checklist: ["Feature completeness", "Correct logic", "Edge case handling", "Expected behavior"],
    icon: "clipboard",
    tone: {
      icon: "bg-emerald-50 text-emerald-600",
      pill: "bg-emerald-50 text-emerald-700",
      check: "text-emerald-600"
    }
  },
  {
    title: "Error Handling & Stability",
    percentage: 10,
    description: "Measures reliability and robustness.",
    checklist: ["Validation", "Exception handling", "Safe API interactions", "Crash prevention"],
    icon: "shield",
    tone: {
      icon: "bg-orange-50 text-orange-600",
      pill: "bg-orange-50 text-orange-700",
      check: "text-orange-600"
    }
  },
  {
    title: "Performance & Optimization",
    percentage: 10,
    description: "Measures optimization quality.",
    checklist: ["Efficient rendering", "Optimized loops", "API efficiency", "Reduced repetition"],
    icon: "gauge",
    tone: {
      icon: "bg-violet-50 text-violet-600",
      pill: "bg-violet-50 text-violet-700",
      check: "text-violet-600"
    }
  },
  {
    title: "Git & Engineering Practices",
    percentage: 5,
    description: "Evaluates repository hygiene.",
    checklist: ["Meaningful commits", "Clean repository structure", "Proper branch naming"],
    icon: "git",
    tone: {
      icon: "bg-blue-50 text-blue-600",
      pill: "bg-blue-50 text-blue-700",
      check: "text-blue-600"
    }
  },
  {
    title: "Documentation & Readability",
    percentage: 10,
    description: "Measures understandability.",
    checklist: ["Readable code", "Helpful comments", "Documentation clarity"],
    icon: "document",
    tone: {
      icon: "bg-cyan-50 text-cyan-700",
      pill: "bg-cyan-50 text-cyan-700",
      check: "text-cyan-700"
    }
  }
];

const scoringGuide = [
  { range: "90 - 100", label: "Excellent", description: "Outstanding code quality", tone: "bg-emerald-50 text-emerald-700" },
  { range: "75 - 89", label: "Good", description: "Good work with minor improvements", tone: "bg-blue-50 text-blue-700" },
  { range: "50 - 74", label: "Needs Improvement", description: "Several areas need improvement", tone: "bg-orange-50 text-orange-700" },
  { range: "0 - 49", label: "Needs Revision", description: "Major issues to be addressed", tone: "bg-red-50 text-red-700" }
];

const improvementTips = [
  "Improve naming conventions",
  "Handle edge cases",
  "Add proper validation",
  "Reduce repeated code",
  "Improve folder & file structure",
  "Write cleaner, reusable logic",
  "Add meaningful comments",
  "Follow best practices"
];

function ReviewIcon({ type }) {
  const common = "h-6 w-6";

  if (type === "code") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" aria-hidden="true">
        <path d="m8 8-4 4 4 4M16 8l4 4-4 4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "layers") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" aria-hidden="true">
        <path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="m4 12 8 4.5 8-4.5M4 16.5l8 4.5 8-4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "clipboard") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" aria-hidden="true">
        <path d="M9 5h6M9 4.5A2.5 2.5 0 0 1 11.5 2h1A2.5 2.5 0 0 1 15 4.5V7H9V4.5Z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
        <path d="M7 5H5v16h14V5h-2M8 12h8M8 16h5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "shield") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" aria-hidden="true">
        <path d="M12 3 19 6v5c0 4.5-2.8 7.6-7 10-4.2-2.4-7-5.5-7-10V6l7-3Z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
        <path d="m8.8 12 2.1 2.1 4.4-4.6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "gauge") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" aria-hidden="true">
        <path d="M5 18a8 8 0 1 1 14 0" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        <path d="m12 14 4-5M8 18h8" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7.5 11.5 6 10M16.5 11.5 18 10" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "git") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" aria-hidden="true">
        <path d="M7 5v14M17 5v4c0 2.2-1.8 4-4 4H7" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="7" cy="5" r="2.2" stroke="currentColor" strokeWidth="2.1" />
        <circle cx="7" cy="19" r="2.2" stroke="currentColor" strokeWidth="2.1" />
        <circle cx="17" cy="5" r="2.2" stroke="currentColor" strokeWidth="2.1" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={common} fill="none" aria-hidden="true">
      <path d="M6 3h9l3 3v15H6V3Z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
      <path d="M15 3v4h4M9 12h6M9 16h6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon({ className = "text-emerald-600" }) {
  return (
    <svg viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 ${className}`} fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m7.4 10.2 1.7 1.7 3.6-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7" fill="currentColor" opacity="0.95" />
      <path d="M10 9.2v4.1M10 6.8h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function GuidelinesCard({ item, index }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_14px_38px_-34px_rgba(15,23,42,0.75)]">
      <div className={`grid h-12 w-12 place-items-center rounded-xl ${item.tone.icon}`}>
        <ReviewIcon type={item.icon} />
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <h3 className="text-sm font-black leading-5 text-slate-950">
          {index + 1}. {item.title}
        </h3>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${item.tone.pill}`}>{item.percentage}%</span>
      </div>
      <p className="mt-3 min-h-[42px] text-xs font-semibold leading-5 text-slate-500">{item.description}</p>
      <ul className="mt-4 grid gap-2">
        {item.checklist.map((check) => (
          <li key={check} className="flex items-start gap-2 text-xs font-semibold leading-5 text-slate-700">
            <CheckIcon className={item.tone.check} />
            <span>{check}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function ScoringGuideCard() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_14px_38px_-34px_rgba(15,23,42,0.75)]">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-600">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
            <path d="M5 20V10M12 20V4M19 20v-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </span>
        <h3 className="text-sm font-black text-slate-950">Scoring Guide</h3>
      </div>
      <div className="grid gap-3">
        {scoringGuide.map((item) => (
          <div key={item.range} className="grid gap-2 text-xs font-bold sm:grid-cols-[90px_110px_1fr] sm:items-center">
            <span className={`w-fit rounded-full px-3 py-1 ${item.tone}`}>{item.range}</span>
            <span className={item.tone.replace("bg-", "text-").replace("-50", "-700")}>{item.label}</span>
            <span className="text-slate-500">{item.description}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ImprovementTipsCard() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_14px_38px_-34px_rgba(15,23,42,0.75)]">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-amber-50 text-amber-500">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
            <path d="M9 18h6M10 22h4" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
            <path d="M8 14a6 6 0 1 1 8 0c-.7.6-1 1.3-1 2H9c0-.7-.3-1.4-1-2Z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
          </svg>
        </span>
        <h3 className="text-sm font-black text-slate-950">How to Improve Your Score</h3>
      </div>
      <ul className="grid gap-3 text-xs font-semibold text-slate-700 sm:grid-cols-2">
        {improvementTips.map((tip) => (
          <li key={tip} className="flex items-start gap-2">
            <CheckIcon className="text-emerald-600" />
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ReviewGuidelinesModal({ open, onClose, guidelines = reviewGuidelinesConfig }) {
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  const handleBackdropMouseDown = (event) => {
    if (event.target === event.currentTarget) onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/55 px-3 py-6 backdrop-blur-[2px] animate-fade-up"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <section
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_24px_80px_-34px_rgba(15,23,42,0.8)] animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-guidelines-title"
        aria-describedby="review-guidelines-subtitle"
      >
        <header className="flex items-start justify-between gap-5 border-b border-slate-100 px-5 py-5 sm:px-7">
          <div>
            <h2 id="review-guidelines-title" className="text-2xl font-black leading-tight text-slate-950">
              How We Review Code
            </h2>
            <p id="review-guidelines-subtitle" className="mt-2 text-sm font-semibold text-slate-500">
              Understand how mentor reviews and AI scoring work.
            </p>
          </div>
          <button
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-300"
            onClick={onClose}
            aria-label="Close review guidelines"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-5 sm:px-7">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {guidelines.map((item, index) => (
              <GuidelinesCard key={item.title} item={item} index={index} />
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.05fr]">
            <ScoringGuideCard />
            <ImprovementTipsCard />
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-lg border border-violet-100 bg-violet-50/70 px-4 py-3 text-xs font-semibold text-violet-800">
            <span className="text-violet-600">
              <InfoIcon />
            </span>
            <p>These guidelines ensure your code is production-ready, maintainable, and follows industry best practices.</p>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-6 py-2 text-sm font-black text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-300"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
