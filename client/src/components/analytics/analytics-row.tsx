'use client';

import { useBatchAnalytics, useDepartmentAnalytics } from '@/api/queries';
import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';

/**
 * One row of the comparison, fetching its own figures.
 *
 * The API is per-id — there is no endpoint returning several departments at
 * once — so each row owns its request. That keeps a department the caller
 * cannot reach from failing the whole table: `assertCanAccessDepartment` denies
 * that row alone, and the rest still render.
 *
 * Every figure below is rendered exactly as the server computed it. Nothing is
 * summed, averaged or derived here.
 */

function Figure({ value }: { value: number | string | null }) {
  return (
    <TableCell className="text-right">
      <span className="tabular">{value === null ? '—' : value}</span>
    </TableCell>
  );
}

function LoadingCells({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <TableCell key={index} className="text-right">
          <div className="skeleton ml-auto h-4 w-10 rounded" />
        </TableCell>
      ))}
    </>
  );
}

export function DepartmentAnalyticsRow({
  id,
  name,
  code,
  enabled,
}: {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
}) {
  const analytics = useDepartmentAnalytics(enabled ? id : '');

  return (
    <TableRow>
      <TableCell>
        <div className="min-w-0">
          <p className="truncate font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{code}</p>
        </div>
      </TableCell>

      {analytics.isLoading ? (
        <LoadingCells count={6} />
      ) : analytics.isError ? (
        <TableCell colSpan={6}>
          {/* A denied department is a scope decision, not a page failure. */}
          <span className="text-xs text-muted-foreground">
            {analytics.error.statusCode === 403 || analytics.error.statusCode === 404
              ? 'Not visible to you'
              : analytics.error.message}
          </span>
        </TableCell>
      ) : analytics.data ? (
        <>
          <Figure value={analytics.data.totalStudents} />
          <Figure value={analytics.data.totalBatches} />
          <Figure value={analytics.data.totalFaculty} />
          <Figure value={analytics.data.placedStudents} />
          <TableCell className="text-right">
            <Badge tone={analytics.data.placementRate >= 50 ? 'success' : 'neutral'}>
              {analytics.data.placementRate}%
            </Badge>
          </TableCell>
          <Figure value={analytics.data.averageCgpa} />
        </>
      ) : (
        <LoadingCells count={6} />
      )}
    </TableRow>
  );
}

export function BatchAnalyticsRow({
  id,
  name,
  code,
  enabled,
}: {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
}) {
  const analytics = useBatchAnalytics(enabled ? id : '');

  return (
    <TableRow>
      <TableCell>
        <div className="min-w-0">
          <p className="truncate font-medium">{code}</p>
          <p className="truncate text-xs text-muted-foreground">{name}</p>
        </div>
      </TableCell>

      {analytics.isLoading ? (
        <LoadingCells count={6} />
      ) : analytics.isError ? (
        <TableCell colSpan={6}>
          <span className="text-xs text-muted-foreground">
            {analytics.error.statusCode === 403 || analytics.error.statusCode === 404
              ? 'Not visible to you'
              : analytics.error.message}
          </span>
        </TableCell>
      ) : analytics.data ? (
        <>
          <Figure value={analytics.data.batch.currentSemester} />
          <Figure value={analytics.data.totalStudents} />
          <Figure value={analytics.data.capacity} />
          <TableCell className="text-right">
            <span className="tabular">{analytics.data.utilisation}%</span>
          </TableCell>
          <Figure value={analytics.data.placedStudents} />
          <TableCell className="text-right">
            <Badge tone={analytics.data.placementRate >= 50 ? 'success' : 'neutral'}>
              {analytics.data.placementRate}%
            </Badge>
          </TableCell>
        </>
      ) : (
        <LoadingCells count={6} />
      )}
    </TableRow>
  );
}
