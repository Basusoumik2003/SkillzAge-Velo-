"use client";

import { useState } from "react";
import { AlertTriangle, Bell, LogOut, Menu, Search } from "lucide-react";

const TAB_TITLES = {
  dashboard: "Dashboard",
  journeys: "Journeys",
  phases: "Phases",
  stages: "Stages",
  "stage-documents": "Stage Documents",
  "global-sources": "Global Sources",
  mentors: "Mentors",
  settings: "Settings"
};

const TAB_SEARCH_PLACEHOLDER = {
  journeys: "Search journeys...",
  phases: "Search phases...",
  stages: "Search stages...",
  "stage-documents": "Search stage documents...",
  "global-sources": "Search global sources..."
};

export default function TopBar({ activeTab, onOpenSidebar, searchQuery, onSearchChange, attentionItems = [], onLogout }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const searchable = Boolean(TAB_SEARCH_PLACEHOLDER[activeTab]);

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-4 shadow-sm backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onOpenSidebar}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <h1 className="shrink-0 text-lg font-black text-slate-950 sm:text-xl">{TAB_TITLES[activeTab] || "Dashboard"}</h1>

      <div className="ml-2 hidden flex-1 md:block">
        {searchable ? (
          <label className="flex max-w-sm items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-500 focus-within:border-orange-300 focus-within:bg-white">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={TAB_SEARCH_PLACEHOLDER[activeTab]}
              className="w-full bg-transparent outline-none placeholder:text-slate-400"
            />
            <kbd className="hidden shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-black text-slate-400 lg:inline-block">
              Ctrl+K
            </kbd>
          </label>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((open) => !open)}
            aria-haspopup="true"
            aria-expanded={notifOpen}
            className="relative grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
          >
            <Bell className="h-5 w-5" />
            {attentionItems.length ? (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white">
                {attentionItems.length}
              </span>
            ) : null}
          </button>

          {notifOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                <p className="px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-400">
                  Needs attention
                </p>
                {attentionItems.length ? (
                  <ul className="max-h-72 space-y-1 overflow-y-auto">
                    {attentionItems.map((item, index) => (
                      <li key={index} className="flex items-start gap-2.5 rounded-xl px-3 py-2 hover:bg-slate-50">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-800">{item.title}</p>
                          <p className="text-xs font-semibold text-slate-400">{item.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-3 py-4 text-center text-sm font-semibold text-slate-400">All caught up.</p>
                )}
              </div>
            </>
          ) : null}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            aria-haspopup="true"
            aria-expanded={profileOpen}
            className="flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white pl-1 pr-3 text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-950 text-xs font-black text-white">AD</span>
            <span className="hidden text-sm font-bold text-slate-700 sm:inline">Admin</span>
          </button>

          {profileOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-2 w-44 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onLogout?.();
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-rose-600 transition hover:bg-rose-50"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
