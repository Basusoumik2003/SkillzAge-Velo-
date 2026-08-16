"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import loaderAnimation from "../../public/loader.json";

export default function DotLottieFullScreenLoader({ label = "Loading..." }) {
  const containerRef = useRef(null);
  const animRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const mount = async () => {
      try {
        const lottie = (await import("lottie-web")).default;
        if (cancelled || !containerRef.current) return;
        animRef.current = lottie.loadAnimation({
          container: containerRef.current,
          renderer: "svg",
          loop: true,
          autoplay: true,
          animationData: loaderAnimation,
          rendererSettings: {
            preserveAspectRatio: "xMidYMid meet"
          }
        });
        setReady(true);
      } catch {
        setReady(false);
      }
    };
    mount();
    return () => {
      cancelled = true;
      try {
        animRef.current?.destroy?.();
      } catch {
        // ignore
      }
      animRef.current = null;
    };
  }, []);

  const messages = useMemo(() => {
    const primary = String(label || "").trim();
    if (primary && primary !== "Loading...") {
      return [
        primary,
        "Syncing the latest details...",
        "Preparing a smooth experience...",
        "Almost there..."
      ];
    }
    return [
      "Loading...",
      "Warming up your workspace...",
      "Fetching your latest updates...",
      "Preparing a smooth experience...",
      "Almost there..."
    ];
  }, [label]);

  useEffect(() => {
    const timer = setInterval(() => setMessageIndex((i) => (i + 1) % messages.length), 2300);
    return () => clearInterval(timer);
  }, [messages.length]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 backdrop-blur-sm"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(15, 23, 42, 0.38)",
        backdropFilter: "blur(8px)"
      }}
    >
      <div
        className="flex flex-col items-center gap-2"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8
        }}
      >
        <div
          ref={containerRef}
          className={ready ? "h-[min(340px,78vw)] w-[min(340px,78vw)]" : "h-[min(320px,76vw)] w-[min(320px,76vw)] animate-pulse rounded-full bg-orange-500/10"}
          style={{
            width: ready ? "min(340px, 78vw)" : "min(320px, 76vw)",
            height: ready ? "min(340px, 78vw)" : "min(320px, 76vw)",
            borderRadius: ready ? 0 : 9999,
            background: ready ? "transparent" : "rgba(249, 115, 22, 0.12)",
            filter: "drop-shadow(0 22px 55px rgba(2,6,23,0.55)) hue-rotate(-22deg) saturate(1.45) brightness(1.05)"
          }}
        />
        <p
          className="max-w-[88vw] px-3 text-center text-sm font-semibold text-white/85"
          style={{
            margin: 0,
            color: "rgba(255, 255, 255, 0.9)",
            fontSize: 14,
            fontWeight: 700,
            fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
          }}
        >
          {messages[messageIndex] || label}
        </p>
      </div>
    </div>
  );
}
