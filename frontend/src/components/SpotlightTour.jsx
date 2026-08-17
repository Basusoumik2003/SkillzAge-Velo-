"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const PAD = 12;
const CARD_WIDTH = 370;
const CARD_GAP = 24;
const MIN_SPACE = 300; // minimum px above/below before we try sides
const TOUR_MASCOTS = {
  left: "/left.svg",
  right: "/right.svg",
  top: "/top.svg",
};
const TOUR_MASCOT_SEQUENCE = [
  "top",
  "right",
  "left",
  "left",
  "right",
  "left",
  "right",
  "left",
  "right",
  "top",
  "top",
];

const STEPS = [
  {
    target: null,
    icon: "Hi",
    title: "Welcome to your Workspace!",
    body: "This is your internship command centre - tasks, mentor chat, document submissions, code reviews, and timelines all in one place.\n\nThis 60-second tour walks you through every part so you can hit the ground running.",
  },
  {
    target: "tour-phases",
    icon: "01",
    title: "Project Phases",
    body: "Your project is split into phases, each with multiple stages, listed here on the left. Phases unlock in order - complete the current one to unlock the next.\n\nEach phase also shows a timeline badge, such as Week 1-2, so you always know your expected deadline at a glance.",
  },
  {
    target: "tour-progress",
    icon: "02",
    title: "Your Live Progress",
    body: "This badge shows your active phase, current stage name, and overall completion percentage - updated instantly every time you finish a stage.",
  },
  {
    target: "tour-timeline",
    icon: "03",
    title: "Phase Timeline",
    body: "This top-right badge shows the expected timeline for your current phase, so you can quickly check how much time is planned before moving to the next phase.",
  },
  {
    target: "tour-tabs",
    icon: "04",
    title: "Centre Panel Tabs",
    body: "Use this area to switch between the workspace views you need while working.\n\nThe active tab stays highlighted so you always know where you are.",
  },
  {
    target: "tour-agent",
    icon: "05",
    title: "Your Stage Mentor",
    body: "This shows your assigned mentor for the current stage. Click to open the chat - ask questions, get feedback, or get unstuck.\n\nOther team agents appear as small avatars beside it. Click any of them to chat too.",
  },
  {
    target: "tour-chat",
    icon: "06",
    title: "Stage Chat",
    body: "Your mentor greets you here when you open a stage, explains the task, and guides you through it. Type at the bottom and press Enter or the orange arrow to send.\n\nIf the admin uploaded a demo document for this stage, your mentor will offer to share it here too.",
  },
  {
    target: "tour-theme",
    icon: "07",
    title: "Personalise Your Chat Theme",
    body: "Click the paint palette icon in the chat header to change the colour theme of your entire chat area - background, bubbles, and input all update together.\n\n8 themes to choose from: Snow, Lavender, Ocean, Emerald, Rose, Amber, Slate Pro, and Midnight.\n\nYour choice is saved and remembered each visit.",
  },
  {
    target: "tour-upload",
    icon: "08",
    title: "Document Upload",
    body: "This is your file attachment button. When a stage requires you to submit your work, click it to pick a file from your device and upload it.\n\nYour mentor reviews it automatically and posts feedback right here in the chat.\n\nPasses -> stage auto-completes and the next stage unlocks. Fails -> fix the work and submit the revised file using the same attachment button.",
  },
  {
    target: "tour-actions",
    icon: "09",
    title: "Status Bar & Navigation",
    body: "This bar shows your stage status: Working -> Review Pending -> Needs Revision -> Completed.\n\nFor stages with no document, a Completed button appears here. Use Back / Next to move between stages - Next only activates once the current stage is done.",
  },
  {
    target: null,
    icon: "OK",
    title: "You are all set!",
    body: "Your routine: pick a phase -> read the brief in chat -> do the work -> upload or click Completed -> mentor reviews -> next stage unlocks.\n\nIf you ever get stuck, just message your stage mentor. Good luck!",
  },
];
function useSpotRect(targetKey) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!targetKey) { setRect(null); return; }

    function measure() {
      const el = document.querySelector(`[data-tour="${targetKey}"]`);
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect({
        top: r.top - PAD,
        left: r.left - PAD,
        width: r.width + PAD * 2,
        height: r.height + PAD * 2,
        bottom: r.bottom + PAD,
        right: r.right + PAD,
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
      });
    }

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [targetKey]);

  return rect;
}

