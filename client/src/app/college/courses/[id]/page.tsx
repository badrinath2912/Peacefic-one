'use client';

import { BookOpen, Clock, GraduationCap, Pencil, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import toast from 'react-hot-toast';

import { useCourseProfile } from '@/api/queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DescriptionList } from '@/components/ui/description-list';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import { apiDelete, type ApiError } from '@/lib/api-client';
import { can } from '@/lib/permissions';
import { formatDate, toTitleCase } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

function relationLabels(value: Array<string | { code?: string; name?: string }>): string | null {
  const labels = value
    .map((entry) => (typeof entry === 'object' ? (entry.code ?? entry.name ?? null) : null))
    .filter(Boolean);

  return labels.length > 0 ? labels.join(', ') : null;
}

export default function CourseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const profile = useCourseProfile(params.id);

  const [pendingDelete, setPendingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (profile.isLoading) return <FullPageSpinner label="Loading course" />;

  if (profile.isError) {
    return (
      <ErrorState
        title="Could not load this course"
        message={profile.error.message}
        requestId={profile.error.requestId}
        onRetry={() => void profile.refetch()}
      />
    );
  }

  if (!profile.data) return <FullPageSpinner label="Loading" />;

  const { course, instructors, dependents } = profile.data;

  async function handleDelete(): Promise<void> {
    setIsDeleting(true);
    try {
      await apiDelete(`/courses/${params.id}`);
      toast.success('Course removed.');
      router.push('/college/courses');
    } catch (error) {
      toast.error((error as ApiError).message);
      setPendingDelete(false);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <RouteGuard permissions={['course:read']}>
      <Breadcrumbs
        items={[{ label: 'Courses', href: '/college/courses' }, { label: course.code }]}
      />

      <PageHeader
        title={course.title}
        description={`${course.code} · ${toTitleCase(course.category)}`}
        actions={
          <>
            {can(user?.permissions, 'course:update') ? (
              <Button variant="outline" asChild>
                <Link href={`/college/courses/${params.id}/edit`}>
                  <Pencil aria-hidden />
                  Edit
                </Link>
              </Button>
            ) : null}

            {can(user?.permissions, 'course:delete') ? (
              <Button variant="danger" onClick={() => setPendingDelete(true)}>
                <Trash2 aria-hidden />
                Delete
              </Button>
            ) : null}
          </>
        }
      />

      {/* Shown up front because it is what will block a delete. */}
      {dependents.length > 0 ? (
        <Card className="mb-4 border-info/40 bg-info-subtle">
          <CardContent className="p-4 text-sm text-info">
            {dependents.map((dependent) => dependent.code).join(', ')} list this course as a
            prerequisite. Remove it from them before deleting.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Enrolled" value={course.stats.enrolledCount} icon={Users} />
        <StatCard label="Modules" value={course.stats.moduleCount} icon={BookOpen} />
        <StatCard label="Duration" value={course.durationHours} suffix=" hrs" icon={Clock} />
        <StatCard label="Credits" value={course.credits ?? '—'} icon={GraduationCap} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList
              items={[
                { label: 'Code', value: course.code },
                { label: 'Category', value: toTitleCase(course.category) },
                { label: 'Level', value: toTitleCase(course.level) },
                { label: 'Semester', value: course.semester },
                { label: 'Departments', value: relationLabels(course.departmentIds) ?? 'College-wide' },
                { label: 'Batches', value: relationLabels(course.batchIds) },
                { label: 'Prerequisites', value: relationLabels(course.prerequisites) },
                { label: 'Published', value: course.publishedAt ? formatDate(course.publishedAt) : null },
                { label: 'Description', value: course.description, full: true },
              ]}
            />

            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={course.status} />
              {course.tags.map((tag) => (
                <Badge key={tag} tone="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Instructors</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {instructors.length > 0 ? (
              <ul className="divide-y divide-border">
                {instructors.map((instructor) => (
                  <li
                    key={instructor.id}
                    className="flex items-center justify-between gap-3 px-5 py-2.5"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/college/faculty/${instructor.id}`}
                        className="truncate text-sm font-medium text-primary hover:underline"
                      >
                        {instructor.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {instructor.designation}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {instructor.employeeId}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Users}
                title="No instructors assigned"
                description="Assign staff from the edit page."
                action={
                  can(user?.permissions, 'course:update') ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/college/courses/${params.id}/edit`}>Assign instructors</Link>
                    </Button>
                  ) : undefined
                }
              />
            )}
          </CardContent>
        </Card>

        {course.learningOutcomes.length > 0 ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Learning outcomes</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-inside list-disc space-y-1 text-sm">
                {course.learningOutcomes.map((outcome) => (
                  <li key={outcome}>{outcome}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <ConfirmDialog
        open={pendingDelete}
        tone="danger"
        title={`Delete ${course.code}?`}
        description={
          dependents.length > 0
            ? `${dependents.map((d) => d.code).join(', ')} depend on this course, so the deletion will be refused.`
            : course.stats.enrolledCount > 0
              ? `This course has ${course.stats.enrolledCount} enrolled student(s). Archive it instead.`
              : 'This course has no dependents and can be removed.'
        }
        confirmLabel="Delete"
        isPending={isDeleting}
        onCancel={() => setPendingDelete(false)}
        onConfirm={() => void handleDelete()}
      />
    </RouteGuard>
  );
}
