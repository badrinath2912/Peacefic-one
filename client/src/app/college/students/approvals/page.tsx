'use client';

import { UserCheck } from 'lucide-react';
import { useState } from 'react';

import { useBatches, useDepartments } from '@/api/queries';
import {
  useApproveRegistration,
  useRejectRegistration,
  useStudentRegistrations,
  type StudentRegistration,
} from '@/api/student-registration-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ReasonDialog } from '@/components/ui/reason-dialog';
import { Select } from '@/components/ui/select';
import { useListParams } from '@/hooks/use-list-params';
import { can } from '@/lib/permissions';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

/**
 * Reviewing students who registered themselves with the college join code.
 *
 * This is the last gate in the flow: registration creates a `User` but no
 * `Student`, and login refuses `pending_approval`, so nobody reaches the portal
 * until someone here supplies the four things an applicant cannot know —
 * department, batch, admission number and admission date. The `Student` record
 * is created by the approval service at that moment, never earlier.
 *
 * **No college id is sent anywhere on this page.** The server resolves the
 * tenant from the token and the repository is `tenantScoped: true`, so another
 * institution's registration is invisible rather than merely forbidden.
 */
export default function StudentApprovalsPage() {
  const { user } = useAuth();
  const mayApprove = can(user?.permissions, 'student:approve');

  const { params, setPage } = useListParams({ limit: 20, sort: 'createdAt' });
  const registrations = useStudentRegistrations(
    { ...params, approvalStatus: 'pending' },
    mayApprove,
  );

  const [reviewing, setReviewing] = useState<StudentRegistration | null>(null);
  const [rejecting, setRejecting] = useState<StudentRegistration | null>(null);

  const reject = useRejectRegistration();

  const columns: Array<Column<StudentRegistration>> = [
    {
      key: 'name',
      header: 'Student',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">
            {row.firstName} {row.lastName}
          </p>
          <p className="truncate text-xs text-muted-foreground">{row.email}</p>
        </div>
      ),
    },
    { key: 'rollNumber', header: 'Roll number', render: (row) => row.rollNumber },
    { key: 'phone', header: 'Phone', render: (row) => row.phone },
    {
      key: 'createdAt',
      header: 'Registered',
      sortable: true,
      render: (row) => formatDate(row.createdAt),
    },
    {
      key: 'approvalStatus',
      header: 'Status',
      render: () => <Badge tone="warning">Awaiting review</Badge>,
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={() => setReviewing(row)}>
            Review
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRejecting(row)}
            disabled={reject.isPending}
          >
            Reject
          </Button>
        </div>
      ),
    },
  ];

  return (
    <RouteGuard permissions={['student:approve']}>
      <PageHeader
        title="Student approvals"
        description="Students who registered with your join code. Approving one creates their student record."
      />

      {registrations.data && registrations.data.items.length === 0 && !registrations.isLoading ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={UserCheck}
              title="Nobody is waiting"
              description="Students who register with your join code and verify their email appear here."
            />
          </CardContent>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rowKey={(row) => row.id}
          rows={registrations.data?.items ?? []}
          pagination={registrations.data?.pagination}
          isLoading={registrations.isLoading}
          isFetching={registrations.isFetching}
          error={registrations.error}
          onPageChange={setPage}
          onRetry={() => void registrations.refetch()}
          emptyTitle="Nobody is waiting"
          emptyDescription="Students who register with your join code appear here."
        />
      )}

      {reviewing ? (
        <ApprovalDialog registration={reviewing} onClose={() => setReviewing(null)} />
      ) : null}

      <ReasonDialog
        open={Boolean(rejecting)}
        title="Reject this registration"
        description={
          rejecting
            ? `${rejecting.firstName} ${rejecting.lastName} will not be able to sign in. This cannot be undone.`
            : undefined
        }
        label="Reason for rejection"
        placeholder="Could not verify the roll number against our records."
        confirmLabel="Reject registration"
        tone="danger"
        // The server requires ten characters; matching it turns a 400 into
        // inline guidance.
        minLength={10}
        isPending={reject.isPending}
        onCancel={() => setRejecting(null)}
        onConfirm={(reason) => {
          if (!rejecting) return;
          reject.mutate({ id: rejecting.id, reason }, { onSuccess: () => setRejecting(null) });
        }}
      />
    </RouteGuard>
  );
}

