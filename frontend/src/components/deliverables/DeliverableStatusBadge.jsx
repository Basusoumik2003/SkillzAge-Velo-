import { Badge } from "@/components/ui/badge";

// Maps student_deliverable_submissions.status (Backend/sql/migrations/
// 2026-08-20_01_deliverable_management.sql) to a label + Badge variant.
const STATUS_META = {
  submitted: { label: "Submitted", variant: "outline" },
  under_review: { label: "Under Review", variant: "secondary" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
  resubmission_required: { label: "Resubmission Required", variant: "warning" }
};

export default function DeliverableStatusBadge({ status, className }) {
  const meta = STATUS_META[status] || { label: "Not Submitted", variant: "outline" };
  return (
    <Badge variant={meta.variant} className={className}>
      {meta.label}
    </Badge>
  );
}
