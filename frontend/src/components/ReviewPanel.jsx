"use client";

import { useState } from "react";
import ReviewGuidelinesModal from "@/components/reviews/ReviewGuidelinesModal";

function shortHash(value) {
  if (!value) return "-";
  return value.slice(0, 8);
}

function dateText(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PanelIcon({ type }) {
  const common = "h-4 w-4";
  if (type === "refresh") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={common}
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M20 6v5h-5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4 18v-5h5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M18 9a6.5 6.5 0 0 0-11-2M6 15a6.5 6.5 0 0 0 11 2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (type === "file") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={common}
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M7 3h7l4 4v14H7V3Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M14 3v5h5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (type === "clock") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={common}
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path
          d="M12 7v5l3 2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (type === "bulb") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={common}
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M9 18h6M10 22h4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M8 14a6 6 0 1 1 8 0c-.7.6-1 1.3-1 2H9c0-.7-.3-1.4-1-2Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={common} fill="none" aria-hidden="true">
      <path
        d="M12 3v18M7 8l5-5 5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SectionTitle({ icon, children }) {
  return (
    <h4 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-600">
      <span className="text-[#f97316]">
        <PanelIcon type={icon} />
      </span>
      {children}
    </h4>
  );
}

function ScoreRing({ score = 0, total = 100 }) {
  const normalizedTotal = Math.max(1, Number(total) || 100);
  const normalizedScore = Math.max(
    0,
    Math.min(normalizedTotal, Number(score) || 0),
  );
  const percentage = Math.round((normalizedScore / normalizedTotal) * 100);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3">
      <div
        className="grid h-14 w-14 place-items-center rounded-full"
        style={{
          background: `conic-gradient(#22c55e ${percentage}%, #eef2f7 0)`,
        }}
        aria-label={`Review score ${normalizedScore} out of ${normalizedTotal}`}
      >
        <div className="h-11 w-11 rounded-full bg-white" />
      </div>
      <div>
        <p className="text-lg font-black text-slate-950">
          {normalizedScore}/{normalizedTotal}
        </p>
        <p className="text-xs font-semibold text-slate-500">Review Score</p>
      </div>
    </div>
  );
}

function statusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "pass" || normalized === "passed")
    return "bg-emerald-50 text-emerald-700";
  if (normalized === "fail" || normalized === "failed")
    return "bg-red-50 text-red-700";
  return "bg-blue-50 text-blue-700";
}

function ReviewCard({ review, latest = false }) {
  const summary = review.review_summary || {};
  const files = Array.isArray(review.changed_files) ? review.changed_files : [];
  const score = summary.score ?? null;
  const passingScore = summary.passing_score || 100;
  const status = summary.status || "reviewed";
  const insightLevel = summary.insight_level || "low";

  return (
    <article className="rounded-xl border border-orange-100 bg-white p-4 shadow-[0_18px_42px_-36px_rgba(15,23,42,0.35)]">
      <div className="grid gap-4 lg:grid-cols-[minmax(230px,0.8fr)_1.7fr]">
        <div className="flex gap-4">
          <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-500 text-sm font-black text-white">
            A
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-black text-slate-950">
                Commit {shortHash(review.commit_hash)}
              </h3>
              {latest ? (
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[0.65rem] font-black text-blue-700">
                  Latest
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {review.project_name}
            </p>
            {score !== null ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <ScoreRing score={score} total={passingScore} />
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black capitalize ${statusTone(status)}`}
                  >
                    {status}
                  </span>
                  <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black capitalize text-orange-700">
                    {insightLevel}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-white px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-3xl whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">
              {review.review_feedback}
            </p>
            <span className="shrink-0 text-xs font-semibold text-slate-500">
              {dateText(review.created_at)}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {files.slice(0, 6).map((file) => (
              <span
                key={`${review.id}-${file.filename}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700"
              >
                <PanelIcon type="file" />
                {file.filename}
              </span>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function ReviewPanel({
  latestReview,
  previousReviews = [],
  commitHistory = [],
  loading,
  onRefresh,
}) {
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);

  return (
    <section className="grid gap-5">
      <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-4 shadow-[0_18px_42px_-38px_rgba(15,23,42,0.35)]">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-lg bg-orange-50 text-[#f97316]">
            <PanelIcon type="file" />
          </span>
          <div>
            <h3 className="text-xl font-black text-slate-950">Code Review</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Get AI-powered mentor reviews and feedback on your code quality.
            </p>
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-orange-100 bg-white px-4 py-2 text-xs font-black text-[#f97316] transition hover:border-[#f97316] hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <PanelIcon type="refresh" />
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <section>
        <SectionTitle icon="file">Latest Feedback</SectionTitle>
        {latestReview ? (
          <ReviewCard review={latestReview} latest />
        ) : (
          <div className="rounded-xl border border-slate-100 bg-blue-50/40 px-4 py-4 text-sm font-semibold text-slate-600">
            No reviews yet.
          </div>
        )}
      </section>

      <section>
        <SectionTitle icon="clock">Previous Review History</SectionTitle>
        <div className="grid gap-3">
          {previousReviews.length ? (
            previousReviews.map((item) => (
              <ReviewCard key={item.id} review={item} />
            ))
          ) : (
            <div className="rounded-xl border border-slate-100 bg-blue-50/40 px-4 py-4 text-sm font-semibold text-slate-600">
              No previous reviews.
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionTitle icon="clock">Commit Timeline</SectionTitle>
        <div className="relative grid gap-3 pl-7">
          <span
            className="absolute bottom-4 left-2 top-4 w-px bg-violet-200"
            aria-hidden="true"
          />
          {commitHistory.length ? (
            commitHistory.map((item, index) => (
              <div
                key={`${item.review_id}-${item.commit_hash}`}
                className="relative rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-[0_18px_42px_-38px_rgba(15,23,42,0.35)]"
              >
                <span className="absolute -left-[1.65rem] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-violet-600 bg-white" />
                <div className="grid gap-2 text-sm md:grid-cols-[110px_1fr_130px_190px] md:items-center">
                  <strong className="text-slate-950">
                    {shortHash(item.commit_hash)}
                  </strong>
                  <span className="font-semibold text-slate-600">
                    {item.project_name}
                  </span>
                  {(item.changed_files || []).slice(0, 1).map((file) => (
                    <span
                      key={file.filename}
                      className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700"
                    >
                      <PanelIcon type="file" />
                      {file.filename}
                    </span>
                  ))}
                  <span className="text-xs font-semibold text-slate-500 md:text-right">
                    {dateText(item.created_at)}
                  </span>
                </div>
                {index === 0 ? (
                  <span className="absolute right-4 top-3 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                    Latest
                  </span>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-slate-100 bg-blue-50/40 px-4 py-4 text-sm font-semibold text-slate-600">
              No commit history yet.
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-100 bg-violet-50/50 px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-violet-100 text-violet-700">
            <PanelIcon type="bulb" />
          </span>
          <div>
            <p className="text-sm font-black text-slate-700">
              Reviews are based on best practices, code quality, and project
              guidelines.
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Keep improving! Your code will get better with each iteration.
            </p>
          </div>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-4 py-2 text-xs font-black text-violet-700 transition hover:border-violet-400 hover:bg-violet-50"
          type="button"
          onClick={() => setGuidelinesOpen(true)}
        >
          <PanelIcon type="file" />
          View Review Guidelines
        </button>
      </section>
      <ReviewGuidelinesModal
        open={guidelinesOpen}
        onClose={() => setGuidelinesOpen(false)}
      />
    </section>
  );
}
