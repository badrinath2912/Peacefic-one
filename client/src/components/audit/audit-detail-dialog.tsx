'use client';

import { useEffect, useRef } from 'react';

import type { AuditEntry } from '@/api/audit-queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DescriptionList } from '@/components/ui/description-list';
import {
  AUDIT_CATEGORY_LABELS,
  AUDIT_SEVERITY_LABELS,
  AUDIT_SEVERITY_TONES,
  actionLabel,
} from '@/lib/audit-display';
import { formatDateTime } from '@/lib/utils';

/**
 * One entry in full.
 *
 * `changes` and `metadata` are shown as the server stored them. That is safe
 * because `AuditService` replaces sensitive values with `[redacted]` on the way
 * in — the secret never reaches the collection, so there is nothing here to
 * leak. Request metadata (IP, agent, request id) is shown because it is the
 * point of an audit trail, and only a college administrator can reach this page.
 */
export function AuditDetailDialog({
  entry,
  onClose,
}: {
  entry: AuditEntry | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    if (entry && !element.open) element.showModal();
    else if (!entry && element.open) element.close();
  }, [entry]);

  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="audit-detail-title"
      className="w-[min(42rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-0 text-foreground shadow-overlay backdrop:bg-black/40"
    >
      {entry ? (
        <div className="max-h-[80vh] space-y-4 overflow-y-auto p-6">
          <div className="space-y-1">
            <h2 id="audit-detail-title" className="text-lg font-semibold">
              {actionLabel(entry.action)}
            </h2>
            <p className="font-mono text-xs text-muted-foreground">{entry.action}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{AUDIT_CATEGORY_LABELS[entry.category]}</Badge>
            <Badge tone={AUDIT_SEVERITY_TONES[entry.severity]}>
              {AUDIT_SEVERITY_LABELS[entry.severity]}
            </Badge>
            <Badge tone={entry.outcome === 'success' ? 'success' : 'danger'}>
              {entry.outcome === 'success' ? 'Succeeded' : 'Failed'}
            </Badge>
          </div>

          <DescriptionList
            items={[
              { label: 'When', value: formatDateTime(entry.createdAt) },
              { label: 'User', value: entry.userEmail },
              { label: 'Role', value: entry.userRole },
              { label: 'Subject', value: entry.entity?.type },
              { label: 'Subject name', value: entry.entity?.label },
              { label: 'IP address', value: entry.ip },
              { label: 'Request', value: entry.requestId },
              { label: 'Client', value: entry.userAgent, full: true },
            ]}
          />

          {entry.errorMessage ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Error
              </p>
              <p className="mt-1 text-sm text-danger">{entry.errorMessage}</p>
            </div>
          ) : null}

          {entry.changes && entry.changes.length > 0 ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                What changed
              </p>

              <ul className="mt-2 space-y-2">
                {entry.changes.map((change) => (
                  <li key={change.field} className="rounded-md border border-border p-2.5">
                    <p className="font-mono text-2xs text-muted-foreground">{change.field}</p>
                    <div className="mt-1 grid gap-1 text-sm sm:grid-cols-2">
                      <span className="break-words text-muted-foreground line-through">
                        {formatValue(change.from)}
                      </span>
                      <span className="break-words">{formatValue(change.to)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {entry.metadata && Object.keys(entry.metadata).length > 0 ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Details
              </p>

              <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {Object.entries(entry.metadata).map(([key, value]) => (
                  <div key={key} className="min-w-0">
                    <dt className="font-mono text-2xs text-muted-foreground">{key}</dt>
                    <dd className="break-words text-sm">{formatValue(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

/** Renders a stored value without pretending an object is a string. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}
