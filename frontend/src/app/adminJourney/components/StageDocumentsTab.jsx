"use client";

import { useMemo } from "react";
import { FileText, Link2, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";

import { EmptyState, FieldLabel, Panel, inputClass } from "./ui";

const DOCUMENT_TYPES = ["reference", "policy", "prompt", "example", "research", "template"];

export default function StageDocumentsTab({
  phases,
  documents,
  documentsLoading,
  documentForm,
  setDocumentForm,
  documentFile,
  setDocumentFile,
  saveDocument,
  editDocument,
  removeDocument,
  resetDocument,
  saving,
  searchQuery
}) {
  const filteredDocuments = useMemo(() => {
    const query = String(searchQuery || "").trim().toLowerCase();
    if (!query) return documents;
    return documents.filter(
      (doc) =>
        doc.title?.toLowerCase().includes(query) ||
        doc.stage_name?.toLowerCase().includes(query) ||
        doc.phase_name?.toLowerCase().includes(query)
    );
  }, [documents, searchQuery]);

  return (
    <Panel
      title="Stage Documents"
      description="Reference material the AI mentor pulls into an answer for a specific stage."
      icon={FileText}
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <form onSubmit={saveDocument} className="grid gap-4">
          <label className="grid gap-2">
            <FieldLabel>Stage</FieldLabel>
            <select
              value={documentForm.stage_id}
              onChange={(e) => setDocumentForm({ ...documentForm, stage_id: e.target.value })}
              className={inputClass}
            >
              <option value="">Select stage</option>
              {phases.map((phase) => (
                <optgroup key={phase.id} label={phase.phase_name}>
                  {(phase.stages || []).length ? (
                    phase.stages.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.stage_name}
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>
                      No stages created yet
                    </option>
                  )}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <FieldLabel>Title</FieldLabel>
            <input
              value={documentForm.title}
              onChange={(e) => setDocumentForm({ ...documentForm, title: e.target.value })}
              placeholder="e.g. Market sizing checklist"
              className={inputClass}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <FieldLabel>Document Type</FieldLabel>
              <select
                value={documentForm.document_type}
                onChange={(e) => setDocumentForm({ ...documentForm, document_type: e.target.value })}
                className={inputClass}
              >
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <FieldLabel>Source</FieldLabel>
              <select
                value={documentForm.source_type}
                onChange={(e) => setDocumentForm({ ...documentForm, source_type: e.target.value })}
                disabled={Boolean(documentForm.id)}
                className={inputClass}
              >
                <option value="manual">Paste text</option>
                <option value="url">Link (URL)</option>
                <option value="upload">Upload file</option>
              </select>
            </label>
          </div>

          {documentForm.source_type === "url" ? (
            <label className="grid gap-2">
              <FieldLabel>Source URL</FieldLabel>
              <input
                value={documentForm.source_url}
                onChange={(e) => setDocumentForm({ ...documentForm, source_url: e.target.value })}
                placeholder="https://..."
                className={inputClass}
              />
            </label>
          ) : documentForm.source_type === "upload" ? (
            <label className="grid gap-2">
              <FieldLabel>{documentForm.id ? "Replace File (not supported yet)" : "File"}</FieldLabel>
              <input
                type="file"
                disabled={Boolean(documentForm.id)}
                onChange={(e) => setDocumentFile(e.target.files?.[0] || null)}
                className={`${inputClass} file:mr-3 file:rounded-full file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-xs file:font-black file:text-white`}
              />
              {documentForm.id ? (
                <p className="text-xs font-semibold text-slate-500">
                  To swap the file, delete this document and upload a new one.
                </p>
              ) : documentFile ? (
                <p className="text-xs font-semibold text-slate-500">Selected: {documentFile.name}</p>
              ) : null}
            </label>
          ) : (
            <label className="grid gap-2">
              <FieldLabel>Content</FieldLabel>
              <textarea
                value={documentForm.content_text}
                onChange={(e) => setDocumentForm({ ...documentForm, content_text: e.target.value })}
                rows={6}
                className={inputClass}
                placeholder="Paste the reference text the mentor should use..."
              />
            </label>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <FieldLabel>Tags</FieldLabel>
              <input
                value={documentForm.tags}
                onChange={(e) => setDocumentForm({ ...documentForm, tags: e.target.value })}
                placeholder="market, template, india"
                className={inputClass}
              />
            </label>
            <label className="grid gap-2">
              <FieldLabel>Language</FieldLabel>
              <input
                value={documentForm.language}
                onChange={(e) => setDocumentForm({ ...documentForm, language: e.target.value })}
                className={inputClass}
              />
            </label>
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(documentForm.is_active)}
              onChange={(e) => setDocumentForm({ ...documentForm, is_active: e.target.checked })}
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
              ) : documentForm.source_type === "upload" ? (
                <Upload className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {documentForm.id ? "Update Document" : "Add Document"}
            </button>
            <button
              type="button"
              onClick={resetDocument}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Reset
            </button>
          </div>
        </form>

        <div className="space-y-3 xl:border-l xl:border-slate-100 xl:pl-6">
          {documentsLoading ? (
            <p className="text-sm font-semibold text-slate-500">Loading documents...</p>
          ) : filteredDocuments.length ? (
            filteredDocuments.map((doc) => (
              <div key={doc.id} className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-black text-slate-950">{doc.title}</p>
                      <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-600">
                        {doc.document_type}
                      </span>
                      {!doc.is_active ? (
                        <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-rose-600">
                          Inactive
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {doc.phase_name} &middot; {doc.stage_name}
                    </p>
                    {doc.source_type === "upload" && doc.storage_url ? (
                      <a
                        href={doc.storage_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:underline"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {doc.original_filename || "Uploaded file"}
                      </a>
                    ) : doc.source_type === "url" && doc.source_url ? (
                      <a
                        href={doc.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:underline"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        {doc.source_url}
                      </a>
                    ) : (
                      <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-600">{doc.content_text}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => editDocument(doc)}
                      className="rounded-full border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-100"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeDocument(doc)}
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
              {documents.length
                ? "No documents match your search."
                : "No documents yet — pick a stage and add the first reference document."}
            </EmptyState>
          )}
        </div>
      </div>
    </Panel>
  );
}
