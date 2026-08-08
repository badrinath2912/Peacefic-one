import {
  CONTENT_STATUS,
  COURSE_CATEGORY,
  COURSE_LEVEL,
  type ContentStatus,
  type CourseCategory,
  type CourseLevel,
} from '@peacefic/shared';
import mongoose, { Schema, type Model, type Types } from 'mongoose';

import { applyBasePlugin, applyToJsonTransform, type BaseFields } from './plugins/base.plugin';

export interface CourseDocument extends BaseFields {
  _id: Types.ObjectId;
  collegeId: Types.ObjectId;
  title: string;
  code: string;
  description: string;
  category: CourseCategory;
  level: CourseLevel;
  thumbnailUrl: string | null;
  durationHours: number;
  credits: number | null;
  semester: number | null;
  /** Faculty who teach it. Stored as faculty ids, not user ids. */
  instructorIds: Types.ObjectId[];
  departmentIds: Types.ObjectId[];
  batchIds: Types.ObjectId[];
  prerequisites: Types.ObjectId[];
  learningOutcomes: string[];
  tags: string[];
  status: ContentStatus;
  publishedAt: Date | null;
  stats: {
    moduleCount: number;
    materialCount: number;
    enrolledCount: number;
    completedCount: number;
    averageRating: number | null;
    ratingCount: number;
  };
}

const courseSchema = new Schema<CourseDocument>({
  collegeId: { type: Schema.Types.ObjectId, ref: 'College', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  code: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },
  description: { type: String, required: true, maxlength: 5000 },
  category: { type: String, enum: COURSE_CATEGORY, required: true },
  level: { type: String, enum: COURSE_LEVEL, default: 'beginner' },
  thumbnailUrl: { type: String, default: null },
  durationHours: { type: Number, required: true, min: 0, max: 1000 },
  credits: { type: Number, default: null, min: 0, max: 20 },
  semester: { type: Number, default: null, min: 1, max: 12 },
  instructorIds: { type: [Schema.Types.ObjectId], ref: 'Faculty', default: [] },
  departmentIds: { type: [Schema.Types.ObjectId], ref: 'Department', default: [] },
  batchIds: { type: [Schema.Types.ObjectId], ref: 'Batch', default: [] },
  prerequisites: { type: [Schema.Types.ObjectId], ref: 'Course', default: [] },
  learningOutcomes: { type: [String], default: [] },
  tags: { type: [String], default: [] },
  status: { type: String, enum: CONTENT_STATUS, default: 'draft' },
  publishedAt: { type: Date, default: null },
  // Denormalised: a course card shows these and recomputing per render would
  // mean an aggregation on every list request.
  stats: {
    moduleCount: { type: Number, default: 0, min: 0 },
    materialCount: { type: Number, default: 0, min: 0 },
    enrolledCount: { type: Number, default: 0, min: 0 },
    completedCount: { type: Number, default: 0, min: 0 },
    averageRating: { type: Number, default: null, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
  },
});

applyBasePlugin(courseSchema);
applyToJsonTransform(courseSchema);

courseSchema.index(
  { collegeId: 1, code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
courseSchema.index({ collegeId: 1, status: 1, category: 1 });
courseSchema.index({ collegeId: 1, departmentIds: 1 });
courseSchema.index({ collegeId: 1, batchIds: 1 });
courseSchema.index({ collegeId: 1, instructorIds: 1 });
courseSchema.index({ collegeId: 1, semester: 1 });
courseSchema.index({ collegeId: 1, tags: 1 });

courseSchema.pre('validate', function (next) {
  // A course cannot be its own prerequisite.
  if (this.prerequisites.some((id) => String(id) === String(this._id))) {
    next(new Error('A course cannot be a prerequisite of itself'));
    return;
  }
  next();
});

export const CourseModel = (mongoose.models.Course as Model<CourseDocument>) ??
  mongoose.model<CourseDocument>('Course', courseSchema);
