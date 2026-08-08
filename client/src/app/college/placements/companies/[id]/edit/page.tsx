'use client';

import { useParams } from 'next/navigation';

import { useCompany, useUpdateCompany } from '@/api/placement-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { CompanyForm, type CompanyFormValues } from '@/components/placement/company-form';
import { Alert } from '@/components/ui/alert';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ErrorState } from '@/components/ui/empty-state';
import { FullPageSpinner } from '@/components/ui/spinner';

export default function EditCompanyPage() {
  const params = useParams<{ id: string }>();
  const company = useCompany(params.id);
  const updateCompany = useUpdateCompany(params.id);

  if (company.isLoading) return <FullPageSpinner label="Loading company" />;

  if (company.isError) {
    return (
      <ErrorState
        title="Could not load this company"
        message={company.error.message}
        requestId={company.error.requestId}
        onRetry={() => void company.refetch()}
      />
    );
  }

  if (!company.data) return <FullPageSpinner label="Loading" />;

  const isBlacklisted = company.data.status === 'blacklisted';

  return (
    <RouteGuard permissions={['company:update']}>
      <Breadcrumbs
        items={[
          { label: 'Placement', href: '/college/placements' },
          { label: 'Companies', href: '/college/placements/companies' },
          { label: company.data.name, href: `/college/placements/companies/${params.id}` },
          { label: 'Edit' },
        ]}
      />

      <PageHeader title={`Edit ${company.data.name}`} description={company.data.industry} />

      {isBlacklisted ? (
        <Alert tone="warning" title="This company is blacklisted" className="mb-4">
          Its details can still be corrected, but it cannot post new roles. Reinstating it is a
          separate decision made from the company page, where the reason is recorded.
        </Alert>
      ) : null}

      <CompanyForm
        mode="edit"
        redirectTo={`/college/placements/companies/${params.id}`}
        defaultValues={{
          name: company.data.name,
          legalName: company.data.legalName ?? '',
          logoUrl: company.data.logoUrl,
          logoKey: company.data.logoKey,
          website: company.data.website ?? '',
          industry: company.data.industry,
          companyType: company.data.companyType,
          sizeRange: company.data.sizeRange ?? '',
          headquarters: company.data.headquarters ?? '',
          locations: company.data.locations,
          description: company.data.description ?? '',
          email: company.data.email ?? '',
          phone: company.data.phone ?? '',
          contacts: company.data.contacts,
        }}
        onSubmit={(values: CompanyFormValues) =>
          updateCompany.mutateAsync(values as unknown as Record<string, unknown>)
        }
      />
    </RouteGuard>
  );
}
