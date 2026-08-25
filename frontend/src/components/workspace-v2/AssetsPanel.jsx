"use client";

import { useMemo, useState } from "react";
import { FileText, FolderOpen, Image as ImageIcon, LayoutGrid, List, Search, UploadCloud } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import WorkspaceEmptyState from "@/components/workspace-v2/WorkspaceEmptyState";

const ASSET_TABS = [
  { key: "uploads", label: "Uploads" },
  { key: "templates", label: "Templates" },
  { key: "documents", label: "Documents" },
  { key: "images", label: "Images" }
];

function fileExtension(name = "") {
  const lower = String(name || "").toLowerCase();
  return lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "file";
}

export default function AssetsPanel({ stageDocuments = {}, catalogProject, projectName, stageProgressKey }) {
  const [activeTab, setActiveTab] = useState("uploads");
  const [query, setQuery] = useState("");
  const [view, setView] = useState("list");

  const uploads = useMemo(() => {
    const rows = [];
    Object.entries(stageDocuments || {}).forEach(([key, entry]) => {
      const docs = Array.isArray(entry?.documents) && entry.documents.length ? entry.documents : (entry?.document_url || entry?.document_name ? [entry] : []);
      docs.forEach((doc) => {
        if (!doc?.document_url && !doc?.document_name) return;
        rows.push({
          key: `${key}:${doc.document_url || doc.document_name}`,
          name: doc.document_name || "Document",
          url: doc.document_url || "",
          status: entry?.document_review_status || ""
        });
      });
    });
    return rows;
  }, [stageDocuments]);

  const templates = useMemo(() => {
    const map = catalogProject?.demo_documents_by_id || {};
    return Object.values(map || {}).map((doc) => ({
      key: String(doc?.id || doc?.name || Math.random()),
      name: doc?.name || doc?.original_filename || "Template document",
      url: doc?.preview_url || doc?.download_url || ""
    }));
  }, [catalogProject]);

  const documents = useMemo(() => [...uploads, ...templates], [uploads, templates]);

  const rows = activeTab === "uploads" ? uploads : activeTab === "templates" ? templates : activeTab === "documents" ? documents : [];
  const filteredRows = rows.filter((row) => (query.trim() ? row.name.toLowerCase().includes(query.trim().toLowerCase()) : true));

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <div className="flex flex-col gap-2 border-b border-border bg-gradient-to-b from-primary/5 to-transparent p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <FolderOpen className="h-3 w-3" />
            </span>
            <p className="text-xs font-semibold uppercase tracking-wide text-secondary">Assets</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn("grid h-6 w-6 place-items-center rounded-md", view === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground")}
              aria-label="List view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setView("grid")}
              className={cn("grid h-6 w-6 place-items-center rounded-md", view === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground")}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            {ASSET_TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key} className="text-[0.62rem]">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search assets"
            className="h-8 w-full rounded-lg border border-input bg-background pl-8 pr-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {activeTab === "images" ? (
          <div className="p-3">
            <WorkspaceEmptyState
              icon={ImageIcon}
              title="No images yet"
              description="Image assets for this project will appear here once available."
            />
          </div>
        ) : filteredRows.length ? (
          <div className={cn("p-3", view === "grid" ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2")}>
            {filteredRows.map((row) => (
              <a
                key={row.key}
                href={row.url || "#"}
                target={row.url ? "_blank" : undefined}
                rel="noreferrer"
                className={cn(
                  "flex items-center gap-2 rounded-xl border border-border bg-background p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
                  !row.url && "pointer-events-none opacity-60"
                )}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-foreground">{row.name}</span>
                  <span className="mt-0.5 flex items-center gap-1">
                    <Badge variant="outline" className="px-1.5 py-0 text-[0.58rem] uppercase">
                      {fileExtension(row.name)}
                    </Badge>
                    {row.status ? (
                      <Badge variant="outline" className="px-1.5 py-0 text-[0.58rem] capitalize">
                        {row.status}
                      </Badge>
                    ) : null}
                  </span>
                </span>
              </a>
            ))}
          </div>
        ) : (
          <div className="p-3">
            <WorkspaceEmptyState
              icon={UploadCloud}
              title="Nothing here yet"
              description="Uploaded documents and templates for this project will show up here."
            />
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
