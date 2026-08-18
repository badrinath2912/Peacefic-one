'use client';

import {
  Award,
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LogOut,
  Users,
} from 'lucide-react';
import { useState } from 'react';

import {
  useApproveCollege,
  useCollegesForReview,
  useRejectCollege,
  type CollegeForReview,
} from '@/api/college-queries';
import { usePlatformOverview } from '@/api/platform-queries';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { StatCard } from '@/components/ui/stat-card';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

/**
 * Platform totals across every institution.
 *
 * Each figure comes from the aggregation endpoint exactly as the server
 * computed it — including `attendanceRate`, which arrives as a percentage and
 * is only formatted here. Recomputing any of it on the client would risk the
 * dashboard disagreeing with the per-college views.
 */
function PlatformOverviewCards() {
  const overview = usePlatformOverview();

  if (overview.isError) {
    return (
      <div className="mb-6">
        <ErrorState
          title="Could not load platform metrics"
          message={overview.error.message}
          requestId={overview.error.requestId}
          onRetry={() => void overview.refetch()}
        />
      </div>
    );
  }

  const data = overview.data;

  // `value` is left undefined while loading so `StatCard` shows its skeleton
  // rather than a zero that would read as a real figure.
  const cards = [
    { label: 'Institutions', value: data?.institutions, icon: Building2 },
    { label: 'Students', value: data?.students, icon: GraduationCap },
    { label: 'Faculty', value: data?.faculty, icon: Users },
    { label: 'Examinations', value: data?.examinations, icon: FileText },
    { label: 'Companies', value: data?.companies, icon: Briefcase },
    { label: 'Placements', value: data?.placements, icon: Award },
    { label: 'Training sessions', value: data?.trainingSessions, icon: CalendarDays },
    {
      label: 'Attendance rate',
      // Already a percentage from the server; only the unit is added.
      value: data ? `${data.attendanceRate}%` : undefined,
      icon: ClipboardCheck,
    },
  ] as const;

  return (
    <section className="mb-6" aria-label="Platform totals">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            isLoading={overview.isLoading}
          />
        ))}
      </div>
    </section>
  );
}

const STATUS_TONE = {
  pending: 'warning',
  active: 'success',
  suspended: 'danger',
  rejected: 'neutral',
} as const;

const STATUS_LABEL = {
  pending: 'Awaiting review',
  active: 'Approved',
  suspended: 'Suspended',
  rejected: 'Rejected',
} as const;

/**
 * College registration review — the other half of public sign-up.
 *
 * A registration is created `pending`, and login is refused while it stays that
 * way, so without this screen every institution that signed up would sit in a
 * queue nobody could clear.
 */
export default function AdminPage() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<'pending' | 'all'>('pending');

  const colleges = useCollegesForReview({
    limit: 50,
    sort: '-createdAt',
    ...(tab === 'pending' ? { status: 'pending' } : {}),
  });

  const items = colleges.data?.items ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Peacefic One · Platform"
        title="Institution registrations"
        description="Review and approve colleges applying to join the platform. Approving one lets its administrator sign in."
        actions={
          <div className="flex items-center gap-3">
            {/* Identity belongs beside the sign-out control, not in the page
                description — the description should describe the page. */}
            {user?.email ? <span className="type-caption hidden sm:inline">{user.email}</span> : null}
            <Button variant="outline" size="sm" onClick={() => void logout()}>
              <LogOut className="size-4" aria-hidden />
              Sign out
            </Button>
          </div>
        }
      />

      <PlatformOverviewCards />

      <div className="mb-4 flex gap-2" role="tablist" aria-label="Registration filter">
        {(['pending', 'all'] as const).map((value) => (
          <Button
            key={value}
            role="tab"
            aria-selected={tab === value}
            variant={tab === value ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setTab(value)}
          >
            {value === 'pending' ? 'Awaiting review' : 'All institutions'}
          </Button>
        ))}
      </div>

      {colleges.isError ? (
        <ErrorState
          title="Could not load registrations"
          message="Something went wrong while fetching them."
          requestId={colleges.error.requestId}
          onRetry={() => void colleges.refetch()}
        />
      ) : colleges.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-32 w-full rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Building2}
              title={tab === 'pending' ? 'Nothing awaiting review' : 'No institutions yet'}
              description={
                tab === 'pending'
                  ? 'New registrations from the public sign-up page appear here.'
                  : 'Institutions appear here once they register.'
              }
            />
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((college) => (
            <li key={college.id}>
              <CollegeCard college={college} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function CollegeCard({ college }: { college: CollegeForReview }) {
  const approve = useApproveCollege();
  const reject = useRejectCollege();

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const busy = approve.isPending || reject.isPending;
  // The server requires 10 characters; matching it here turns a 400 into
  // inline guidance instead of a toast after the fact.
  const reasonTooShort = reason.trim().length < 10;

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="type-h4">{college.name}</h2>
            <Badge tone={STATUS_TONE[college.status]}>{STATUS_LABEL[college.status]}</Badge>
          </div>

          <p className="type-body-sm text-muted-foreground">
            {college.code} · {college.type.replace(/_/g, ' ')} · Established{' '}
            {college.establishedYear}
            {college.address ? ` · ${college.address.city}, ${college.address.state}` : ''}
          </p>

          <p className="type-caption">
            {college.email} · {college.phone} · Registered {formatDate(college.createdAt)}
          </p>

          {college.primaryContact ? (
            <p className="type-caption">
              Contact: {college.primaryContact.name} ({college.primaryContact.designation}) ·{' '}
              {college.primaryContact.email}
            </p>
          ) : null}

          {college.status === 'rejected' && college.rejectionReason ? (
            <p className="text-xs text-danger">Reason: {college.rejectionReason}</p>
          ) : null}
        </div>

        {college.status === 'pending' ? (
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              isLoading={approve.isPending}
              disabled={busy}
              onClick={() => approve.mutate({ id: college.id })}
            >
              Approve
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setRejecting((open) => !open)}
            >
              Reject
            </Button>
          </div>
        ) : null}
      </div>

      {rejecting && college.status === 'pending' ? (
        <div className="mt-4 border-t pt-4">
          <Field
            label="Reason for rejection"
            hint="Shown to the applicant. At least 10 characters."
            required
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Could not verify the affiliation certificate."
              />
            )}
          </Field>

          <div className="mt-3 flex gap-2">
            <Button
              variant="danger"
              size="sm"
              isLoading={reject.isPending}
              disabled={busy || reasonTooShort}
              onClick={() =>
                reject.mutate(
                  { id: college.id, reason: reason.trim() },
                  { onSuccess: () => setRejecting(false) },
                )
              }
            >
              Confirm rejection
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
