"use client";

import { useMemo, useState } from "react";

function shortHash(commitHash) {
  if (!commitHash) return "-";
  return commitHash.slice(0, 8);
}

function repoName(url) {
  if (!url) return "";
  return url.replace(/\/+$/, "").split("/").slice(-2).join("/");
}

function FieldIcon({ type }) {
  const common = "h-4 w-4";
  if (type === "user") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" aria-hidden="true">
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2" />
        <path d="M4 21a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === "branch") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" aria-hidden="true">
        <path d="M7 5v9a3 3 0 0 0 3 3h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M17 7v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="7" cy="5" r="2" stroke="currentColor" strokeWidth="2" />
        <circle cx="17" cy="7" r="2" stroke="currentColor" strokeWidth="2" />
        <circle cx="17" cy="17" r="2" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (type === "shield") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" aria-hidden="true">
        <path d="M12 3 5 6v5c0 4.5 2.7 8.5 7 10 4.3-1.5 7-5.5 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="m9 12 2 2 4-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type === "lock") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" aria-hidden="true">
        <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={common} fill="none" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-orange-100 text-slate-950">
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor" aria-hidden="true">
        <path d="M12 .5A11.5 11.5 0 0 0 8.36 22.9c.58.1.79-.25.79-.56v-2.03c-3.22.7-3.9-1.38-3.9-1.38-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.7.08-.7 1.17.08 1.79 1.2 1.79 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.75.4-1.27.73-1.56-2.57-.3-5.28-1.29-5.28-5.73 0-1.27.45-2.3 1.2-3.11-.12-.3-.52-1.49.12-3.07 0 0 .98-.31 3.2 1.19A11.05 11.05 0 0 1 12 6.03c.99.01 1.98.13 2.9.39 2.22-1.5 3.2-1.19 3.2-1.19.64 1.58.24 2.77.12 3.07.75.81 1.2 1.84 1.2 3.11 0 4.45-2.72 5.43-5.3 5.72.42.37.79 1.08.79 2.18v3.03c0 .31.2.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
      </svg>
      <span className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
    </div>
  );
}

function GitHubField({ icon, label, required, placeholder, value, onChange }) {
  return (
    <label className="flex items-center gap-4 rounded-xl border border-violet-100 bg-white px-3 py-4 shadow-[0_12px_32px_-30px_rgba(59,7,100,0.7)]">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-700">
        <FieldIcon type={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-black text-slate-900">
          {label} {required ? <span className="text-red-500">*</span> : null}
        </span>
        <input
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
          required={required}
        />
      </span>
    </label>
  );
}

export default function GitHubConnect({ repository, onConnect, loading, projectName }) {
  const [form, setForm] = useState({
    github_username: "",
    repository_url: "",
    branch_name: "main",
  });
  const [error, setError] = useState("");
  const connectedRepo = useMemo(() => repoName(repository?.repository_url), [repository]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await onConnect({ ...form, project_name: projectName });
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not connect repository.");
    }
  };

  if (!repository) {
    return (
      <div className="space-y-4">
        <section className="rounded-lg border border-violet-100 bg-white p-4 shadow-[0_22px_55px_-42px_rgba(15,23,42,0.35)]">
          <div className="flex items-center gap-4">
            <GitHubMark />
            <div className="min-w-0">
              <h3 className="text-xl font-black text-slate-950">GitHub Connect</h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">Connect your GitHub repository so we can track your code updates.</p>
            </div>
          </div>

          <form className="mt-6 grid gap-3" onSubmit={submit}>
            <GitHubField
              icon="user"
              label="GitHub Username"
              required
              placeholder="Enter your GitHub username"
              value={form.github_username}
              onChange={(event) => setForm((prev) => ({ ...prev, github_username: event.target.value }))}
            />
            <GitHubField
              icon="link"
              label="Repository URL"
              required
              placeholder="https://github.com/username/repository"
              value={form.repository_url}
              onChange={(event) => setForm((prev) => ({ ...prev, repository_url: event.target.value }))}
            />
            <GitHubField
              icon="branch"
              label="Default Branch"
              required
              placeholder="main"
              value={form.branch_name}
              onChange={(event) => setForm((prev) => ({ ...prev, branch_name: event.target.value }))}
            />
            {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
            <button disabled={loading} className="mt-1 inline-flex min-h-11 items-center justify-center gap-3 rounded-lg bg-[#10253e] px-4 text-sm font-black text-white shadow-[0_18px_34px_-26px_rgba(15,37,62,0.8)] transition hover:bg-[#17395f] disabled:cursor-not-allowed disabled:opacity-70">
              <GitHubMarkSmall />
              {loading ? "Saving..." : "Save Repository"}
            </button>
          </form>
        </section>

        <section className="flex items-center justify-between gap-3 rounded-lg border border-violet-100 bg-violet-50/70 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-100 text-violet-700">
              <FieldIcon type="shield" />
            </span>
            <div>
              <p className="text-sm font-black text-violet-700">Your code is safe & private</p>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">We only use read-only access to track your commits and updates.</p>
            </div>
          </div>
          <span className="hidden items-center gap-2 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 sm:inline-flex">
            <FieldIcon type="lock" />
            Read-only Access
          </span>
        </section>
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-violet-100 bg-white p-4 shadow-[0_22px_55px_-42px_rgba(15,23,42,0.35)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <GitHubMark />
          <div>
            <h3 className="text-xl font-black text-slate-950">GitHub Connect</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">Repository tracking is active for this workspace.</p>
          </div>
        </div>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
          Connected
        </span>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 px-4 py-3">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Repository</p>
          <p className="mt-1 break-words text-sm font-black text-slate-950">{connectedRepo}</p>
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 px-4 py-3">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Branch</p>
          <p className="mt-1 text-sm font-black text-slate-950">{repository.branch_name}</p>
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 px-4 py-3">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Last Sync</p>
          <p className="mt-1 text-sm font-black text-slate-950">{repository.last_sync_status}</p>
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 px-4 py-3">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Last Reviewed Commit</p>
          <p className="mt-1 text-sm font-black text-slate-950">{shortHash(repository.last_reviewed_commit)}</p>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
        <p className="text-sm font-black text-emerald-800">Automatic review mode is active</p>
        <p className="mt-1 text-xs font-semibold leading-6 text-emerald-700">
          Reviews are triggered automatically when you enter Coding Stage or push a new commit. No manual sync button is needed.
        </p>
      </div>
      {!repository.webhook_enabled ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-black text-amber-800">Push webhook is not active yet</p>
          <p className="mt-1 text-xs font-semibold leading-6 text-amber-700">
            Automatic reviews from GitHub push events will not run until the backend successfully registers the repository webhook.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function GitHubMarkSmall() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M12 .5A11.5 11.5 0 0 0 8.36 22.9c.58.1.79-.25.79-.56v-2.03c-3.22.7-3.9-1.38-3.9-1.38-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.7.08-.7 1.17.08 1.79 1.2 1.79 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.75.4-1.27.73-1.56-2.57-.3-5.28-1.29-5.28-5.73 0-1.27.45-2.3 1.2-3.11-.12-.3-.52-1.49.12-3.07 0 0 .98-.31 3.2 1.19A11.05 11.05 0 0 1 12 6.03c.99.01 1.98.13 2.9.39 2.22-1.5 3.2-1.19 3.2-1.19.64 1.58.24 2.77.12 3.07.75.81 1.2 1.84 1.2 3.11 0 4.45-2.72 5.43-5.3 5.72.42.37.79 1.08.79 2.18v3.03c0 .31.2.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}