function getMascotStyle(position) {
  const base = {
    position: "absolute",
    width: 190,
    height: "auto",
    zIndex: 5,
    pointerEvents: "none",
    filter: "drop-shadow(0 16px 22px rgba(15,23,42,0.18))",
  };
  if (position === "left") {
    return { ...base, left: -158, top: 10 };
  }
  if (position === "right") {
    return { ...base, right: -158, top: 10 };
  }
  return { ...base, width: 178, left: "50%", top: -154, transform: "translateX(-50%)" };
}

function getCardPlacement(spotRect) {
  if (!spotRect) {
    return { position: "center", top: null, bottom: null, left: null, arrowDir: null };
  }

  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const spaceBelow = vh - spotRect.bottom;
  const spaceAbove = spotRect.top;
  const spaceRight = vw - spotRect.right;
  const spaceLeft = spotRect.left;

  // Try below
  if (spaceBelow >= MIN_SPACE) {
    const left = Math.max(12, Math.min(vw - CARD_WIDTH - 12, spotRect.cx - CARD_WIDTH / 2));
    return { position: "below", top: spotRect.bottom + CARD_GAP, bottom: null, left, arrowDir: "up" };
  }
  // Try above
  if (spaceAbove >= MIN_SPACE) {
    const left = Math.max(12, Math.min(vw - CARD_WIDTH - 12, spotRect.cx - CARD_WIDTH / 2));
    return { position: "above", top: null, bottom: vh - spotRect.top + CARD_GAP, left, arrowDir: "down" };
  }
  // Try right side
  if (spaceRight >= CARD_WIDTH + 24) {
    const top = Math.max(12, Math.min(vh - 420, spotRect.cy - 180));
    return { position: "right", top, bottom: null, left: spotRect.right + CARD_GAP, arrowDir: null };
  }
  // Try left side
  if (spaceLeft >= CARD_WIDTH + 24) {
    const top = Math.max(12, Math.min(vh - 420, spotRect.cy - 180));
    return { position: "left", top, bottom: null, left: spotRect.left - CARD_WIDTH - CARD_GAP, arrowDir: null };
  }
  // Fallback: centre-screen offset away from spotlight
  const topHalf = spotRect.cy < vh / 2;
  return {
    position: "fallback",
    top: topHalf ? Math.min(vh - 420, spotRect.bottom + 20) : Math.max(12, spotRect.top - 320),
    bottom: null,
    left: Math.max(12, Math.min(vw - CARD_WIDTH - 12, vw / 2 - CARD_WIDTH / 2)),
    arrowDir: null,
  };
}

