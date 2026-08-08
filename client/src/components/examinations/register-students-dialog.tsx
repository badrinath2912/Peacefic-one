'use client';

import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useBatches, useStudents } from '@/api/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useDebouncedSearch } from '@/hooks/use-list-params';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  /** Batches the exam is scoped to; the batch shortcut offers only these. */
  examBatchIds: string[];
  alreadyRegistered: Set<string>;
  isPending: boolean;
  onConfirm: (payload: { studentIds: string[]; batchIds: string[] }) => void;
  onCancel: () => void;
}

/**
 * Registration by batch or by name.
 *
 * Batches are the normal path — a semester exam takes whole sections — and the
 * individual picker covers the exceptions: a repeat candidate from an earlier
 * batch, or someone added late. Students already registered are shown but not
 * selectable, because the server skips them anyway and a silent skip reads as
 * a failure.
 */
export function RegisterStudentsDialog({
  open,
  examBatchIds,
  alreadyRegistered,
  isPending,
  onConfirm,
  onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  // Debounced so typing a roll number does not fire a request per keystroke.
  const search = useDebouncedSearch(useCallback((value: string) => setQuery(value), []));

  const batches = useBatches({ limit: 200, status: 'active' });
  const students = useStudents({
    limit: 200,
    status: 'active',
    search: query.trim() || undefined,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      setSelectedBatches([]);
      setSelectedStudents([]);
      setQuery('');
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const batchOptions = useMemo(
    () => (batches.data?.items ?? []).filter((batch) => examBatchIds.includes(batch.id)),
    [batches.data, examBatchIds],
  );

  const total = selectedBatches.length + selectedStudents.length;

  function toggle(list: string[], setList: (next: string[]) => void, id: string): void {
    setList(list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id]);
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClose={onCancel}
      className="w-[min(40rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-0 text-popover-foreground shadow-overlay backdrop:bg-black/50"
      aria-labelledby="register-title"
    >
      <div className="space-y-4 p-6">
        <div className="space-y-1">
          <h2 id="register-title" className="font-semibold">
            Register candidates
          </h2>
          <p className="text-sm text-muted-foreground">
            Each gets a hall ticket number. A student sitting the same course again is registered
            as the next attempt automatically.
          </p>
        </div>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Whole batches</h3>

          {batchOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This exam names no batches, so register candidates individually below.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {batchOptions.map((batch) => {
                const selected = selectedBatches.includes(batch.id);

                return (
                  <button
                    key={batch.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggle(selectedBatches, setSelectedBatches, batch.id)}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-sm transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected
                        ? 'border-primary bg-primary-subtle text-primary'
                        : 'border-border hover:bg-muted',
                    )}
                  >
                    {batch.code}
                    <span className="ml-1.5 text-xs text-muted-foreground">{batch.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Individual candidates</h3>

          <Input
            type="search"
            placeholder="Search roll number or name"
            leadingIcon={<Search />}
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            aria-label="Search students"
          />

          <ul className="scrollbar-thin max-h-52 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {students.isLoading ? (
              <li className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Spinner />
                Loading students
              </li>
            ) : (students.data?.items ?? []).length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                No active students match that search.
              </li>
            ) : (
              (students.data?.items ?? []).map((student) => {
                const registered = alreadyRegistered.has(student.id);
                const selected = selectedStudents.includes(student.id);

                return (
                  <li key={student.id}>
                    <label
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 text-sm',
                        registered ? 'opacity-60' : 'cursor-pointer hover:bg-muted',
                        selected && 'bg-primary-subtle',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
                        checked={selected}
                        disabled={registered}
                        onChange={() => toggle(selectedStudents, setSelectedStudents, student.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{student.rollNumber}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {typeof student.userId === 'object' ? student.userId.fullName : ''}
                        </span>
                      </span>
                      {registered ? <Badge tone="neutral">Registered</Badge> : null}
                    </label>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? 'Nothing selected yet.'
              : `${selectedBatches.length} batch(es) and ${selectedStudents.length} individual(s).`}
          </p>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel} disabled={isPending}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                onConfirm({ studentIds: selectedStudents, batchIds: selectedBatches })
              }
              disabled={total === 0}
              isLoading={isPending}
              loadingText="Registering"
            >
              Register
            </Button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
