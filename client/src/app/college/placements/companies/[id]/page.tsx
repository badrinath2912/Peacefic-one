'use client';

import {
  BadgeCheck,
  Briefcase,
  Building2,
  ExternalLink,
  Globe,
  Mail,
  Pencil,
  Phone,
  RotateCcw,
  ShieldOff,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import {
  useBlacklistCompany,
  useCompanyProfile,
  useDeleteCompany,
  useReinstateCompany,
  useUploadCompanyLogo,
  useVerifyCompany,
} from '@/api/placement-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DescriptionList } from '@/components/ui/description-list';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { ReasonDialog } from '@/components/ui/reason-dialog';
import { FullPageSpinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import { can } from '@/lib/permissions';
import {
  COMPANY_STATUS_LABELS,
  COMPANY_STATUS_TONES,
  COMPANY_TYPE_LABELS,
  JOB_STATUS_LABELS,
  JOB_STATUS_TONES,
  contactsWithheld,
  formatCtcRange,
} from '@/lib/placement-display';
import { formatDate, formatDateTime } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

export default function CompanyDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const profile = useCompanyProfile(params.id);
  const verify = useVerifyCompany(params.id);
  const blacklist = useBlacklistCompany(params.id);
  const reinstate = useReinstateCompany(params.id);
  const uploadLogo = useUploadCompanyLogo(params.id);
  const removeCompany = useDeleteCompany();

  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingBlacklist, setPendingBlacklist] = useState(false);
  const [pendingReinstate, setPendingReinstate] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [pendingUnverify, setPendingUnverify] = useState(false);

  if (profile.isLoading) return <FullPageSpinner label="Loading company" />;

  if (profile.isError) {
    return (
      <ErrorState
        title="Could not load this company"
        message={profile.error.message}
        requestId={profile.error.requestId}
        onRetry={() => void profile.refetch()}
      />
    );
  }

  if (!profile.data) return <FullPageSpinner label="Loading" />;

  const { company, jobs, counts } = profile.data;
  const isBlacklisted = company.status === 'blacklisted';
  const withheld = contactsWithheld(company);

  const mayEdit = can(user?.permissions, 'company:update');
  const mayVerify = can(user?.permissions, 'company:verify');
  const mayBlacklist = can(user?.permissions, 'company:blacklist');

  return (
    <RouteGuard permissions={['company:read']}>
      <Breadcrumbs
        items={[
          { label: 'Placement', href: '/college/placements' },
          { label: 'Companies', href: '/college/placements/companies' },
          { label: company.name },
        ]}
      />

      <PageHeader
        title={company.name}
        description={`${COMPANY_TYPE_LABELS[company.companyType]} · ${company.industry}${
          company.headquarters ? ` · ${company.headquarters}` : ''
        }`}
        actions={
          <>
            <Badge tone={COMPANY_STATUS_TONES[company.status]}>
              {COMPANY_STATUS_LABELS[company.status]}
            </Badge>

            {company.isVerified ? (
              <Badge tone="success">
                <BadgeCheck className="size-3" aria-hidden />
                Verified
              </Badge>
            ) : null}

            {mayEdit ? (
              <Button variant="outline" asChild>
                <Link href={`/college/placements/companies/${company.id}/edit`}>
                  <Pencil aria-hidden />
                  Edit
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {isBlacklisted ? (
        <Card className="mb-4 border-danger/40 bg-danger-subtle">
          <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="flex items-start gap-3">
              <ShieldOff className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
              <div className="text-sm">
                <p className="font-medium">
                  Blacklisted {company.blacklistedAt ? formatDate(company.blacklistedAt) : ''}
                </p>
                <p className="text-muted-foreground">
                  {company.blacklistReason ?? 'No reason recorded.'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Past drives and offers stay on record — a student&rsquo;s placement history is
                  not erased because the company later misbehaved.
                </p>
              </div>
            </div>

            {mayBlacklist ? (
              <Button variant="outline" size="sm" onClick={() => setPendingReinstate(true)}>
                <RotateCcw aria-hidden />
                Reinstate
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Drives" value={counts.total} icon={Briefcase} />
        <StatCard label="Published" value={counts.published} />
        <StatCard label="Applications" value={counts.applications} />
        <StatCard label="Selected" value={counts.selected} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex items-start gap-4">
                {company.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={company.logoUrl}
                    alt={`${company.name} logo`}
                    className="size-16 shrink-0 rounded-md border border-border object-contain p-1"
                  />
                ) : (
                  <span className="grid size-16 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                    <Building2 className="size-6" aria-hidden />
                  </span>
                )}

                {mayEdit ? (
                  <div className="space-y-1">
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/svg+xml"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) uploadLogo.mutate(file);
                        event.target.value = '';
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInput.current?.click()}
                      isLoading={uploadLogo.isPending}
                      loadingText="Uploading"
                    >
                      <Upload aria-hidden />
                      {company.logoUrl ? 'Replace logo' : 'Upload logo'}
                    </Button>
                    <p className="text-2xs text-muted-foreground">
                      PNG, JPG, WebP or SVG, up to 5 MB.
                    </p>
                  </div>
                ) : null}
              </div>

              <DescriptionList
                items={[
                  { label: 'Registered name', value: company.legalName },
                  { label: 'Industry', value: company.industry },
                  { label: 'Type', value: COMPANY_TYPE_LABELS[company.companyType] },
                  { label: 'Headcount', value: company.sizeRange },
                  { label: 'Headquarters', value: company.headquarters },
                  {
                    label: 'Recruiting locations',
                    value: company.locations.join(', ') || null,
                    full: true,
                  },
                  { label: 'About', value: company.description, full: true },
                ]}
              />

              {company.website ? (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <Globe className="size-4" aria-hidden />
                  {company.website}
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Drives</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Roles posted against this company.
                </p>
              </div>
            </CardHeader>

            <CardContent>
              {jobs.length === 0 ? (
                <EmptyState
                  icon={Briefcase}
                  title="No drives yet"
                  description="Job postings created for this company will appear here."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {jobs.map((job) => (
                    <li key={job.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{job.title}</p>
                        <p className="tabular truncate text-xs text-muted-foreground">
                          {formatCtcRange(
                            job.compensation.ctcMin,
                            job.compensation.ctcMax,
                            job.compensation.currency,
                          )}{' '}
                          · {job.openings} opening{job.openings === 1 ? '' : 's'} ·{' '}
                          {job.stats.applicationCount} applied
                        </p>
                      </div>

                      <span className="text-xs text-muted-foreground">
                        {formatDate(job.driveDate ?? job.applicationCloseAt)}
                      </span>

                      <Badge tone={JOB_STATUS_TONES[job.status]}>
                        {JOB_STATUS_LABELS[job.status]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Verification</CardTitle>
              <p className="text-sm text-muted-foreground">
                A student decides whether to share their details based on this.
              </p>
            </CardHeader>

            <CardContent className="space-y-3">
              {company.isVerified ? (
                <div className="text-sm">
                  <p className="flex items-center gap-1.5 font-medium text-success">
                    <BadgeCheck className="size-4" aria-hidden />
                    Verified {company.verifiedAt ? formatDateTime(company.verifiedAt) : ''}
                  </p>
                  {company.verificationNote ? (
                    <p className="mt-1 text-muted-foreground">{company.verificationNote}</p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Not yet verified. Recruitment fraud is real, so this is never granted
                  automatically.
                </p>
              )}

              {mayVerify ? (
                company.isVerified ? (
                  <Button
                    variant="outline"
                    size="sm"
                    block
                    onClick={() => setPendingUnverify(true)}
                  >
                    Withdraw verification
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    block
                    onClick={() => verify.mutate({ isVerified: true })}
                    isLoading={verify.isPending}
                  >
                    <BadgeCheck aria-hidden />
                    Mark verified
                  </Button>
                )
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recruiter contacts</CardTitle>
            </CardHeader>

            <CardContent>
              {withheld ? (
                <p className="text-sm text-muted-foreground">
                  Recruiter details are only visible to staff who manage companies.
                </p>
              ) : company.contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  None recorded. A drive is much easier to run with a named recruiter.
                </p>
              ) : (
                <ul className="space-y-3">
                  {[...company.contacts]
                    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
                    .map((contact) => (
                      <li key={contact.email} className="text-sm">
                        <p className="flex flex-wrap items-center gap-1.5 font-medium">
                          {contact.name}
                          {contact.isPrimary ? (
                            <Badge tone="primary">
                              <Star className="size-3" aria-hidden />
                              Primary
                            </Badge>
                          ) : null}
                        </p>
                        {contact.designation ? (
                          <p className="text-xs text-muted-foreground">{contact.designation}</p>
                        ) : null}
                        <a
                          href={`mailto:${contact.email}`}
                          className="mt-1 flex items-center gap-1.5 text-xs text-primary hover:underline"
                        >
                          <Mail className="size-3" aria-hidden />
                          {contact.email}
                        </a>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Phone className="size-3" aria-hidden />
                          {contact.phone}
                        </p>
                      </li>
                    ))}
                </ul>
              )}

              {!withheld && (company.email || company.phone) ? (
                <div className="mt-4 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Switchboard</p>
                  {company.email ? <p>{company.email}</p> : null}
                  {company.phone ? <p>{company.phone}</p> : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {mayBlacklist && !isBlacklisted ? (
            <Card>
              <CardHeader>
                <CardTitle>Stop recruiting</CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Blacklisting prevents new drives without erasing history.
                </p>

                <Button
                  variant="outline"
                  size="sm"
                  block
                  onClick={() => setPendingBlacklist(true)}
                >
                  <ShieldOff aria-hidden />
                  Blacklist
                </Button>

                {mayEdit && counts.total === 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    block
                    onClick={() => setPendingDelete(true)}
                  >
                    <Trash2 aria-hidden />
                    Remove company
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <ReasonDialog
        open={pendingBlacklist}
        title={`Blacklist ${company.name}?`}
        description="They will not be able to post new roles. Past drives, applications and offers stay on record."
        label="Reason"
        placeholder="Withdrew offers after the drive without notice"
        confirmLabel="Blacklist company"
        tone="danger"
        isPending={blacklist.isPending}
        onCancel={() => setPendingBlacklist(false)}
        onConfirm={(reason) =>
          blacklist.mutate(reason, { onSuccess: () => setPendingBlacklist(false) })
        }
      />

      <ReasonDialog
        open={pendingReinstate}
        title={`Reinstate ${company.name}?`}
        description="They will be able to post new roles again. The reason is recorded in the audit log."
        label="Reason"
        placeholder="Cleared after review by the placement committee"
        confirmLabel="Reinstate company"
        isPending={reinstate.isPending}
        onCancel={() => setPendingReinstate(false)}
        onConfirm={(reason) =>
          reinstate.mutate(reason, { onSuccess: () => setPendingReinstate(false) })
        }
      />

      <ConfirmDialog
        open={pendingUnverify}
        tone="danger"
        title="Withdraw verification?"
        description="Students rely on this when deciding whether to share their details with a recruiter."
        confirmLabel="Withdraw verification"
        isPending={verify.isPending}
        onCancel={() => setPendingUnverify(false)}
        onConfirm={() =>
          verify.mutate(
            { isVerified: false },
            { onSuccess: () => setPendingUnverify(false) },
          )
        }
      />

      <ConfirmDialog
        open={pendingDelete}
        tone="danger"
        title={`Remove ${company.name}?`}
        description="Only a company with no drive history can be removed. This cannot be undone."
        confirmLabel="Remove company"
        isPending={removeCompany.isPending}
        onCancel={() => setPendingDelete(false)}
        onConfirm={() =>
          removeCompany.mutate(company.id, {
            onSuccess: () => router.push('/college/placements/companies'),
          })
        }
      />
    </RouteGuard>
  );
}
