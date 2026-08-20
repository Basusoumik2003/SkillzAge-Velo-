import { useState } from "react";
import { AlertCircle, History, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { submitDeliverable, resubmitDeliverable, uploadDeliverableFile } from "@/lib/deliverables";

import DeliverableStatusBadge from "./DeliverableStatusBadge";
import SubmissionInput from "./SubmissionInput";

// One deliverable slot in the student workspace: name/description, the
// right submission control for its type, current status + review feedback/
// score, and submission history. `entry` is one item from
// GET /deliverables/student/current-stage
// (DeliverableWithSubmissionResponse in Backend/app/schemas/deliverables.py).
export default function DeliverableCard({ entry, onChanged }) {
  const { deliverable, latest_submission: latestSubmission, submission_count: submissionCount } = entry;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const isFileType = ["document", "pdf", "image", "video"].includes(deliverable.deliverable_type);
  const canSubmit =
    !latestSubmission ||
    latestSubmission.status === "rejected" ||
    latestSubmission.status === "resubmission_required";

  const latestReview = latestSubmission?.reviews?.[0];

  const handleSubmit = async ({ submission_type, submission_text, file }) => {
    setSubmitting(true);
    setError("");
    try {
      const isResubmit = Boolean(latestSubmission);
      const create = isResubmit ? resubmitDeliverable : submitDeliverable;
      const payload = isResubmit
        ? [deliverable.id, { submission_type, submission_text }]
        : [{ deliverable_id: deliverable.id, submission_type, submission_text }];
      const submission = await create(...payload);

      if (isFileType && file) {
        await uploadDeliverableFile(submission.id, file);
      }

      onChanged?.();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Unable to submit deliverable.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            {deliverable.deliverable_name}
            {deliverable.is_required ? (
              <span className="text-xs font-normal text-destructive">Required</span>
            ) : null}
          </CardTitle>
          {deliverable.deliverable_description ? (
            <CardDescription>{deliverable.deliverable_description}</CardDescription>
          ) : null}
        </div>
        <DeliverableStatusBadge status={latestSubmission?.status} />
      </CardHeader>

      <CardContent className="grid gap-3">
        {error ? (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        ) : null}

        {latestReview ? (
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
            <p className="font-semibold">
              {latestReview.reviewer_type === "ai" ? "AI Review" : "Mentor Review"} · Score: {latestReview.score}/100
            </p>
            {latestReview.feedback ? <p className="mt-1 text-muted-foreground">{latestReview.feedback}</p> : null}
          </div>
        ) : null}

        {canSubmit ? (
          <SubmissionInput
            deliverableType={deliverable.deliverable_type}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            {latestSubmission?.status === "approved"
              ? "This deliverable has been approved."
              : "Waiting for review - you'll be able to resubmit if changes are requested."}
          </p>
        )}

        {submissionCount > 1 ? (
          <button
            type="button"
            onClick={() => setShowHistory((value) => !value)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <History className="h-3.5 w-3.5" />
            {showHistory ? "Hide" : "Show"} upload history ({submissionCount} attempts)
          </button>
        ) : null}

        {submitting ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Uploading and submitting...
          </div>
        ) : null}

        {canSubmit && latestSubmission?.status === "resubmission_required" ? (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600">
            <RefreshCw className="h-3.5 w-3.5" />
            Resubmission required - see feedback above before you resubmit.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
