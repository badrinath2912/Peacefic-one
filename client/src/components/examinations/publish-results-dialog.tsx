'use client';

import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { MarksEntry } from '@/api/examination-queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { personName } from '@/lib/examination-display';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  entries: MarksEntry[];
  isPending: boolean;
  onConfirm: (payload: { reason?: string; withholdStudentIds: string[] }) => void;
  onCancel: () => void;
}

/**
 * Publication with an explicit withhold list.
 *
 * Withholding is not deletion: a withheld student keeps the mark that was
 * computed for them and is simply left out of the release, which is how a
 * pending disciplinary or fee matter is handled without destroying a legitimate
 * result. The dialog says so, because the two are easy to confuse.
 */
export function PublishResultsDialog({ open, entries, isPending, onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [withheld, setWithheld] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      setWithheld([]);
      setReason('');
      setSearch('');
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return entries
      .map((entry) => ({
        entry,
        studentId:
          typeof entry.studentId === 'string' ? entry.studentId : entry.studentId.id,
        rollNumber:
          typeof entry.studentId === 'string' ? entry.studentId : entry.studentId.rollNumber,
        name: personName(entry.studentId),
      }))
      .filter(
        (row) =>
          !term ||
          row.rollNumber.toLowerCase().includes(term) ||
          row.name.toLowerCase().includes(term),
      );
  }, [entries, search]);

  const releasing = entries.length - withheld.length;

  function toggle(studentId: string): void {
    setWithheld((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    );
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClose={onCancel}
      className="w-[min(44rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-0 text-popover-foreground shadow-overlay backdrop:bg-black/50"
      aria-labelledby="publish-title"
    >
      <div className="space-y-4 p-6">
        <div className="space-y-1">
          <h2 id="publish-title" className="font-semibold">
            Publish results
          </h2>
          <p className="text-sm text-muted-foreground">
            Every candidate below will be able to see their grade, and each will be notified. Marks
            become locked — changing one afterwards needs a reasoned correction.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-sunken px-3 py-2 text-sm">
          <span>
            Releasing to <strong className="tabular">{releasing}</strong>
          </span>
          {withheld.length > 0 ? (
            <Badge tone="warning">{withheld.length} withheld</Badge>
          ) : (
            <span className="text-muted-foreground">Nobody withheld</span>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="withhold-search" className="text-sm font-medium">
              Withhold specific candidates
            </label>
            {withheld.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setWithheld([])}>
                Clear
              </Button>
            ) : null}
          </div>

          <Input
            id="withhold-search"
            type="search"
            placeholder="Search roll number or name"
            leadingIcon={<Search />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <ul className="scrollbar-thin max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {rows.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nobody matches that search.
              </li>
            ) : (
              rows.map((row) => {
                const isWithheld = withheld.includes(row.studentId);

                return (
                  <li key={row.studentId}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted',
                        isWithheld && 'bg-warning-subtle',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
                        checked={isWithheld}
                        onChange={() => toggle(row.studentId)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{row.rollNumber}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {row.name}
                        </span>
                      </span>
                      <Badge tone={row.entry.isPass ? 'success' : 'danger'}>
                        {row.entry.letter}
                      </Badge>
                      <span className="tabular w-14 text-right text-xs text-muted-foreground">
                        {row.entry.percentage}%
                      </span>
                    </label>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">
            Reason <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <textarea
            rows={2}
            value={reason}
            placeholder="Recorded in the publication history."
            onChange={(event) => setReason(event.target.value)}
            className="flex w-full rounded-md border border-input bg-surface px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        {withheld.length > 0 ? (
          <p className="text-xs text-warning">
            Withheld candidates keep their marks. They are excluded from this release and can be
            published later.
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onConfirm({ reason: reason.trim() || undefined, withholdStudentIds: withheld })
            }
            isLoading={isPending}
            loadingText="Publishing"
            disabled={releasing === 0}
          >
            Publish to {releasing}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
