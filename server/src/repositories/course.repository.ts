import mongoose from 'mongoose';

import { BaseRepository } from './base.repository';

import { CourseModel, type CourseDocument } from '@/models/course.model';


export class CourseRepository extends BaseRepository<CourseDocument> {
  constructor() {
    super(CourseModel, {
      tenantScoped: true,
      sortableFields: [
        'createdAt',
        'title',
        'code',
        'category',
        'level',
        'credits',
        'semester',
        'durationHours',
        'status',
        'stats.enrolledCount',
      ],
      searchableFields: ['title', 'code'],
      filterableFields: [
        'category',
        'level',
        'status',
        'semester',
        'departmentIds',
        'batchIds',
        'instructorIds',
        'tags',
        'createdAt',
      ],
      populatableFields: ['departmentIds', 'batchIds', 'instructorIds', 'prerequisites'],
      defaultSort: 'title',
    });
  }

  async findByCode(code: string): Promise<CourseDocument | null> {
    return this.findOne({ code: code.toUpperCase().trim() });
  }

  async codeExists(code: string, excludeId?: string): Promise<boolean> {
    const filter: Record<string, unknown> = { code: code.toUpperCase().trim() };
    if (excludeId) filter._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    return this.exists(filter);
  }

  /** Courses that list this one as a prerequisite — blocks deletion. */
  async findDependents(courseId: mongoose.Types.ObjectId): Promise<CourseDocument[]> {
    return this.findMany({ prerequisites: courseId });
  }

  async findByInstructor(facultyId: mongoose.Types.ObjectId): Promise<CourseDocument[]> {
    return this.findMany({ instructorIds: facultyId });
  }

  /** Populates the relations an export or detail view needs, in one pass. */
  async populateRelations(courses: CourseDocument[]): Promise<void> {
    await CourseModel.populate(courses, [
      { path: 'departmentIds', select: 'name code' },
      { path: 'batchIds', select: 'name code' },
      { path: 'prerequisites', select: 'title code' },
      {
        path: 'instructorIds',
        select: 'employeeId designation userId',
        populate: { path: 'userId', select: 'firstName lastName email' },
      },
    ]);
  }

  async removeInstructorFromAll(
    facultyId: mongoose.Types.ObjectId,
  ): Promise<number> {
    return this.updateMany(
      { instructorIds: facultyId },
      { $pull: { instructorIds: facultyId } },
    );
  }

  async countByCategory(): Promise<Array<{ category: string; count: number }>> {
    const rows = await this.aggregate<{ _id: string; count: number }>([
      { $match: { status: 'published' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    return rows.map((row) => ({ category: row._id, count: row.count }));
  }
}