export default function SpotlightTour({ onComplete }) {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState("enter"); // "enter" | "idle" | "exit"
  const [mounted, setMounted] = useState(false);

  const current = STEPS[step];
  const mascotPosition = TOUR_MASCOT_SEQUENCE[step] || "top";
  const mascotSrc = TOUR_MASCOTS[mascotPosition] || TOUR_MASCOTS.top;
  const spotRect = useSpotRect(current?.target);
  const isLast = step === STEPS.length - 1;
  const total = STEPS.length;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    Object.values(TOUR_MASCOTS).forEach((src) => {
      const image = new window.Image();
      image.decoding = "async";
      image.src = src;
    });
  }, []);

  // Animate: fade out → change step → fade in
  function goTo(nextStep) {
    setPhase("exit");
    setTimeout(() => {
      setStep(nextStep);
      setPhase("enter");
      setTimeout(() => setPhase("idle"), 420);
    }, 300);
  }

  function advance() {
    if (isLast) { onComplete(); return; }
    goTo(step + 1);
  }
  function goBack() {
    if (step === 0) return;
    goTo(step - 1);
  }

  useEffect(() => {
    // Initial entrance
    const t = setTimeout(() => setPhase("idle"), 420);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onComplete();
      if (e.key === "ArrowRight") advance();
      if (e.key === "ArrowLeft") goBack();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!mounted) return null;

  const placement = getCardPlacement(spotRect);
  const isIdle = phase === "idle";

  const cardStyle = {
    position: "fixed",
    width: CARD_WIDTH,
    zIndex: 9995,
    opacity: isIdle ? 1 : 0,
    transform: isIdle ? "translateY(0) scale(1)" : "translateY(10px) scale(0.98)",
    transition: "opacity 0.38s cubic-bezier(0.4,0,0.2,1), transform 0.38s cubic-bezier(0.4,0,0.2,1)",
    ...(placement.position === "center"
      ? { top: "50%", left: "50%", transform: isIdle ? "translate(-50%,-50%) scale(1)" : "translate(-50%,-50%) scale(0.97)" }
      : {
          ...(placement.top !== null ? { top: placement.top } : {}),
          ...(placement.bottom !== null ? { bottom: placement.bottom } : {}),
          left: placement.left,
        }),
  };

  const ringStyle = spotRect ? {
    position: "fixed",
    top: spotRect.top,
    left: spotRect.left,
    width: spotRect.width,
    height: spotRect.height,
    borderRadius: 12,
    border: "2.5px solid rgba(249,115,22,0.95)",
    boxShadow: "0 0 0 5px rgba(249,115,22,0.18), 0 0 36px 8px rgba(249,115,22,0.14)",
    pointerEvents: "none",
    zIndex: 9992,
    transition: "top 0.45s cubic-bezier(0.4,0,0.2,1), left 0.45s cubic-bezier(0.4,0,0.2,1), width 0.45s cubic-bezier(0.4,0,0.2,1), height 0.45s cubic-bezier(0.4,0,0.2,1)",
  } : null;

  // Arrow offsets
  const arrowOffset = spotRect && placement.left !== null
    ? Math.min(CARD_WIDTH - 32, Math.max(20, spotRect.cx - placement.left - 8))
    : CARD_WIDTH / 2 - 8;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current?.title || "Workspace tour"}
      style={{ position: "fixed", inset: 0, zIndex: 9990 }}
    >
      {/* Dimmed overlay with spotlight cutout */}
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        aria-hidden="true"
      >
        <defs>
          <mask id="ws-tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spotRect ? (
              <rect
                x={spotRect.left} y={spotRect.top}
                width={spotRect.width} height={spotRect.height}
                rx={12} fill="black"
              />
            ) : null}
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%"
          fill="rgba(6,6,10,0.75)"
          mask="url(#ws-tour-mask)"
          style={{ transition: "opacity 0.4s" }}
        />
      </svg>

      {/* Click backdrop to skip */}
      <div
        style={{ position: "absolute", inset: 0, zIndex: 9991 }}
        onClick={onComplete}
        aria-hidden="true"
      />

      {/* Orange spotlight ring */}
      {spotRect ? <div aria-hidden="true" style={ringStyle} /> : null}

      {/* Tour card */}
      <div onClick={(e) => e.stopPropagation()} style={cardStyle}>
        {Object.entries(TOUR_MASCOTS).map(([position, src]) => (
          <img
            key={position}
            src={src}
            alt=""
            aria-hidden="true"
            loading="eager"
            decoding="async"
            style={{
              ...getMascotStyle(position),
              opacity: mascotPosition === position ? 1 : 0,
              transition: "opacity 0.18s ease",
            }}
          />
        ))}

        {/* Arrow up (card below spotlight) */}
        {spotRect && placement.arrowDir === "up" ? (
          <div aria-hidden="true" style={{
            position: "absolute", top: -9, left: arrowOffset,
            width: 0, height: 0,
            borderLeft: "9px solid transparent",
            borderRight: "9px solid transparent",
            borderBottom: "9px solid #fff7ed",
            filter: "drop-shadow(0 -3px 3px rgba(249,115,22,0.18))",
          }} />
        ) : null}

        {/* Arrow down (card above spotlight) */}
        {spotRect && placement.arrowDir === "down" ? (
          <div aria-hidden="true" style={{
            position: "absolute", bottom: -9, left: arrowOffset,
            width: 0, height: 0,
            borderLeft: "9px solid transparent",
            borderRight: "9px solid transparent",
            borderTop: "9px solid white",
            filter: "drop-shadow(0 3px 3px rgba(0,0,0,0.08))",
          }} />
        ) : null}

        {/* Card */}
        <div style={{
          borderRadius: 20,
          overflow: "hidden",
          position: "relative",
          zIndex: 1,
          background: "white",
          border: "1.5px solid rgba(249,115,22,0.25)",
          boxShadow: "0 32px 64px -20px rgba(15,23,42,0.6), 0 0 0 1px rgba(249,115,22,0.08)",
        }}>
          {/* Header gradient */}
          <div style={{
            background: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)",
            borderBottom: "1px solid rgba(249,115,22,0.15)",
            padding: "16px 20px 14px",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}>
            {/* Icon bubble */}
            <div style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              background: "linear-gradient(135deg, #f97316, #fb923c)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.25rem",
              boxShadow: "0 4px 12px -4px rgba(249,115,22,0.55)",
            }}>
              {current?.icon}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              {/* Step label */}
              <p style={{
                fontSize: "0.58rem", fontWeight: 900,
                textTransform: "uppercase", letterSpacing: "0.2em",
                color: "#ea580c", margin: "0 0 3px",
              }}>
                {`Step ${step + 1} of ${total}`}
              </p>
              {/* Title */}
              <h2 style={{
                fontSize: "0.98rem", fontWeight: 900,
                lineHeight: 1.25, color: "#1e293b", margin: 0,
              }}>
                {current?.title}
              </h2>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: "16px 20px 0", maxHeight: 260, overflowY: "auto" }}>
            {(current?.body || "").split("\n\n").map((para, i) => (
              <p key={i} style={{
                fontSize: "0.78rem", fontWeight: 500,
                lineHeight: 1.7, color: "#475569",
                margin: i === 0 ? 0 : "9px 0 0",
              }}>
                {para}
              </p>
            ))}
          </div>

          {/* Progress bar + nav */}
          <div style={{ padding: "14px 20px 16px" }}>
            {/* Progress dots */}
            <div style={{ display: "flex", gap: 5, marginBottom: 14, alignItems: "center" }}>
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-label={`Go to step ${i + 1}`}
                  style={{
                    height: 5, width: i === step ? 24 : 5,
                    borderRadius: 99,
                    background: i === step ? "#f97316" : i < step ? "#fdba74" : "#e2e8f0",
                    border: "none", cursor: "pointer", padding: 0, flexShrink: 0,
                    transition: "width 0.3s ease, background 0.3s ease",
                  }}
                />
              ))}
            </div>

            {/* Nav row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <button
                type="button"
                onClick={onComplete}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: "0.7rem", fontWeight: 600, color: "#94a3b8", padding: "4px 0",
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#64748b"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#94a3b8"; }}
              >
                Skip tour
              </button>

              <div style={{ display: "flex", gap: 8 }}>
                {step > 0 ? (
                  <button
                    type="button"
                    onClick={goBack}
                    style={{
                      height: 34, padding: "0 16px", borderRadius: 10,
                      border: "1.5px solid #e2e8f0", background: "white",
                      cursor: "pointer", fontSize: "0.75rem", fontWeight: 800,
                      color: "#334155", transition: "background 0.18s, border-color 0.18s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#e2e8f0"; }}
                  >
                    ← Back
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={advance}
                  style={{
                    height: 34, padding: "0 20px", borderRadius: 10,
                    border: "none",
                    background: "linear-gradient(135deg, #f97316, #fb923c)",
                    cursor: "pointer", fontSize: "0.75rem", fontWeight: 900,
                    color: "white",
                    boxShadow: "0 4px 16px -4px rgba(249,115,22,0.7)",
                    transition: "opacity 0.18s, transform 0.12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.9"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.95)"; }}
                  onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                >
                  {isLast ? "Get started! 🚀" : "Next →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