/**
 * The approval form.
 *
 * Deliberately split into what the student submitted (read-only) and what the
 * institution must decide (editable), because conflating the two invites a
 * reviewer into believing the applicant chose their own batch or admission
 * number.
 *
 * The roll number is the one crossover: the applicant typed it, and a reviewer
 * may correct it before it becomes the permanent record.
 */
function ApprovalDialog({
  registration,
  onClose,
}: {
  registration: StudentRegistration;
  onClose: () => void;
}) {
  const approve = useApproveRegistration();

  const departments = useDepartments({ limit: 100, status: 'active' });
  const [departmentId, setDepartmentId] = useState('');
  // Batches belong to a department, so the list is narrowed once one is chosen
  // and stays empty until then — the server rejects a mismatched pair anyway.
  const batches = useBatches({ limit: 100, departmentId, status: 'active' }, Boolean(departmentId));

  const [batchId, setBatchId] = useState('');
  const [rollNumber, setRollNumber] = useState(registration.rollNumber);
  const [admissionNumber, setAdmissionNumber] = useState('');
  const [admissionDate, setAdmissionDate] = useState('');
  const [touched, setTouched] = useState(false);

  const missing = !departmentId || !batchId || !admissionNumber.trim() || !admissionDate;

  const submit = () => {
    setTouched(true);
    if (missing) return;

    approve.mutate(
      {
        id: registration.id,
        input: {
          departmentId,
          batchId,
          admissionNumber: admissionNumber.trim(),
          admissionDate: new Date(admissionDate),
          rollNumber: rollNumber.trim(),
        } as never,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Approve student registration"
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
    >
      <Card className="max-h-[90dvh] w-full max-w-lg overflow-y-auto p-5">
        <h2 className="text-lg font-semibold">Approve registration</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Approving creates the student record and lets them sign in.
        </p>

        <div className="mt-4 space-y-1 rounded-lg bg-muted p-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Submitted by the student
          </p>
          <p className="font-medium">
            {registration.firstName} {registration.lastName}
          </p>
          <p className="text-muted-foreground">{registration.email}</p>
          <p className="text-muted-foreground">{registration.phone}</p>
          <p className="text-muted-foreground">Registered {formatDate(registration.createdAt)}</p>
        </div>

        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Assigned by your institution
        </p>

        <div className="mt-2 space-y-3">
          <Field label="Department" error={touched && !departmentId ? 'Required' : undefined} required>
            {({ id }) => (
              <Select
                id={id}
                value={departmentId}
                placeholder="Select a department"
                options={(departments.data?.items ?? []).map((d) => ({ value: d.id, label: d.name }))}
                onChange={(event) => {
                  setDepartmentId(event.target.value);
                  // A batch from the previous department would be refused.
                  setBatchId('');
                }}
              />
            )}
          </Field>

          <Field label="Batch" error={touched && !batchId ? 'Required' : undefined} required>
            {({ id }) => (
              <Select
                id={id}
                value={batchId}
                disabled={!departmentId}
                placeholder={departmentId ? 'Select a batch' : 'Choose a department first'}
                options={(batches.data?.items ?? []).map((b) => ({ value: b.id, label: b.name }))}
                onChange={(event) => setBatchId(event.target.value)}
              />
            )}
          </Field>

          <Field label="Roll number" hint="As submitted; correct it if needed." required>
            {({ id }) => (
              <Input id={id} value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} />
            )}
          </Field>

          <Field
            label="Admission number"
            error={touched && !admissionNumber.trim() ? 'Required' : undefined}
            required
          >
            {({ id }) => (
              <Input
                id={id}
                value={admissionNumber}
                onChange={(e) => setAdmissionNumber(e.target.value)}
              />
            )}
          </Field>

          <Field
            label="Admission date"
            error={touched && !admissionDate ? 'Required' : undefined}
            required
          >
            {({ id }) => (
              <Input
                id={id}
                type="date"
                value={admissionDate}
                onChange={(e) => setAdmissionDate(e.target.value)}
              />
            )}
          </Field>
        </div>

        {approve.isError ? (
          <Alert tone="danger" className="mt-4">
            {approve.error.message}
          </Alert>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={approve.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} isLoading={approve.isPending} loadingText="Approving…">
            Approve student
          </Button>
        </div>
      </Card>
    </div>
  );
}
