"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const QUICK_STEPS = [
  {
    emoji: "🗂️",
    color: "#6366f1",
    bg: "linear-gradient(135deg,#eef2ff,#e0e7ff)",
    border: "rgba(99,102,241,0.2)",
    title: "Pick your phase",
    desc: "Open a phase from the left sidebar and select a stage to begin working on it.",
  },
  {
    emoji: "💬",
    color: "#f97316",
    bg: "linear-gradient(135deg,#fff7ed,#ffedd5)",
    border: "rgba(249,115,22,0.2)",
    title: "Chat with your mentor",
    desc: "Your AI mentor greets you in chat, explains the task and guides you through every step.",
  },
  {
    emoji: "📄",
    color: "#10b981",
    bg: "linear-gradient(135deg,#f0fdf4,#dcfce7)",
    border: "rgba(16,185,129,0.2)",
    title: "Submit & get reviewed",
    desc: "Upload your work when the stage requires it. Your mentor reviews it and unlocks the next stage.",
  },
];

const DEMO_QUICK_STEPS = [
  {
    emoji: "🗂️",
    color: "#6366f1",
    bg: "linear-gradient(135deg,#eef2ff,#e0e7ff)",
    border: "rgba(99,102,241,0.2)",
    title: "Explore the trial flow",
    desc: "Open the first phase and see how a guided project is structured before you unlock internship projects.",
  },
  {
    emoji: "💬",
    color: "#f97316",
    bg: "linear-gradient(135deg,#fff7ed,#ffedd5)",
    border: "rgba(249,115,22,0.2)",
    title: "Try mentor guidance",
    desc: "Ask the trial mentor questions, review the stage context, and learn how the workspace support feels.",
  },
  {
    emoji: "📄",
    color: "#10b981",
    bg: "linear-gradient(135deg,#f0fdf4,#dcfce7)",
    border: "rgba(16,185,129,0.2)",
    title: "Practice a submission",
    desc: "Use the trial task to understand submissions and reviews. This is practice only, not internship work.",
  },
];

const CONFETTI = [
  { top: "12%", left: "8%",  size: 10, color: "#f97316", delay: 0 },
  { top: "25%", left: "88%", size: 7,  color: "#6366f1", delay: 0.3 },
  { top: "60%", left: "5%",  size: 6,  color: "#10b981", delay: 0.6 },
  { top: "70%", left: "92%", size: 8,  color: "#f97316", delay: 0.2 },
  { top: "40%", left: "78%", size: 5,  color: "#a78bfa", delay: 0.5 },
  { top: "80%", left: "15%", size: 7,  color: "#34d399", delay: 0.1 },
  { top: "15%", left: "55%", size: 5,  color: "#fb923c", delay: 0.4 },
  { top: "85%", left: "60%", size: 6,  color: "#818cf8", delay: 0.7 },
];

