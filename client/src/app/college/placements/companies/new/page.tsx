'use client';

import { useCreateCompany } from '@/api/placement-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { PageHeader } from '@/components/layout/app-shell';
import { CompanyForm, type CompanyFormValues } from '@/components/placement/company-form';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';

export default function NewCompanyPage() {
  const createCompany = useCreateCompany();

  return (
    <RouteGuard permissions={['company:create']}>
      <Breadcrumbs
        items={[
          { label: 'Placement', href: '/college/placements' },
          { label: 'Companies', href: '/college/placements/companies' },
          { label: 'New' },
        ]}
      />

      <PageHeader
        title="Add company"
        description="Added unverified. Someone with the verify permission confirms it is genuine before students rely on it."
      />

      <CompanyForm
        mode="create"
        onSubmit={(values: CompanyFormValues) =>
          createCompany.mutateAsync(values as unknown as Record<string, unknown>)
        }
      />
    </RouteGuard>
  );
}
