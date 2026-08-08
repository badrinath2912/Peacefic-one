'use client';

import { useEffect, useRef, useState } from 'react';

import { useApplyToJob } from '@/api/placement-queries';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';

interface Props {
  open: boolean;
  jobId: string;
  jobTitle: string;
  companyName: string;
  onCancel: () => void;
  onApplied?: () => void;
}

/**
 * Applying to a drive.
 *
 * The student's identity comes from the token, so nothing here names them.
 * Eligibility, the application window and duplicates are all decided by the
 * server on submit — this dialog reports what it says rather than pre-judging
 * any of them.
 */
export function ApplyDialog({
  open,
  jobId,
  jobTitle,
  companyName,
  onCancel,
  onApplied,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | undefined>();

  const apply = useApplyToJob(jobId);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    if (open && !element.open) {
      setCoverLetter('');
      setError(null);
      setRequestId(undefined);
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  function submit(): void {
    setError(null);
    setRequestId(undefined);

    apply.mutate(
      { coverLetter: coverLetter.trim() || null, answers: [] },
      {
        onSuccess: () => onApplied?.(),
        onError: (cause: ApiError) => {
          setError(cause.message);
          setRequestId(cause.requestId);
        },
      },
    );
  }

  return (
    <dialog
      ref={dialog}
      onCancel={onCancel}
      onClose={onCancel}
      aria-labelledby="apply-dialog-title"
      className="w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-0 text-foreground shadow-overlay backdrop:bg-black/40"
    >
      <div className="space-y-4 p-6">
        <div className="space-y-1">
          <h2 id="apply-dialog-title" className="text-lg font-semibold">
            Apply to {jobTitle}?
          </h2>
          <p className="text-sm text-muted-foreground">
            {companyName}. Your application goes to the placement office with the academic record
            they hold for you.
          </p>
        </div>

        {error ? (
          <Alert tone="danger" title="Could not apply">
            {error}
            {requestId ? (
              <span className="mt-1 block font-mono text-2xs opacity-70">
                Reference: {requestId}
              </span>
            ) : null}
          </Alert>
        ) : null}

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Note to the recruiter (optional)</span>
          <textarea
            rows={5}
            maxLength={5000}
            value={coverLetter}
            onChange={(event) => setCoverLetter(event.target.value)}
            placeholder="Why this role, and anything the office should pass on."
            className="flex w-full rounded-md border border-input bg-surface px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="block text-xs text-muted-foreground">
            {coverLetter.length} of 5000 characters.
          </span>
        </label>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={apply.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            isLoading={apply.isPending}
            loadingText="Applying"
          >
            Apply
          </Button>
        </div>
      </div>
    </dialog>
  );
}
