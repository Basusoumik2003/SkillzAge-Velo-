"use client";

import { useMemo } from "react";
import { FileText, Flag, Globe2, Layers, ListChecks, Users } from "lucide-react";

import { DonutChart, EmptyState, Panel, StatTile } from "./ui";

function timeAgo(value) {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function recentOf(list, dateKey = "updated_at", limit = 5) {
  return [...(list || [])]
    .sort((a, b) => new Date(b?.[dateKey] || b?.created_at || 0) - new Date(a?.[dateKey] || a?.created_at || 0))
    .slice(0, limit);
}

export default function DashboardTab({
  services,
  serviceStats,
  documents,
  globalSources,
  mentors,
  loading,
  onNavigate,
  onViewJourney
}) {
  const totals = useMemo(() => {
    const stats = Object.values(serviceStats || {});
    return {
      phases: stats.reduce((sum, item) => sum + (item.phaseCount || 0), 0),
      stages: stats.reduce((sum, item) => sum + (item.stageCount || 0), 0),
      activeStages: stats.reduce((sum, item) => sum + (item.activeStageCount || 0), 0)
    };
  }, [serviceStats]);

  const activeServices = services.filter((service) => service.active).length;
  const inactiveServices = services.length - activeServices;

  const recentDocuments = useMemo(() => recentOf(documents), [documents]);
  const recentSources = useMemo(() => recentOf(globalSources), [globalSources]);

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total Services"
          value={services.length}
          detail="Wix services with journeys"
          tone="orange"
          icon={Flag}
        />
        <StatTile
          label="Total Phases"
          value={totals.phases}
          detail="Across every journey"
          tone="blue"
          icon={Layers}
        />
        <StatTile
          label="Total Stages"
          value={totals.stages}
          detail={`${totals.activeStages} currently active`}
          tone="emerald"
          icon={ListChecks}
        />
        <StatTile
          label="Mentors"
          value={mentors.length}
          detail="AI mentor personas"
          tone="purple"
          icon={Users}
        />
        <StatTile
          label="Stage Documents"
          value={documents.length}
          detail="Reference docs on stages"
          tone="teal"
          icon={FileText}
        />
        <StatTile
          label="Global Sources"
          value={globalSources.length}
          detail="Shared across every stage"
          tone="rose"
          icon={Globe2}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Panel title="Services" description="Wix services mapped to startup journeys." icon={Flag}>
          {loading ? (
            <p className="text-sm font-semibold text-slate-500">Loading...</p>
          ) : services.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                    <th className="pb-3 pr-3">Service</th>
                    <th className="pb-3 pr-3">Phases</th>
                    <th className="pb-3 pr-3">Stages</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {services.map((service) => {
                    const stats = serviceStats?.[service.id] || {};
                    return (
                      <tr
                        key={service.id}
                        onClick={() => onViewJourney(service.journeyId)}
                        className="group cursor-pointer transition hover:bg-slate-50"
                      >
                        <td className="border-l-2 border-transparent py-3 pr-3 transition-colors group-hover:border-orange-400">
                          <p className="font-black text-slate-900">{service.serviceName}</p>
                          <p className="text-xs font-semibold text-slate-400">{service.serviceCode}</p>
                        </td>
                        <td className="py-3 pr-3 font-bold text-slate-600">{stats.phaseCount ?? "-"}</td>
                        <td className="py-3 pr-3 font-bold text-slate-600">{stats.stageCount ?? "-"}</td>
                        <td className="py-3">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${
                              service.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {service.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState>No active services are available.</EmptyState>
          )}
        </Panel>

        <Panel title="Service Status" description="Active vs inactive, at a glance." icon={Layers}>
          <DonutChart
            centerLabel="Total"
            centerValue={services.length}
            segments={[
              { label: "Active", value: activeServices, color: "#16a34a" },
              { label: "Inactive", value: inactiveServices, color: "#cbd5e1" }
            ]}
          />

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onNavigate("phases")}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-bold text-slate-700 transition hover:bg-slate-100"
            >
              Manage Phases
            </button>
            <button
              type="button"
              onClick={() => onNavigate("stages")}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-bold text-slate-700 transition hover:bg-slate-100"
            >
              Manage Stages
            </button>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Recent Stage Documents" description="Latest reference docs added to stages." icon={FileText}>
          {recentDocuments.length ? (
            <ul className="divide-y divide-slate-100">
              {recentDocuments.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">{doc.title}</p>
                    <p className="text-xs font-semibold text-slate-400">
                      {doc.phase_name} &middot; {doc.stage_name} &middot; {doc.document_type}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-slate-400">
                    {timeAgo(doc.updated_at || doc.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>No stage documents yet.</EmptyState>
          )}
        </Panel>

        <Panel title="Recent Global Sources" description="Latest knowledge shared across every stage." icon={Globe2}>
          {recentSources.length ? (
            <ul className="divide-y divide-slate-100">
              {recentSources.map((source) => (
                <li key={source.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">{source.title}</p>
                    <p className="text-xs font-semibold text-slate-400">Global &middot; {source.source_type}</p>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-slate-400">
                    {timeAgo(source.updated_at || source.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>No global sources yet.</EmptyState>
          )}
        </Panel>
      </div>
    </div>
  );
}