export default function WelcomeModal({ userName = "there", isDemoProject = false, onClose }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
    const t = setTimeout(() => setVisible(true), 40);
    return () => clearTimeout(t);
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 380);
  }

  if (!mounted) return null;

  const firstName = String(userName || "there").split(" ")[0];
  const quickSteps = isDemoProject ? DEMO_QUICK_STEPS : QUICK_STEPS;
  const eyebrow = isDemoProject ? "Trial workspace ready" : "Welcome aboard";
  const intro = isDemoProject
    ? "Your trial workspace is ready. You have seen the tour, so now you can try the guided flow without starting a real internship project."
    : "Your internship workspace is live and ready. You've seen the tour — now here's your quick-start checklist to dive right in.";
  const buttonLabel = isDemoProject ? "Start Trial Walkthrough" : "Let's Begin My Internship";
  const footerText = isDemoProject
    ? "Practice here first, then unlock real internship projects when you are ready"
    : "🌟 Your journey to becoming a professional starts now";

  return createPortal(
    <>
      <style>{`
        @keyframes floatDot {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.55; }
          50%       { transform: translateY(-8px) scale(1.15); opacity: 0.9; }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes welcomePop {
          0%   { transform: scale(0.82) translateY(28px); opacity: 0; }
          60%  { transform: scale(1.02) translateY(-4px); opacity: 1; }
          100% { transform: scale(1)    translateY(0);    opacity: 1; }
        }
      `}</style>

      <div
        style={{
          position: "fixed", inset: 0, zIndex: 999999,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20,
          background: "rgba(6,6,10,0.88)",
          backdropFilter: "blur(8px)",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.4s",
        }}
        onClick={handleClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%", maxWidth: 500,
            borderRadius: 28,
            overflow: "hidden",
            background: "white",
            boxShadow:
              "0 70px 140px -40px rgba(15,23,42,0.75), 0 0 0 1.5px rgba(249,115,22,0.18)",
            animation: visible ? "welcomePop 0.55s cubic-bezier(0.34,1.4,0.64,1) both" : "none",
          }}
        >
          {/* ── Header ───────────────────────────────────────────── */}
          <div
            style={{
              background: "linear-gradient(135deg,#1a1311 0%,#2c1a0d 55%,#1a1311 100%)",
              padding: "34px 28px 30px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Floating confetti dots */}
            {CONFETTI.map((d, i) => (
              <span
                key={i}
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: d.top, left: d.left,
                  width: d.size, height: d.size,
                  borderRadius: "50%",
                  background: d.color,
                  opacity: 0.55,
                  animation: `floatDot ${2.4 + i * 0.3}s ease-in-out ${d.delay}s infinite`,
                  pointerEvents: "none",
                }}
              />
            ))}

            {/* Glow blob */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute", bottom: -40, right: -40,
                width: 180, height: 180,
                borderRadius: "50%",
                background: "radial-gradient(circle,rgba(249,115,22,0.25) 0%,transparent 70%)",
                pointerEvents: "none",
              }}
            />

            {/* Icon */}
            <div
              style={{
                width: 62, height: 62, borderRadius: 18, marginBottom: 18, flexShrink: 0,
                background: "linear-gradient(135deg,#f97316,#fb923c)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "2rem",
                boxShadow: "0 10px 30px -10px rgba(249,115,22,0.75)",
                position: "relative",
              }}
            >
              🚀
            </div>

            <p
              style={{
                fontSize: "0.6rem", fontWeight: 900,
                textTransform: "uppercase", letterSpacing: "0.22em",
                color: "#f97316", margin: "0 0 7px",
              }}
            >
              {eyebrow}
            </p>

            <h1
              style={{
                fontSize: "1.75rem", fontWeight: 900, lineHeight: 1.18,
                margin: "0 0 10px",
                background: "linear-gradient(90deg,#ffffff 0%,#fed7aa 60%,#ffffff 100%)",
                backgroundSize: "200% auto",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                animation: "shimmer 3.5s linear infinite",
              }}
            >
              Hey {firstName}! 👋
            </h1>

            <p
              style={{
                fontSize: "0.83rem", fontWeight: 500, lineHeight: 1.65,
                color: "rgba(255,255,255,0.6)", margin: 0,
                maxWidth: 380,
              }}
            >
              {intro}
            </p>
          </div>

          {/* ── Quick-start steps ────────────────────────────────── */}
          <div style={{ padding: "22px 28px 6px" }}>
            {quickSteps.map((s, i) => (
              <div
                key={i}
                style={{
                  display: "flex", gap: 14, alignItems: "flex-start",
                  padding: "14px 0",
                  borderBottom: i < quickSteps.length - 1 ? "1px solid #f1f5f9" : "none",
                }}
              >
                {/* Icon bubble */}
                <div
                  style={{
                    width: 42, height: 42, borderRadius: 13, flexShrink: 0,
                    background: s.bg,
                    border: `1.5px solid ${s.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "1.25rem",
                  }}
                >
                  {s.emoji}
                </div>

                {/* Text */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                    <span
                      style={{
                        width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                        background: s.color,
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.6rem", fontWeight: 900, color: "white",
                      }}
                    >
                      {i + 1}
                    </span>
                    <p style={{ fontSize: "0.85rem", fontWeight: 900, color: "#1e293b", margin: 0 }}>
                      {s.title}
                    </p>
                  </div>
                  <p style={{ fontSize: "0.74rem", fontWeight: 500, color: "#64748b", margin: 0, lineHeight: 1.65 }}>
                    {s.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Footer ───────────────────────────────────────────── */}
          <div style={{ padding: "18px 28px 26px" }}>
            <button
              type="button"
              onClick={handleClose}
              style={{
                width: "100%", height: 52, borderRadius: 15, border: "none",
                background: "linear-gradient(135deg,#f97316 0%,#fb923c 100%)",
                color: "white", fontSize: "0.95rem", fontWeight: 900,
                cursor: "pointer", letterSpacing: "0.02em",
                boxShadow: "0 10px 30px -10px rgba(249,115,22,0.7)",
                transition: "transform 0.15s, box-shadow 0.15s",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.02)";
                e.currentTarget.style.boxShadow = "0 14px 36px -12px rgba(249,115,22,0.85)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "0 10px 30px -10px rgba(249,115,22,0.7)";
              }}
              onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.97)"; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1.02)"; }}
            >
              {buttonLabel}
              <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }} fill="none" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <p
              style={{
                textAlign: "center", margin: "12px 0 0",
                fontSize: "0.67rem", fontWeight: 600, color: "#94a3b8",
                letterSpacing: "0.02em",
              }}
            >
              {footerText}
            </p>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
