"use client";

import { useEffect, useState } from "react";
import { Pencil, Star, Trash2, Users } from "lucide-react";
import { createAdminStartupMentor, deleteAdminStartupMentor, listAdminStartupMentors, updateAdminStartupMentor } from "@/lib/startup";

const INITIAL_FORM = {
  agentKey: "",
  mentorName: "",
  role: "",
  goal: "",
  backstory: "",
  avatarUrl: "",
  outputFormat: "markdown",
  isDefault: false,
  isHidden: false
};
const FORMATS = ["markdown", "plain_text", "json"];

export default function MentorManager() {
  const [mentors, setMentors] = useState([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    try { const data = await listAdminStartupMentors(); setMentors(Array.isArray(data?.mentors) ? data.mentors : Array.isArray(data) ? data : []); }
    catch (err) { setError(err?.response?.data?.detail || err?.message || "Failed to load mentors."); }
    finally { setLoaded(true); }
  };
  useEffect(() => { load(); }, []);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const reset = () => { setForm(INITIAL_FORM); setEditingId(null); setError(""); };
  const edit = (mentor) => { setForm({ agentKey: mentor.agent_key || "", mentorName: mentor.mentor_name || "", role: mentor.role || "", goal: mentor.goal || "", backstory: mentor.backstory || "", avatarUrl: mentor.avatar_url || "", outputFormat: mentor.output_format || "markdown", isDefault: Boolean(mentor.is_default), isHidden: Boolean(mentor.is_hidden) }); setEditingId(mentor.id); };
  const save = async (event) => {
    event.preventDefault(); setError(""); setMessage("");
    if (!form.agentKey.trim() || !form.mentorName.trim() || !form.role.trim() || !form.goal.trim() || !form.backstory.trim()) return setError("Agent key, name, role, goal, and backstory are all required.");
    const payload = {
      agent_key: form.agentKey.trim(),
      mentor_name: form.mentorName.trim(),
      role: form.role.trim(),
      goal: form.goal.trim(),
      backstory: form.backstory.trim(),
      avatar_url: form.avatarUrl.trim(),
      output_format: form.outputFormat,
      is_default: form.isDefault,
      is_hidden: form.isHidden
    };
    setSaving(true);
    try { const result = editingId ? await updateAdminStartupMentor(editingId, payload) : await createAdminStartupMentor(payload); const mentor = result?.mentor; setMentors((current) => editingId ? current.map((item) => item.id === editingId ? { ...item, ...mentor } : item) : [...current, mentor]); setMessage(`Mentor "${form.mentorName.trim()}" ${editingId ? "updated" : "created"}.`); reset(); }
    catch (err) { setError(err?.response?.data?.detail || err?.message || "Failed to save mentor."); } finally { setSaving(false); }
  };
  const remove = async (mentor) => { setDeletingId(mentor.id); setError(""); try { await deleteAdminStartupMentor(mentor.id); setMentors((current) => current.filter((item) => item.id !== mentor.id)); if (editingId === mentor.id) reset(); } catch (err) { setError(err?.response?.data?.detail || err?.message || "Failed to delete mentor."); } finally { setDeletingId(null); } };

  return <section className="mt-8 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm" id="mentor-form-card">
    <div className="mb-6 flex items-center gap-3"><Users className="h-6 w-6 text-orange-500" /><div><h2 className="text-2xl font-black text-slate-950">Mentors</h2><p className="text-sm font-semibold text-slate-500">AI mentor personas for the Startup Journey. Assign an agent key to a phase or stage to route questions to a specific mentor.</p></div></div>
    <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
      <form onSubmit={save} className="grid gap-3">{[["agentKey","Agent Key"],["mentorName","Mentor Name"],["role","Role"],["goal","Goal"],["avatarUrl","Avatar URL"]].map(([key,label]) => <label key={key} className="grid gap-1 text-sm font-black text-slate-600">{label}<input value={form[key]} onChange={(e) => update(key,e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2" /></label>)}<label className="grid gap-1 text-sm font-black text-slate-600">Backstory<textarea value={form.backstory} onChange={(e) => update("backstory",e.target.value)} rows={4} className="rounded-xl border border-slate-200 px-3 py-2" /></label><label className="grid gap-1 text-sm font-black text-slate-600">Output format<select value={form.outputFormat} onChange={(e) => update("outputFormat",e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2">{FORMATS.map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-sm font-bold"><input type="checkbox" checked={form.isDefault} onChange={(e) => update("isDefault",e.target.checked)} className="mr-2" />Default mentor (fallback)</label><label className="text-sm font-bold"><input type="checkbox" checked={form.isHidden} onChange={(e) => update("isHidden",e.target.checked)} className="mr-2" />Hidden mentor</label>{error && <p className="text-sm font-bold text-rose-600">{error}</p>}{message && <p className="text-sm font-bold text-emerald-600">{message}</p>}<div className="flex gap-2"><button disabled={saving} className="rounded-xl bg-slate-950 px-4 py-2 font-black text-white">{saving ? "Saving..." : editingId ? "Save Changes" : "Create Mentor"}</button>{editingId && <button type="button" onClick={reset} className="rounded-xl border px-4 py-2 font-black">Cancel</button>}</div></form>
      <div className="space-y-3">{!loaded ? <p className="text-sm font-semibold text-slate-500">Loading mentors...</p> : !mentors.length ? <p className="text-sm font-semibold text-slate-500">No mentors yet — create the first one and mark it Default.</p> : mentors.map((mentor) => <div key={mentor.id} className="flex items-start justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4"><div><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-900">{mentor.mentor_name}</p>{mentor.is_default ? <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-orange-700"><Star className="h-3 w-3" />Default</span> : null}{mentor.is_hidden ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-600">Hidden</span> : null}</div><p className="text-sm font-semibold text-slate-500">{mentor.role}</p><code className="text-xs">{mentor.agent_key}</code></div><div className="flex gap-2"><button type="button" onClick={() => edit(mentor)} className="rounded-full border bg-white p-2"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => remove(mentor)} disabled={deletingId === mentor.id} className="rounded-full border border-rose-200 bg-white p-2 text-rose-600"><Trash2 className="h-4 w-4" /></button></div></div>)}</div>
    </div>
  </section>;
}
