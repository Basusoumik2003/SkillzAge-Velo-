import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const FILE_TYPES = new Set(["document", "pdf", "image", "video"]);

const ACCEPT_BY_TYPE = {
  document: ".pdf,.doc,.docx,.md,.txt",
  pdf: ".pdf",
  image: "image/*",
  video: "video/*"
};

// Renders the right submission control for a stage_deliverables.deliverable_type
// (Backend/app/schemas/deliverables.py: DeliverableType). `onSubmit` receives
// { submission_type, submission_text, file } - the parent (DeliverableCard)
// owns the actual submit/upload API calls.
export default function SubmissionInput({ deliverableType, disabled, submitting, onSubmit }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);

  const isFileType = FILE_TYPES.has(deliverableType);
  const submissionType = isFileType
    ? "file"
    : deliverableType === "github_repository"
      ? "github_repository"
      : deliverableType === "url"
        ? "url"
        : "text";

  const canSubmit = isFileType ? Boolean(file) : text.trim().length > 0;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    onSubmit({ submission_type: submissionType, submission_text: text.trim(), file });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-2">
      {isFileType ? (
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_BY_TYPE[deliverableType] || undefined}
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            className="hidden"
            disabled={disabled || submitting}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || submitting}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            {file ? "Change file" : "Choose file"}
          </Button>
          {file ? <span className="truncate text-xs text-muted-foreground">{file.name}</span> : null}
        </div>
      ) : deliverableType === "github_repository" ? (
        <Input
          type="url"
          placeholder="https://github.com/owner/repository"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={disabled || submitting}
        />
      ) : deliverableType === "url" ? (
        <Input
          type="url"
          placeholder="https://..."
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={disabled || submitting}
        />
      ) : (
        <Textarea
          rows={5}
          placeholder="Write your submission here..."
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={disabled || submitting}
        />
      )}

      <Button type="submit" size="sm" disabled={!canSubmit || disabled || submitting} className="justify-self-start">
        {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Submit
      </Button>
    </form>
  );
}
