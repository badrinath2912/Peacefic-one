'use client';

import { Download, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { useBulkDeleteStudents, useBulkUpdateStudents, useExportStudents } from '@/api/student-mutations';
import { useBatches, useDepartments } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select } from '@/components/ui/select';
import { can } from '@/lib/permissions';
import { useAuth } from '@/providers/auth-provider';

interface BulkActionBarProps {
  selectedIds: string[];
  onClear: () => void;
  filters: Record<string, unknown>;
}

/**
 * Appears only when something is selected. Every action states the count, so
 * the user always knows the blast radius before they commit.
 */
export function BulkActionBar({ selectedIds, onClear, filters }: BulkActionBarProps) {
  const { user } = useAuth();
  const [pendingDelete, setPendingDelete] = useState(false);

  const bulkUpdate = useBulkUpdateStudents();
  const bulkDelete = useBulkDeleteStudents();
  const exportStudents = useExportStudents();

  const departments = useDepartments({ limit: 100, status: 'active' });
  const batches = useBatches({ limit: 100, status: 'active' });

  const count = selectedIds.length;
  if (count === 0) return null;

  function apply(patch: Record<string, unknown>): void {
    bulkUpdate.mutate(
      { ids: selectedIds, patch },
      { onSuccess: () => onClear() },
    );
  }

  return (
    <>
      <div
        role="region"
        aria-label={`${count} students selected`}
        className="sticky top-14 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary-subtle px-3 py-2"
      >
        <span className="text-sm font-medium text-primary">
          {count} selected
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {can(user?.permissions, 'student:update') ? (
            <>
              <Select
                className="h-8 w-36 text-xs"
                placeholder="Set status"
                value=""
                onChange={(event) => event.target.value && apply({ status: event.target.value })}
                aria-label="Set status for selected students"
                options={[
                  { value: 'active', label: 'Activate' },
                  { value: 'on_leave', label: 'Mark on leave' },
                  { value: 'graduated', label: 'Mark graduated' },
                  { value: 'suspended', label: 'Suspend' },
                ]}
              />

              <Select
                className="h-8 w-40 text-xs"
                placeholder="Move to batch"
                value=""
                onChange={(event) => event.target.value && apply({ batchId: event.target.value })}
                aria-label="Move selected students to a batch"
                options={(batches.data?.items ?? []).map((batch) => ({
                  value: batch.id,
                  label: batch.code,
                }))}
              />

              <Select
                className="h-8 w-44 text-xs"
                placeholder="Move to department"
                value=""
                onChange={(event) =>
                  event.target.value && apply({ departmentId: event.target.value })
                }
                aria-label="Move selected students to a department"
                options={(departments.data?.items ?? []).map((department) => ({
                  value: department.id,
                  label: department.name,
                }))}
              />
            </>
          ) : null}

          {can(user?.permissions, 'student:export') ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportStudents.mutate({ format: 'csv', ids: selectedIds, filters })}
                isLoading={exportStudents.isPending}
              >
                <Download aria-hidden />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportStudents.mutate({ format: 'xlsx', ids: selectedIds, filters })}
              >
                <Download aria-hidden />
                Excel
              </Button>
            </>
          ) : null}

          {can(user?.permissions, 'student:delete') ? (
            <Button variant="danger" size="sm" onClick={() => setPendingDelete(true)}>
              <Trash2 aria-hidden />
              Delete
            </Button>
          ) : null}

          <Button variant="ghost" size="sm" onClick={onClear} aria-label="Clear selection">
            <X aria-hidden />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete}
        tone="danger"
        title={`Delete ${count} student${count === 1 ? '' : 's'}?`}
        description={
          <>
            Their records will be removed from lists and their accounts will stop working.
            Attendance and result history is retained for audit, and the records can be restored
            by an administrator.
          </>
        }
        confirmLabel={`Delete ${count}`}
        // Deleting a cohort is not something to do by muscle memory.
        typeToConfirm={count >= 5 ? 'DELETE' : undefined}
        isPending={bulkDelete.isPending}
        onCancel={() => setPendingDelete(false)}
        onConfirm={() =>
          bulkDelete.mutate(selectedIds, {
            onSuccess: () => {
              setPendingDelete(false);
              onClear();
            },
          })
        }
      />
    </>
  );
}
