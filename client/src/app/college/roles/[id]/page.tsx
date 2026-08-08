'use client';

import { ArrowLeft, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DescriptionList } from '@/components/ui/description-list';
import { EmptyState } from '@/components/ui/empty-state';
import {
  PORTAL_LABELS,
  SCOPE_LABELS,
  permissionsByModule,
  permissionsFor,
  roleSummary,
} from '@/lib/role-display';

/**
 * One role and everything it may do.
 *
 * The permission list is grouped by the module the catalogue assigns each entry
 * to, and every description is the catalogue's own — no wording is invented
 * here, and no permission is listed that `PERMISSION_DEFINITIONS` does not
 * define.
 */
export default function RoleDetailPage() {
  const params = useParams<{ id: string }>();
  const role = roleSummary(params.id);

  if (!role) {
    return (
      <RouteGuard permissions={['role:read']}>
        <Breadcrumbs
          items={[{ label: 'Roles', href: '/college/roles' }, { label: 'Not found' }]}
        />

        <EmptyState
          title="No such role"
          description="Peacefic One ships a fixed set of roles, and this is not one of them."
          action={
            <Button size="sm" asChild>
              <Link href="/college/roles">All roles</Link>
            </Button>
          }
        />
      </RouteGuard>
    );
  }

  const permissions = permissionsFor(role.key);
  const groups = permissionsByModule(permissions);

  return (
    <RouteGuard permissions={['role:read']}>
      <Breadcrumbs
        items={[{ label: 'Roles', href: '/college/roles' }, { label: role.name }]}
      />

      <Button variant="ghost" size="sm" className="mb-2" asChild>
        <Link href="/college/roles">
          <ArrowLeft aria-hidden />
          All roles
        </Link>
      </Button>

      <PageHeader title={role.name} description={role.description} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={role.portal === 'student' ? 'info' : 'neutral'}>
          {PORTAL_LABELS[role.portal] ?? role.portal}
        </Badge>
        <Badge tone="neutral">{SCOPE_LABELS[role.scope] ?? role.scope}</Badge>
        {/*
          No wildcard branch: `platform_admin` is the only role holding `*:*`,
          and it is excluded from this page as a platform-tenant role. A branch
          for it here would be unreachable UI.
        */}
        <Badge tone="neutral">
          {role.permissionCount} permission{role.permissionCount === 1 ? '' : 's'}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {groups.map((group) => (
            <Card key={group.module}>
              <CardHeader>
                <CardTitle>{group.module}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {group.permissions.length} permission
                  {group.permissions.length === 1 ? '' : 's'}
                </p>
              </CardHeader>

              <CardContent>
                <ul className="space-y-2.5">
                  {group.permissions.map((permission) => (
                    <li key={permission.key} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm">{permission.description}</p>
                        <p className="font-mono text-2xs text-muted-foreground">
                          {permission.key}
                        </p>
                      </div>

                      {permission.isDangerous ? (
                        <Badge tone="warning" className="shrink-0">
                          Sensitive
                        </Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList
                items={[
                  { label: 'Key', value: role.key },
                  { label: 'Reach', value: SCOPE_LABELS[role.scope] ?? role.scope },
                  { label: 'Portal', value: PORTAL_LABELS[role.portal] ?? role.portal },
                  { label: 'Permissions', value: role.permissionCount },
                  { label: 'Sensitive', value: role.dangerousCount },
                ]}
              />
            </CardContent>
          </Card>

          {role.dangerousCount > 0 ? (
            <Card>
              <CardHeader className="flex-row items-center gap-2">
                <ShieldAlert className="size-4 text-warning" aria-hidden />
                <CardTitle>Sensitive permissions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {role.dangerousCount} of this role’s permissions are marked sensitive in the
                  catalogue — they suspend accounts, approve colleges or otherwise cannot easily be
                  undone.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Changing this role</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Roles ship with the platform and cannot be edited from here — no API exists to
                change them. Giving someone this role is done where that person is managed.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </RouteGuard>
  );
}
