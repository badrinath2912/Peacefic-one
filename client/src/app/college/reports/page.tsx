'use client';

import {
  Award,
  BookOpen,
  Briefcase,
  Building2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Users,
} from 'lucide-react';
import { useState } from 'react';

import { useExportExams, useExaminationAnalytics } from '@/api/examination-queries';
import {
  useApplicationAnalytics,
  useCompanyAnalytics,
  useExportApplications,
  useExportCompanies,
  useExportJobPostings,
  useExportPlacements,
  useInterviewAnalytics,
  useJobAnalytics,
  usePlacementAnalytics,
} from '@/api/placement-queries';
import { useExportBatches, useExportCourses, useExportDepartments } from '@/api/admin-mutations';
import { useExportFaculty } from '@/api/faculty-mutations';
import { useCourseAnalytics } from '@/api/queries';
import { useExportStudents } from '@/api/student-mutations';
import { useTrainingAnalytics } from '@/api/training-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { ReportSection, type ReportFigure } from '@/components/reports/report-section';
import { Alert } from '@/components/ui/alert';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { can } from '@/lib/permissions';
import { formatCtc } from '@/lib/placement-display';
import { useAuth } from '@/providers/auth-provider';

/** The last handful of academic years, newest first. */
function academicYearOptions(): Array<{ value: string; label: string }> {
  const now = new Date();
  // An academic year turns over in June.
  const startYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;

  return Array.from({ length: 5 }, (_, index) => {
    const start = startYear - index;
    const value = `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
    return { value, label: value };
  });
}

/**
 * College reports.
 *
 * There is no report service on the server: `report:generate` and
 * `report:export` are defined in the catalogue but no route reads them. What
 * does exist is a set of per-module analytics and export endpoints, each gated
 * on that module's own permission. So this page is an index over those, and
 * every request is gated on the permission the server actually enforces —
 * `report:generate` decides who reaches the page, not what they may read.
 *
 * Nothing here is recomputed. Every figure is rendered as the server returned it.
 */
export default function ReportsPage() {
  const { user } = useAuth();
  const [academicYear, setAcademicYear] = useState('');

  const permissions = user?.permissions;

  /** What the server checks for each analytics endpoint. */
  const mayPlacementReport = can(permissions, 'placement:report');
  const mayReadApplications = can(permissions, 'application:read_all');
  const mayReadInterviews = can(permissions, 'interview:read_all');
  const mayReadCompanies = can(permissions, 'company:read');
  const mayReadJobs = can(permissions, 'job:read');
  const mayReadExams = can(permissions, 'exam:read');
  const mayReadCourses = can(permissions, 'course:read');
  const mayReadTraining = can(permissions, 'training:read');

  /**
   * Exporting needs both: `report:export` because that is what this feature
   * means in the catalogue, and the module's own permission because that is
   * what the server enforces. Either alone would be half a gate.
   */
  const mayExport = can(permissions, 'report:export');
  const mayExportStudents = mayExport && can(permissions, 'student:export');
  const mayExportFaculty = mayExport && can(permissions, 'faculty:read');
  const mayExportDepartments = mayExport && can(permissions, 'department:read');
  const mayExportBatches = mayExport && can(permissions, 'batch:read');
  const mayExportCourses = mayExport && mayReadCourses;
  const mayExportExams = mayExport && mayReadExams;
  const mayExportCompanies = mayExport && mayReadCompanies;
  const mayExportJobs = mayExport && mayReadJobs;
  const mayExportApplications = mayExport && mayReadApplications;
  const mayExportPlacements = mayExport && can(permissions, 'placement:read_all');

  /** Only `/placements/analytics` accepts a filter; the rest take none. */
  const placementFilters = academicYear ? { academicYear } : {};

  const placement = usePlacementAnalytics(placementFilters, mayPlacementReport);
  const applications = useApplicationAnalytics({}, mayReadApplications);
  const interviews = useInterviewAnalytics({}, mayReadInterviews);
  const companies = useCompanyAnalytics(mayReadCompanies);
  const jobs = useJobAnalytics(mayReadJobs);
  const exams = useExaminationAnalytics(mayReadExams);
  const courses = useCourseAnalytics(mayReadCourses);
  const training = useTrainingAnalytics(mayReadTraining);

  const exportStudents = useExportStudents();
  const exportFaculty = useExportFaculty();
  const exportDepartments = useExportDepartments();
  const exportBatches = useExportBatches();
  const exportCourses = useExportCourses();
  const exportExams = useExportExams();
  const exportCompanies = useExportCompanies();
  const exportJobs = useExportJobPostings();
  const exportApplications = useExportApplications();
  const exportPlacements = useExportPlacements();

  const placementFigures: ReportFigure[] = placement.data
    ? [
        { label: 'Offers made', value: placement.data.totalOffers },
        { label: 'Accepted', value: placement.data.accepted },
        { label: 'Joined', value: placement.data.joined },
        { label: 'Students placed', value: placement.data.placedStudents },
        { label: 'Placement rate', value: `${placement.data.placementPercentage}%` },
        { label: 'Highest package', value: formatCtc(placement.data.highestCtc) },
        { label: 'Median package', value: formatCtc(placement.data.medianCtc) },
        { label: 'Average package', value: formatCtc(placement.data.averageCtc) },
      ]
    : [];

  const applicationFigures: ReportFigure[] = applications.data
    ? [
        { label: 'Applications', value: applications.data.total },
        { label: 'Shortlisted', value: applications.data.shortlisted },
        { label: 'In process', value: applications.data.inProcess },
        { label: 'Selected', value: applications.data.selected },
        { label: 'Rejected', value: applications.data.rejected },
        { label: 'Conversion', value: `${applications.data.conversionRate}%` },
      ]
    : [];

  const interviewFigures: ReportFigure[] = interviews.data
    ? [
        { label: 'Interviews', value: interviews.data.total },
        { label: 'Upcoming', value: interviews.data.upcoming },
        { label: 'Completed', value: interviews.data.completed },
        { label: 'Cleared', value: interviews.data.cleared },
        { label: 'Awaiting result', value: interviews.data.pendingResult },
        { label: 'Did not attend', value: interviews.data.noShow },
      ]
    : [];

  const recruiterFigures: ReportFigure[] = [
    ...(companies.data
      ? [
          { label: 'Companies', value: companies.data.total },
          { label: 'Active', value: companies.data.active },
          { label: 'Verified', value: companies.data.verified },
        ]
      : []),
    ...(jobs.data
      ? [
          { label: 'Drives', value: jobs.data.total },
          { label: 'Accepting applications', value: jobs.data.open },
          { label: 'Total openings', value: jobs.data.totalOpenings },
        ]
      : []),
  ];

  const examFigures: ReportFigure[] = exams.data
    ? [
        { label: 'Examinations', value: exams.data.total },
        { label: 'Upcoming', value: exams.data.upcoming },
        { label: 'Awaiting marks', value: exams.data.awaitingMarks },
        { label: 'Published', value: exams.data.published },
        { label: 'Pass rate', value: `${exams.data.passRate}%` },
        { label: 'Average', value: `${exams.data.averagePercent}%` },
      ]
    : [];

  const courseFigures: ReportFigure[] = courses.data
    ? [
        { label: 'Courses', value: courses.data.total },
        { label: 'Published', value: courses.data.published },
        { label: 'Draft', value: courses.data.draft },
      ]
    : [];

  const trainingFigures: ReportFigure[] = training.data
    ? [
        { label: 'Sessions', value: training.data.sessions.total },
        { label: 'Upcoming', value: training.data.sessions.upcoming },
        { label: 'Completed', value: training.data.sessions.completed },
        { label: 'Requests', value: training.data.requests.total },
        { label: 'Awaiting approval', value: training.data.requests.pending },
        { label: 'Completion rate', value: `${training.data.completion.completionRate}%` },
      ]
    : [];

  /** Whether the caller can see anything at all beyond the page itself. */
  const anySection =
    mayPlacementReport ||
    mayReadApplications ||
    mayReadInterviews ||
    mayReadCompanies ||
    mayReadJobs ||
    mayReadExams ||
    mayReadCourses ||
    mayReadTraining ||
    mayExportStudents ||
    mayExportFaculty ||
    mayExportDepartments ||
    mayExportBatches;

  return (
    <RouteGuard permissions={['report:generate']}>
      <Breadcrumbs items={[{ label: 'Reports' }]} />

      <PageHeader
        title="Reports"
        description="Figures and exports across the college, as far as your access allows."
        actions={
          mayPlacementReport ? (
            <Select
              value={academicYear}
              onChange={(event) => setAcademicYear(event.target.value)}
              aria-label="Filter placement figures by academic year"
              placeholder="All years"
              options={academicYearOptions()}
            />
          ) : null
        }
      />

      {!mayExport ? (
        <Alert tone="info" title="Exporting is not available to you" className="mb-4">
          The figures below are still yours to read. Downloading them needs the report export
          permission.
        </Alert>
      ) : null}

      {!anySection ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No reports are available to you"
          description="Reporting draws on each module you can access. Yours does not currently include any of them — speak to your college administrator."
        />
      ) : (
        <div className="space-y-4">
          <ReportSection
            title="Placement"
            description={
              academicYear
                ? `Offers and outcomes for ${academicYear}.`
                : 'Offers and outcomes across every recorded year.'
            }
            icon={Award}
            visible={mayPlacementReport}
            figures={placementFigures}
            isLoading={placement.isLoading}
            error={placement.error}
            onRetry={() => void placement.refetch()}
            exports={
              mayExportPlacements
                ? [
                    {
                      label: 'Offers',
                      isPending: exportPlacements.isPending,
                      onExport: (format) =>
                        exportPlacements.mutate({ format, filters: placementFilters }),
                    },
                  ]
                : []
            }
          />

          <ReportSection
            title="Applications"
            description="Where candidates sit in the pipeline."
            icon={ClipboardList}
            visible={mayReadApplications}
            figures={applicationFigures}
            isLoading={applications.isLoading}
            error={applications.error}
            onRetry={() => void applications.refetch()}
            exports={
              mayExportApplications
                ? [
                    {
                      label: 'Applications',
                      isPending: exportApplications.isPending,
                      onExport: (format) => exportApplications.mutate({ format }),
                    },
                  ]
                : []
            }
          />

          <ReportSection
            title="Interviews"
            description="Rounds scheduled and how they resolved."
            icon={Users}
            visible={mayReadInterviews}
            figures={interviewFigures}
            isLoading={interviews.isLoading}
            error={interviews.error}
            onRetry={() => void interviews.refetch()}
            exports={[]}
          />

          <ReportSection
            title="Recruiters and drives"
            description="The companies you work with and the roles they posted."
            icon={Building2}
            visible={mayReadCompanies || mayReadJobs}
            figures={recruiterFigures}
            isLoading={
              (mayReadCompanies && companies.isLoading) || (mayReadJobs && jobs.isLoading)
            }
            error={companies.error ?? jobs.error}
            onRetry={() => {
              if (mayReadCompanies) void companies.refetch();
              if (mayReadJobs) void jobs.refetch();
            }}
            exports={[
              ...(mayExportCompanies
                ? [
                    {
                      label: 'Companies',
                      isPending: exportCompanies.isPending,
                      onExport: (format: 'csv' | 'xlsx') =>
                        exportCompanies.mutate({ format }),
                    },
                  ]
                : []),
              ...(mayExportJobs
                ? [
                    {
                      label: 'Drives',
                      isPending: exportJobs.isPending,
                      onExport: (format: 'csv' | 'xlsx') => exportJobs.mutate({ format }),
                    },
                  ]
                : []),
            ]}
          />

          <ReportSection
            title="Examinations"
            description="Sittings held and results published."
            icon={GraduationCap}
            visible={mayReadExams}
            figures={examFigures}
            isLoading={exams.isLoading}
            error={exams.error}
            onRetry={() => void exams.refetch()}
            exports={
              mayExportExams
                ? [
                    {
                      label: 'Examinations',
                      isPending: exportExams.isPending,
                      onExport: (format) => exportExams.mutate({ format }),
                    },
                  ]
                : []
            }
          />

          <ReportSection
            title="Courses"
            description="The catalogue as it stands."
            icon={BookOpen}
            visible={mayReadCourses}
            figures={courseFigures}
            isLoading={courses.isLoading}
            error={courses.error}
            onRetry={() => void courses.refetch()}
            exports={
              mayExportCourses
                ? [
                    {
                      label: 'Courses',
                      isPending: exportCourses.isPending,
                      onExport: (format) => exportCourses.mutate({ format }),
                    },
                  ]
                : []
            }
          />

          <ReportSection
            title="Training"
            description="Sessions run and requests raised."
            icon={Briefcase}
            visible={mayReadTraining}
            figures={trainingFigures}
            isLoading={training.isLoading}
            error={training.error}
            onRetry={() => void training.refetch()}
            exports={[]}
          />

          {/*
            Institution exports have no analytics endpoint behind them — there
            is no `/students/analytics` — so this section offers the downloads
            alone rather than inventing figures to sit above them.
          */}
          {mayExportStudents ||
          mayExportFaculty ||
          mayExportDepartments ||
          mayExportBatches ? (
            <ReportSection
              title="Institution records"
              description="Full extracts. These have no summary endpoint behind them, so they are downloads only."
              icon={FileSpreadsheet}
              visible
              figures={[]}
              exports={[
                ...(mayExportStudents
                  ? [
                      {
                        label: 'Students',
                        isPending: exportStudents.isPending,
                        onExport: (format: 'csv' | 'xlsx') => exportStudents.mutate({ format }),
                      },
                    ]
                  : []),
                ...(mayExportFaculty
                  ? [
                      {
                        label: 'Faculty',
                        isPending: exportFaculty.isPending,
                        onExport: (format: 'csv' | 'xlsx') => exportFaculty.mutate({ format }),
                      },
                    ]
                  : []),
                ...(mayExportDepartments
                  ? [
                      {
                        label: 'Departments',
                        isPending: exportDepartments.isPending,
                        onExport: (format: 'csv' | 'xlsx') => exportDepartments.mutate({ format }),
                      },
                    ]
                  : []),
                ...(mayExportBatches
                  ? [
                      {
                        label: 'Batches',
                        isPending: exportBatches.isPending,
                        onExport: (format: 'csv' | 'xlsx') => exportBatches.mutate({ format }),
                      },
                    ]
                  : []),
              ]}
            />
          ) : null}

          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">
                <Download className="mr-1 inline size-3" aria-hidden />
                Exports are generated by the server and neutralise spreadsheet formula injection.
                Each download covers only the records your access allows.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </RouteGuard>
  );
}
