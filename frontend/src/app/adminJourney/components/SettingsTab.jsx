"use client";

import { Settings } from "lucide-react";

import { Panel } from "./ui";

// Honest placeholder — there is no settings API on the backend yet, so this
// intentionally doesn't fabricate toggles that don't do anything.
export default function SettingsTab() {
  return (
    <Panel title="Settings" description="Program-wide configuration." icon={Settings}>
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
        <p className="text-sm font-black text-slate-700">Nothing here yet</p>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          There isn&apos;t a settings API on the backend yet — this tab is a placeholder for whatever gets built
          there next.
        </p>
      </div>
    </Panel>
  );
}
