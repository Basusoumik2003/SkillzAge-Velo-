"use client";

import { useMemo } from "react";
import { CheckCircle2, Clock3, Globe2, Link2, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";

import { EmptyState, FieldLabel, Panel, inputClass } from "./ui";

export default function GlobalSourcesTab({
  globalSources,
  globalSourcesLoading,
  globalSourceForm,
  setGlobalSourceForm,
  globalSourceFile,
  setGlobalSourceFile,
  saveGlobalSource,
  editGlobalSource,
  removeGlobalSource,
  resetGlobalSource,
  saving,
  searchQuery
}) {
  const filteredSources = useMemo(() => {
    const query = String(searchQuery || "").trim().toLowerCase();
    if (!query) return globalSources;
    return globalSources.filter((source) => source.title?.toLowerCase().includes(query));
  }, [globalSources, searchQuery]);

  return (
    <Panel
      title="Global Knowledge Sources"
      description="Reference material available across every phase and stage, not tied to one specific stage."
      icon={Globe2}
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <form onSubmit={saveGlobalSource} className="grid gap-4">
          <label className="grid gap-2">
            <FieldLabel>Title</FieldLabel>
            <input
              value={globalSourceForm.title}
              onChange={(e) => setGlobalSourceForm({ ...globalSourceForm, title: e.target.value })}
              placeholder="e.g. India startup funding landscape"
              className={inputClass}
            />
          </label>

          <label className="grid gap-2">
            <FieldLabel>Source</FieldLabel>
            <select
              value={globalSourceForm.source_type}
              onChange={(e) => setGlobalSourceForm({ ...globalSourceForm, source_type: e.target.value })}
              disabled={Boolean(globalSourceForm.id)}
              className={inputClass}
            >
              <option value="manual">Paste text</option>
              <option value="url">Link (URL)</option>
              <option value="upload">Upload file</option>
            </select>
          </label>

          {globalSourceForm.source_type === "url" ? (
            <label className="grid gap-2">
              <FieldLabel>Source URL</FieldLabel>
              <input
                value={globalSourceForm.source_url}
                onChange={(e) => setGlobalSourceForm({ ...globalSourceForm, source_url: e.target.value })}
                placeholder="https://..."
                className={inputClass}
              />
            </label>
          ) : globalSourceForm.source_type === "upload" ? (
            <label className="grid gap-2">
              <FieldLabel>{globalSourceForm.id ? "Replace File (not supported yet)" : "File"}</FieldLabel>
              <input
                type="file"
                disabled={Boolean(globalSourceForm.id)}
                onChange={(e) => setGlobalSourceFile(e.target.files?.[0] || null)}
                className={`${inputClass} file:mr-3 file:rounded-full file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-xs file:font-black file:text-white`}
              />
              {globalSourceForm.id ? (
                <p className="text-xs font-semibold text-slate-500">
                  To swap the file, delete this source and upload a new one.
                </p>
              ) : globalSourceFile ? (
                <p className="text-xs font-semibold text-slate-500">Selected: {globalSourceFile.name}</p>
              ) : null}
            </label>
          ) : (
            <label className="grid gap-2">
              <FieldLabel>Content</FieldLabel>
              <textarea
                value={globalSourceForm.content_text}
                onChange={(e) => setGlobalSourceForm({ ...globalSourceForm, content_text: e.target.value })}
                rows={6}
                className={inputClass}
                placeholder="Paste reference text every student's mentor can draw on..."
              />
            </label>
          )}

          <label className="grid gap-2">
            <FieldLabel>Tags</FieldLabel>
            <input
              value={globalSourceForm.tags}
              onChange={(e) => setGlobalSourceForm({ ...globalSourceForm, tags: e.target.value })}
              placeholder="funding, india, market"
              className={inputClass}
            />
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(globalSourceForm.is_active)}
              onChange={(e) => setGlobalSourceForm({ ...globalSourceForm, is_active: e.target.checked })}
              className="h-4 w-4"
            />
            Active
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-[0_14px_30px_-16px_rgba(15,23,42,0.8)] transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : globalSourceForm.source_type === "upload" ? (
                <Upload className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {globalSourceForm.id ? "Update Source" : "Add Global Source"}
            </button>
            <button
              type="button"
              onClick={resetGlobalSource}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Reset
            </button>
          </div>
        </form>

        <div className="space-y-3 xl:border-l xl:border-slate-100 xl:pl-6">
          {globalSourcesLoading ? (
            <p className="text-sm font-semibold text-slate-500">Loading global sources...</p>
          ) : filteredSources.length ? (
            filteredSources.map((source) => (
              <div key={source.id} className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-black text-slate-950">{source.title}</p>
                      {!source.is_active ? (
                        <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-rose-600">
                          Inactive
                        </span>
                      ) : null}
                      {source.indexed_at ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Indexed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-700">
                          <Clock3 className="h-3 w-3" />
                          Pending indexing
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500">Global &middot; {source.source_type}</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-400">
                      {source.indexed_at ? `Indexed ${new Date(source.indexed_at).toLocaleString()}` : "Document text has not been indexed yet."}
                    </p>
                    {source.source_type === "upload" && source.storage_url ? (
                      <a
                        href={source.storage_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:underline"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {source.original_filename || "Uploaded file"}
                      </a>
                    ) : source.source_type === "url" && source.source_url ? (
                      <a
                        href={source.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:underline"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        {source.source_url}
                      </a>
                    ) : (
                      <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-600">{source.content_text}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => editGlobalSource(source)}
                      className="rounded-full border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-100"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeGlobalSource(source)}
                      className="rounded-full border border-rose-200 bg-white p-2 text-rose-600 transition hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <EmptyState>
              {globalSources.length ? "No sources match your search." : "No global sources yet — add the first one above."}
            </EmptyState>
          )}
        </div>
      </div>
    </Panel>
  );
}
