import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { getCurrentStageDeliverables, getStageDeliverablesForStudent } from "@/lib/deliverables";

import DeliverableCard from "./DeliverableCard";

// Drop-in panel for the student workspace: pass a `stageId` to show one
// stage's deliverables, or omit it to show whatever the backend resolves as
// the student's current stage (GET /deliverables/student/current-stage,
// same "current stage" logic as app/services/startup_progress.py). Not
// wired into any workspace page yet - workspace-v2 is mid-refactor, so
// integration is left to whoever finishes that page.
export default function StageDeliverablesPanel({ stageId, className }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = stageId ? await getStageDeliverablesForStudent(stageId) : await getCurrentStageDeliverables();
      setEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to load deliverables.");
    } finally {
      setLoading(false);
    }
  }, [stageId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading deliverables...
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!entries.length) {
    return <p className="text-sm text-muted-foreground">No deliverables are configured for this stage yet.</p>;
  }

  return (
    <div className={className || "grid gap-4"}>
      {entries.map((entry) => (
        <DeliverableCard key={entry.deliverable.id} entry={entry} onChanged={load} />
      ))}
    </div>
  );
}
