"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import WorkspaceEmptyState from "@/components/workspace-v2/WorkspaceEmptyState";

const SOURCE_KINDS = [
  { key: "sources", label: "Sources" },
  { key: "research", label: "Research" },
  { key: "references", label: "References" }
];

function buildPlaceholderSources(topic, kind) {
  const seed = String(topic || "this stage").trim() || "this stage";
  const templates = {
    sources: [
      { domain: "notion.so", title: `${seed} — working notes`, snippet: "Keep a running log of decisions and open questions as you work through this stage." },
      { domain: "figma.com", title: `${seed} reference layout`, snippet: "Visual reference you can duplicate to speed up your first draft." },
      { domain: "docs.google.com", title: `${seed} brief`, snippet: "Shared brief covering scope, stakeholders, and success criteria." }
    ],
    research: [
      { domain: "nngroup.com", title: `Best practices for ${seed}`, snippet: "Industry research and UX guidance relevant to this stage's deliverable." },
      { domain: "hbr.org", title: `How teams approach ${seed}`, snippet: "Case studies and frameworks worth skimming before you start." },
      { domain: "medium.com", title: `Lessons learned: ${seed}`, snippet: "Practitioner write-up with pitfalls to avoid." }
    ],
    references: [
      { domain: "github.com", title: `${seed} example repository`, snippet: "A reference implementation you can study for structure and conventions." },
      { domain: "developer.mozilla.org", title: `${seed} technical reference`, snippet: "Canonical documentation for the concepts used in this stage." },
      { domain: "stackoverflow.com", title: `${seed} — common questions`, snippet: "Frequently asked questions and accepted answers." }
    ]
  };
  return templates[kind] || [];
}

export default function SourcesPanel({ selectedPointData, activeStageData }) {
  const [activeKind, setActiveKind] = useState("sources");
  const [query, setQuery] = useState("");

  const topic = activeStageData?.title || selectedPointData?.title || "";
  const items = useMemo(() => buildPlaceholderSources(topic, activeKind), [topic, activeKind]);
  const filtered = items.filter((item) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return item.title.toLowerCase().includes(q) || item.snippet.toLowerCase().includes(q);
  });

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-border bg-card">
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-secondary">Sources</p>
        <Tabs value={activeKind} onValueChange={setActiveKind}>
          <TabsList className="w-full">
            {SOURCE_KINDS.map((kind) => (
              <TabsTrigger key={kind.key} value={kind.key} className="flex-1 text-[0.7rem]">
                {kind.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="h-8 w-full rounded-lg border border-input bg-background pl-8 pr-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-3">
          {filtered.length ? (
            filtered.map((item, index) => (
              <a
                key={index}
                href={`https://${item.domain}`}
                target="_blank"
                rel="noreferrer"
                className="group flex flex-col gap-1 rounded-xl border border-border bg-background p-3 shadow-sm transition hover:border-primary/30 hover:shadow-md"
              >
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${item.domain}`}
                    alt=""
                    className="h-3.5 w-3.5 rounded-sm"
                  />
                  <span className="truncate text-[0.65rem] font-medium text-muted-foreground">{item.domain}</span>
                  <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                </div>
                <p className="text-xs font-semibold leading-5 text-foreground">{item.title}</p>
                <p className="text-[0.7rem] leading-5 text-secondary line-clamp-2">{item.snippet}</p>
              </a>
            ))
          ) : (
            <WorkspaceEmptyState title="No sources found" description="Try a different search term or switch tabs." />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
