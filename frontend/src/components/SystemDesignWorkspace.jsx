"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import { FiDownload, FiRefreshCcw, FiSave } from "react-icons/fi";

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((mod) => mod.Excalidraw),
  { ssr: false }
);

const DRAFT_STORAGE_KEY = "internlabs_system_design_draft_v1";

function sanitizeAppStateForSave(appState) {
  if (!appState) return {};
  // Excalidraw keeps collaborators as a Map; avoid persisting non-JSON-safe values.
  const { collaborators, ...rest } = appState;
  return rest;
}

function sanitizeAppStateForLoad(appState) {
  return {
    ...(appState || {}),
    collaborators: new Map(),
  };
}

export default function SystemDesignWorkspace() {
  const excalidrawApiRef = useRef(null);
  const latestSceneRef = useRef({ elements: [], appState: null, files: {} });
  const [banner, setBanner] = useState("");

  const initialData = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return {
        elements: parsed.elements || [],
        appState: sanitizeAppStateForLoad(parsed.appState),
        files: parsed.files || {},
      };
    } catch {
      return null;
    }
  }, []);

  const saveDraft = () => {
    try {
      const { elements, appState, files } = latestSceneRef.current;
      localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          elements: elements || [],
          appState: sanitizeAppStateForSave(appState),
          files: files || {},
        })
      );
      setBanner("Draft saved successfully.");
    } catch {
      setBanner("Could not save draft locally.");
    }
  };

  const clearCanvas = () => {
    excalidrawApiRef.current?.updateScene({ elements: [] });
    latestSceneRef.current = { ...latestSceneRef.current, elements: [] };
    setBanner("Canvas cleared.");
  };

  const exportPngBlob = async () => {
    const scene = latestSceneRef.current;
    const pkg = await import("@excalidraw/excalidraw");
    return pkg.exportToBlob({
      elements: scene.elements || [],
      appState: {
        ...(scene.appState || {}),
        exportWithDarkMode: false,
      },
      files: scene.files || {},
      mimeType: "image/png",
      quality: 1,
    });
  };

  const downloadPng = async () => {
    try {
      const blob = await exportPngBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `system-design-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      setBanner("PNG downloaded.");
    } catch {
      setBanner("Could not export PNG. Please try again.");
    }
  };

  const actionClass =
    "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.65)] transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <section className="flex h-full min-h-[720px] min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="shrink-0 border-b border-slate-200 px-6 py-5">
        <div className="min-w-0">
          <h2 className="text-2xl font-black leading-tight text-slate-950 md:text-[1.7rem]">System Design Workspace</h2>
          <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-slate-600">
            Create architecture diagrams, workflows, database schemas, and technical designs for your internship tasks.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <button onClick={saveDraft} className={actionClass}>
            <FiSave className="h-4 w-4" />
            Save Draft
          </button>
          <button onClick={clearCanvas} className={actionClass}>
            <FiRefreshCcw className="h-4 w-4" />
            Clear Canvas
          </button>
          <button onClick={downloadPng} className={actionClass}>
            <FiDownload className="h-4 w-4" />
            Download PNG
          </button>
        </div>

        {banner ? (
          <p className="mt-3 inline-flex rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">
            {banner}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 bg-white p-6 pt-5">
        <div className="system-design-editor relative h-full min-h-[560px] min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_22px_54px_-44px_rgba(15,23,42,0.6)]">
          <Excalidraw
            initialData={initialData}
            excalidrawAPI={(api) => {
              excalidrawApiRef.current = api;
            }}
            onChange={(elements, appState, files) => {
              latestSceneRef.current = { elements, appState, files };
            }}
            UIOptions={{
              canvasActions: {
                loadScene: false,
                saveToActiveFile: false,
              },
            }}
          />
        </div>
      </div>
    </section>
  );
}
