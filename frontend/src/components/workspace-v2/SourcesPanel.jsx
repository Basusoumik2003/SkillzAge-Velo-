"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Globe, Search } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import WorkspaceEmptyState from "@/components/workspace-v2/WorkspaceEmptyState";

const SEARCH_SERVICE_URL =
  process.env.NEXT_PUBLIC_SEARCH_SERVICE_URL || "/api/search";

export default function SourcesPanel({
  selectedPointData,
  activeStageData,
  catalogProject,
  projectName,
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const phaseObjective =
    selectedPointData?.context || selectedPointData?.title || "";

  const stageObjective =
    activeStageData?.objective || activeStageData?.title || "";

  const currentIdea =
    catalogProject?.company_profile_text ||
    catalogProject?.title ||
    projectName ||
    "";

  useEffect(() => {
    // Do not search only when all workspace values are missing.
    if (!phaseObjective && !stageObjective && !currentIdea) {
      setResults([]);
      return undefined;
    }

    const controller = new AbortController();

    async function loadSearchResults() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(SEARCH_SERVICE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phaseObjective,
            stageObjective,
            currentIdea,
          }),
          signal: controller.signal,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to load search results");
        }

        setResults(Array.isArray(data.results) ? data.results : []);
      } catch (searchError) {
        if (searchError.name !== "AbortError") {
          setError(searchError.message);
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadSearchResults();

    return () => controller.abort();
  }, [phaseObjective, stageObjective, currentIdea]);

  const filteredResults = results.filter((result) => {
    const searchText = query.trim().toLowerCase();

    if (!searchText) return true;

    return (
      String(result.title || "").toLowerCase().includes(searchText) ||
      String(result.content || "").toLowerCase().includes(searchText) ||
      String(result.url || "").toLowerCase().includes(searchText)
    );
  });

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <div className="flex flex-col gap-2 border-b border-border bg-gradient-to-b from-primary/5 to-transparent p-3">
        <div className="flex items-center gap-1.5">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Globe className="h-3 w-3" />
          </span>
          <p className="text-xs font-semibold uppercase tracking-wide text-secondary">
            Web Research
          </p>
        </div>

        <p className="text-[0.7rem] leading-5 text-secondary">
          Live sources related to the current phase, stage, and idea.
        </p>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter results"
            className="h-8 w-full rounded-lg border border-input bg-background pl-8 pr-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-3">
          {loading ? (
            <p className="p-3 text-xs text-secondary">
              Searching the web...
            </p>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          {!loading && !error && filteredResults.length > 0
            ? filteredResults.map((result, index) => {
                let domain = "web source";

                try {
                  domain = new URL(result.url).hostname;
                } catch {
                  // Keep fallback domain.
                }

                return (
                  <a
                    key={`${result.url || "result"}-${index}`}
                    href={result.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex flex-col gap-1 rounded-xl border border-border bg-background p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                  >
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${domain}`}
                        alt=""
                        className="h-3.5 w-3.5 rounded-sm"
                      />

                      <span className="truncate text-[0.65rem] font-medium text-muted-foreground">
                        {domain}
                      </span>

                      <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                    </div>

                    <p className="text-xs font-semibold leading-5 text-foreground">
                      {result.title || "Untitled source"}
                    </p>

                    <p className="line-clamp-4 text-[0.7rem] leading-5 text-secondary">
                      {result.content || "No preview available."}
                    </p>
                  </a>
                );
              })
            : null}

          {!loading && !error && filteredResults.length === 0 ? (
            <WorkspaceEmptyState
              title="No sources found"
              description={
                results.length
                  ? "Try a different filter."
                  : "Search results will appear here for the active workspace stage."
              }
            />
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
