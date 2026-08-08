import mongoose from 'mongoose';

import { withoutTenantScope } from '@/config/request-context';
import { InternalError } from '@/errors';
import { BatchRepository } from '@/repositories/batch.repository';
import { DepartmentRepository } from '@/repositories/department.repository';
import { StudentRepository } from '@/repositories/student.repository';
import { runSeed } from '@/database/seeders';

import { asTenant, asUser } from '../helpers/context';

/**
 * The requirement from the spec: for every tenant-scoped repository, seed two
 * colleges and assert that one college's queries never return the other's
 * documents. This is the test that would end the product if it failed in
 * production, and it is cheap, so it blocks merge.
 */
describe('tenant isolation', () => {
  const collegeA = new mongoose.Types.ObjectId().toString();
  const collegeB = new mongoose.Types.ObjectId().toString();

  const departments = new DepartmentRepository();
  const batches = new BatchRepository();
  const students = new StudentRepository();

  async function seedTenant(collegeId: string, suffix: string) {
    return asTenant(collegeId, async () => {
      const department = await departments.create({
        name: `Computer Science ${suffix}`,
        code: `CSE${suffix}`,
        status: 'active',
      });

      const batch = await batches.create({
        departmentId: department._id,
        name: `CSE 2022 ${suffix}`,
        code: `B${suffix}`,
        admissionYear: 2022,
        graduationYear: 2026,
        capacity: 60,
        status: 'active',
      });

      const student = await students.create({
        userId: new mongoose.Types.ObjectId(),
        departmentId: department._id,
        batchId: batch._id,
        rollNumber: `ROLL${suffix}`,
        admissionNumber: `ADM${suffix}`,
        admissionDate: new Date('2022-08-01'),
        currentSemester: 1,
        status: 'active',
      });

      return { department, batch, student };
    });
  }

  beforeEach(async () => {
    await runSeed();
  });

  it('does not return another tenant\'s departments', async () => {
    await seedTenant(collegeA, 'A');
    await seedTenant(collegeB, 'B');

    const fromA = await asTenant(collegeA, () => departments.findMany({}));

    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.code).toBe('CSEA');
    expect(fromA.every((d) => String(d.collegeId) === collegeA)).toBe(true);
  });

  it('does not return another tenant\'s batches or students', async () => {
    await seedTenant(collegeA, 'A');
    await seedTenant(collegeB, 'B');

    const [batchesFromB, studentsFromB] = await asTenant(collegeB, async () => [
      await batches.findMany({}),
      await students.findMany({}),
    ]);

    expect(batchesFromB).toHaveLength(1);
    expect(batchesFromB[0]?.code).toBe('BB');
    expect(studentsFromB).toHaveLength(1);
    expect(studentsFromB[0]?.rollNumber).toBe('ROLLB');
  });

  it('returns null rather than the document when fetching another tenant by id', async () => {
    const seededA = await seedTenant(collegeA, 'A');

    const found = await asTenant(collegeB, () => students.findById(seededA.student._id));

    expect(found).toBeNull();
  });

  it('throws a 404, not a 403, when another tenant fetches by id', async () => {
    const seededA = await seedTenant(collegeA, 'A');

    // A 403 would confirm the record exists, which is an information leak.
    await expect(
      asTenant(collegeB, () => students.findByIdOrFail(seededA.student._id)),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('does not count another tenant\'s documents', async () => {
    await seedTenant(collegeA, 'A');
    await seedTenant(collegeB, 'B');

    const count = await asTenant(collegeA, () => students.count());
    expect(count).toBe(1);
  });

  it('scopes aggregations to the caller\'s tenant', async () => {
    await seedTenant(collegeA, 'A');
    await seedTenant(collegeB, 'B');

    const byDepartment = await asTenant(collegeA, () => students.countByDepartment());

    expect(byDepartment).toHaveLength(1);
    expect(byDepartment[0]?.count).toBe(1);
  });

  it('refuses a scoped query when no tenant context is present', async () => {
    await seedTenant(collegeA, 'A');

    await expect(
      asUser({ collegeId: undefined }, async () => {
        // Simulate a context that authenticated but never resolved a college.
        const { requestContext } = await import('@/config/request-context');
        requestContext.patch({ collegeId: null });
        return students.findMany({});
      }),
    ).rejects.toBeInstanceOf(InternalError);
  });

  it('crosses tenants only through the explicit escape hatch', async () => {
    await seedTenant(collegeA, 'A');
    await seedTenant(collegeB, 'B');

    const all = await asTenant(collegeA, () =>
      withoutTenantScope('test-cross-tenant-report', () => students.findMany({})),
    );

    expect(all).toHaveLength(2);
  });

  it('hides soft-deleted documents but frees their unique field for reuse', async () => {
    const seeded = await seedTenant(collegeA, 'A');

    await asTenant(collegeA, async () => {
      await students.softDelete(seeded.student._id);

      const remaining = await students.findMany({});
      expect(remaining).toHaveLength(0);

      // Institutions do reissue roll numbers, so the unique index is partial.
      const reused = await students.create({
        userId: new mongoose.Types.ObjectId(),
        departmentId: seeded.department._id,
        batchId: seeded.batch._id,
        rollNumber: 'ROLLA',
        admissionNumber: 'ADMA-REUSED',
        admissionDate: new Date('2023-08-01'),
        currentSemester: 1,
        status: 'active',
      });

      expect(reused.rollNumber).toBe('ROLLA');
    });
  });
});
