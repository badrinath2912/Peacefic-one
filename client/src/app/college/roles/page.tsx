'use client';

import { KeyRound, ShieldAlert, ShieldCheck, Users } from 'lucide-react';
import Link from 'next/link';

import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@/components/ui/table';
import {
  COLLEGE_ROLE_SUMMARIES,
  PORTAL_LABELS,
  SCOPE_LABELS,
} from '@/lib/role-display';

/**
 * The role catalogue.
 *
 * Deliberately read-only, and deliberately makes no request. There is no roles
 * API — no service, controller or route serves `/roles`, and `role:read`,
 * `role:create`, `role:update` and `role:delete` are assigned to college_admin
 * but read by no endpoint. Rendering Edit or Delete here would be a control
 * with nothing behind it.
 *
 * The figures come from `ROLE_DEFINITIONS` and `DEFAULT_ROLE_PERMISSIONS` in
 * `@peacefic/shared` — the same source `seedRoles()` writes into the database,
 * so they are authoritative rather than illustrative.
 */
export default function RolesPage() {
  const roles = COLLEGE_ROLE_SUMMARIES;

  const totalPermissions = roles.reduce(
    (highest, role) => Math.max(highest, role.permissionCount),
    0,
  );

  const dangerous = roles.reduce((highest, role) => Math.max(highest, role.dangerousCount), 0);

  return (
    <RouteGuard permissions={['role:read']}>
      <Breadcrumbs items={[{ label: 'Roles' }]} />

      <PageHeader
        title="Roles"
        description="Who can do what in your college, and the permissions behind each role."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Roles" value={roles.length} icon={ShieldCheck} />
        <StatCard label="Permissions in the catalogue" value={totalPermissions} icon={KeyRound} />
        <StatCard
          label="Sensitive permissions"
          value={dangerous}
          icon={ShieldAlert}
          invertDelta
        />
      </div>

      <Card className="mb-4">
        <CardContent className="p-0">
          <TableWrapper>
            <Table>
              <TableHeader>
                <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
                  <TableHead>Role</TableHead>
                  <TableHead>Reach</TableHead>
                  <TableHead>Portal</TableHead>
                  <TableHead className="text-right">Permissions</TableHead>
                  <TableHead className="text-right">Sensitive</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.key}>
                    <TableCell>
                      <div className="min-w-0">
                        <Link
                          href={`/college/roles/${role.key}`}
                          className="block truncate font-medium text-primary hover:underline"
                        >
                          {role.name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {role.description}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {SCOPE_LABELS[role.scope] ?? role.scope}
                      </span>
                    </TableCell>

                    <TableCell>
                      <Badge tone={role.portal === 'student' ? 'info' : 'neutral'}>
                        {PORTAL_LABELS[role.portal] ?? role.portal}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-right">
                      <span className="tabular">{role.permissionCount}</span>
                    </TableCell>

                    <TableCell className="text-right">
                      {role.dangerousCount > 0 ? (
                        <Badge tone="warning">{role.dangerousCount}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrapper>
        </CardContent>
      </Card>

      {/*
        Said plainly rather than hidden: the roles a college runs on are fixed
        by the platform, and no API exists to change them.
      */}
      <Alert tone="info" title="These roles are fixed">
        <span className="block">
          Peacefic One ships one set of roles for every college, so they cannot be created, renamed
          or deleted here — there is no API to do so.
        </span>
        <span className="mt-1 block">
          Assigning a role to a person is done where that person is managed: a head of department
          from the department page, and staff from{' '}
          <Link href="/college/faculty" className="underline">
            Faculty
          </Link>
          .
        </span>
      </Alert>

      <p className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Users className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>
          Permission counts describe the defaults every college is seeded with. The server checks a
          user’s own stored permissions on every request, so these are a reference rather than the
          live authority.
        </span>
      </p>
    </RouteGuard>
  );
}
