'use client';

import type { InterviewResultStatus } from '@peacefic/shared';
import { useEffect, useRef, useState } from 'react';

import { useRecordInterviewResult } from '@/api/placement-queries';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { ApiError } from '@/lib/api-client';
import {
  APPLICATION_STATUS_LABELS,
  INTERVIEW_RESULT_OPTIONS,
} from '@/lib/placement-display';

interface Props {
  open: boolean;
  interviewId: string;
  onCancel: () => void;
  onRecorded: () => void;
}

/**
 * Recording how a round went.
 *
 * The outcome values come from `INTERVIEW_RESULT_STATUS`; none is invented. The
 * server answers with a suggested application status, which is shown as a
 * suggestion and never applied — moving the application needs
 * `application:shortlist` or `application:reject` through its own API.
 */
export function ResultDialog({ open, interviewId, onCancel, onRecorded }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const record = useRecordInterviewResult(interviewId);

  const [status, setStatus] = useState<InterviewResultStatus>('cleared');
  const [score, setScore] = useState('');
  const [maxScore, setMaxScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    if (open && !element.open) {
      setStatus('cleared');
      setScore('');
      setMaxScore('');
      setFeedback('');
      setError(null);
      setSuggestion(null);
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  function submit(): void {
    setError(null);

    record.mutate(
      {
        status,
        score: score === '' ? null : Number(score),
        maxScore: maxScore === '' ? null : Number(maxScore),
        feedback: feedback.trim() || null,
        strengths: [],
        improvements: [],
      },
      {
        onSuccess: (result) => {
          // Shown, never applied: the application moves through its own API.
          if (result.suggestedApplicationStatus) {
            setSuggestion(result.suggestedApplicationStatus);
            return;
          }
          onRecorded();
        },
        onError: (cause: ApiError) => setError(cause.message),
      },
    );
  }

  const suggestionLabel = suggestion
    ? (APPLICATION_STATUS_LABELS[suggestion as keyof typeof APPLICATION_STATUS_LABELS] ??
      suggestion.replace(/_/g, ' '))
    : null;

  return (
    <dialog
      ref={dialog}
      onCancel={onCancel}
      onClose={onCancel}
      aria-labelledby="result-title"
      className="w-[min(30rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-0 text-foreground shadow-overlay backdrop:bg-black/40"
    >
      <div className="space-y-4 p-6">
        <div className="space-y-1">
          <h2 id="result-title" className="text-lg font-semibold">
            Record the result
          </h2>
          <p className="text-sm text-muted-foreground">
            This closes the round. It does not move the application.
          </p>
        </div>

        {error ? (
          <Alert tone="danger" title="Could not record the result">
            {error}
          </Alert>
        ) : null}

        {suggestionLabel ? (
          <Alert tone="info" title="Recorded. Suggested next step">
            <span className="block">
              Based on this result, the application would usually move to{' '}
              <span className="font-medium">{suggestionLabel}</span>.
            </span>
            <span className="mt-1 block text-xs opacity-80">
              Nothing has changed on the application. Move it from the application page, which
              needs its own permission.
            </span>
          </Alert>
        ) : null}

        {suggestionLabel ? null : (
          <>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Outcome</span>
              <Select
                value={status}
                onChange={(event) => setStatus(event.target.value as InterviewResultStatus)}
                aria-label="Interview outcome"
                options={INTERVIEW_RESULT_OPTIONS}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Score</span>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={score}
                  onChange={(event) => setScore(event.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-surface px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Out of</span>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={maxScore}
                  onChange={(event) => setMaxScore(event.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-surface px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Feedback</span>
              <textarea
                rows={4}
                maxLength={5000}
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder="How the round went."
                className="flex w-full rounded-md border border-input bg-surface px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {suggestionLabel ? (
            <Button type="button" onClick={onRecorded}>
              Done
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={record.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={submit}
                isLoading={record.isPending}
                loadingText="Recording"
              >
                Record result
              </Button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
