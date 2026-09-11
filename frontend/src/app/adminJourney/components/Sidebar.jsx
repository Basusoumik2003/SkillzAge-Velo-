"use client";

import {
  FileText,
  Globe2,
  LayoutDashboard,
  Layers,
  ListChecks,
  Rocket,
  Settings,
  Users,
  X
} from "lucide-react";

const NAV_GROUPS = [
  {
    title: "Program Management",
    items: [
      { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { key: "phases", label: "Phases", icon: Layers },
      { key: "stages", label: "Stages", icon: ListChecks }
    ]
  },
  {
    title: "Knowledge Base",
    items: [
      { key: "stage-documents", label: "Stage Documents", icon: FileText },
      { key: "global-sources", label: "Global Sources", icon: Globe2 }
    ]
  },
  {
    title: "AI Mentors",
    items: [{ key: "mentors", label: "Mentors", icon: Users }]
  },
  {
    title: "System",
    items: [{ key: "settings", label: "Settings", icon: Settings }]
  }
];

export default function Sidebar({ activeTab, onSelectTab, counts = {}, open, onClose }) {
  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-6 pt-1">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-orange-600 text-white shadow-[0_10px_24px_-10px_rgba(234,88,12,0.8)]">
          <Rocket className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-black leading-tight text-slate-950">Startup Journey</p>
          <p className="text-xs font-bold text-slate-400">Admin Panel</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="px-3 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{group.title}</p>
            <div className="mt-2 space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.key;
                const count = counts[item.key];

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onSelectTab(item.key)}
                    className={`flex w-full items-center gap-3 rounded-2xl border-l-2 px-3 py-2.5 text-sm font-bold transition-all ${
                      isActive
                        ? "border-l-orange-600 bg-orange-50 text-orange-700 shadow-sm"
                        : "border-l-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-orange-600" : "text-slate-400"}`} />
                    <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                    {typeof count === "number" ? (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black ${
                          isActive ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-slate-200 bg-white lg:block">
        {content}
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/40" onClick={onClose} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-slate-200 bg-white shadow-xl">{content}</aside>
        </div>
      ) : null}
    </>
  );
}
