"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Sparkles, Star, Trash2 } from "lucide-react";
import {
  createAdminStartupMentor,
  deleteAdminStartupMentor,
  listAdminStartupMentors,
  updateAdminStartupMentor
} from "@/lib/startup";

const EMPTY_MENTOR = {
  id: null,
  agent_key: "",
  mentor_name: "",
  role: "",
  goal: "",
  backstory: "",
  avatar_url: "",
  output_format: "markdown",
  is_default: false,
  is_hidden: false
};

const OUTPUT_FORMATS = ["markdown", "plain_text", "json"];

const inputClass =
  "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition placeholder:text-slate-400 focus:border-orange-300 focus:bg-white";

function FieldLabel({ children }) {
  return <span className="text-sm font-black uppercase tracking-[0.08em] text-slate-600">{children}</span>;
}

export default function StartupMentorManager() {
  const [mentors, setMentors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_MENTOR);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listAdminStartupMentors();
      setMentors(Array.isArray(data?.mentors) ? data.mentors : []);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to load mentors.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const reset = () => setForm(EMPTY_MENTOR);
  const edit = (mentor) => setForm({ ...EMPTY_MENTOR, ...mentor });

  const save = async (event) => {
    event?.preventDefault?.();
    setSaving(true);
    setError("");
    try {
      const payload = {
        agent_key: form.agent_key,
        mentor_name: form.mentor_name,
        role: form.role,
        goal: form.goal,
        backstory: form.backstory,
        avatar_url: form.avatar_url,
        output_format: form.output_format,
        is_default: Boolean(form.is_default),
        is_hidden: Boolean(form.is_hidden)
      };
      if (form.id) {
        await updateAdminStartupMentor(form.id, payload);
      } else {
        await createAdminStartupMentor(payload);
      }
      reset();
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to save mentor.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (mentor) => {
    if (!window.confirm(`Delete mentor "${mentor.mentor_name}"?`)) return;
    setSaving(true);
    try {
      await deleteAdminStartupMentor(mentor.id);
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to delete mentor.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.45)]">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-orange-50 text-orange-600">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-2xl font-black text-slate-950">Startup Mentors</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            AI mentor personas for the Startup Journey. Assign an agent key to a phase or stage to route questions to a specific mentor.
          </p>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <FieldLabel>Agent Key</FieldLabel>
              <input
                value={form.agent_key}
                onChange={(e) => setForm({ ...form, agent_key: e.target.value })}
                placeholder="market_research_coach"
                className={inputClass}
              />
            </label>
            <label className="grid gap-2">
              <FieldLabel>Mentor Name</FieldLabel>
              <input
                value={form.mentor_name}
                onChange={(e) => setForm({ ...form, mentor_name: e.target.value })}
                placeholder="e.g. Ananya"
                className={inputClass}
              />
            </label>
          </div>
          <label className="grid gap-2">
            <FieldLabel>Role</FieldLabel>
            <input
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              placeholder="Market Research Coach for early-stage founders"
              className={inputClass}
            />
          </label>
          <label className="grid gap-2">
            <FieldLabel>Goal</FieldLabel>
            <textarea
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: e.target.value })}
              rows={2}
              className={inputClass}
              placeholder="What this mentor is trying to help the student achieve..."
            />
          </label>
          <label className="grid gap-2">
            <FieldLabel>Backstory</FieldLabel>
            <textarea
              value={form.backstory}
              onChange={(e) => setForm({ ...form, backstory: e.target.value })}
              rows={5}
              className={inputClass}
              placeholder="Persona/system-prompt details the AI should stay in character with..."
            />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <FieldLabel>Avatar URL</FieldLabel>
              <input
                value={form.avatar_url}
                onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
                placeholder="https://..."
                className={inputClass}
              />
            </label>
            <label className="grid gap-2">
              <FieldLabel>Output Format</FieldLabel>
              <select
                value={form.output_format}
                onChange={(e) => setForm({ ...form, output_format: e.target.value })}
                className={inputClass}
              >
                {OUTPUT_FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {format}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(form.is_default)}
                onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                className="h-4 w-4"
              />
              Default mentor (fallback)
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(form.is_hidden)}
                onChange={(e) => setForm({ ...form, is_hidden: e.target.checked })}
                className="h-4 w-4"
              />
              Hidden (internal only)
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-[0_14px_30px_-16px_rgba(15,23,42,0.8)] transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {form.id ? "Update Mentor" : "Create Mentor"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Reset
            </button>
          </div>
        </form>

        <div className="space-y-3 xl:border-l xl:border-slate-100 xl:pl-6">
          {loading ? (
            <p className="text-sm font-semibold text-slate-500">Loading mentors...</p>
          ) : mentors.length ? (
            mentors.map((mentor) => (
              <div key={mentor.id} className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-black text-slate-950">{mentor.mentor_name}</p>
                      {mentor.is_default ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-orange-700">
                          <Star className="h-3 w-3" />
                          Default
                        </span>
                      ) : null}
                      {mentor.is_hidden ? (
                        <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-600">Hidden</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {mentor.agent_key} &middot; {mentor.output_format}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-600">{mentor.role}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => edit(mentor)}
                      className="rounded-full border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-100"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(mentor)}
                      className="rounded-full border border-rose-200 bg-white p-2 text-rose-600 transition hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm font-semibold text-slate-500">No mentors yet — create the first one above and mark it Default.</p>
          )}
        </div>
      </div>
    </section>
  );
}
