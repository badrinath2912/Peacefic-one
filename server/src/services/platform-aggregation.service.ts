import { calculatePercentage } from '@peacefic/shared';

import { CollegeModel } from '@/models/college.model';
import { StudentModel } from '@/models/student.model';
import { FacultyModel } from '@/models/faculty.model';
import { ExamModel } from '@/models/exam.model';
import { CompanyModel } from '@/models/company.model';
import { PlacementModel } from '@/models/placement.model';
import { TrainingSessionModel } from '@/models/training-session.model';
import { AttendanceRecordModel } from '@/models/attendance-record.model';

export class PlatformAggregationService {
  async getOverview() {
    const [
      institutions,
      students,
      faculty,
      examinations,
      companies,
      placements,
      trainingSessions,
      attendanceRate,
    ] = await Promise.all([
      CollegeModel.countDocuments({
        status: 'active',
        deletedAt: null,
      }),

      StudentModel.countDocuments({
        status: 'active',
        deletedAt: null,
      }),

      FacultyModel.countDocuments({
        status: 'active',
        deletedAt: null,
      }),

      ExamModel.countDocuments({
        status: 'published',
        deletedAt: null,
      }),

      CompanyModel.countDocuments({
        status: 'active',
        deletedAt: null,
      }),

      this.countPlacedStudents(),

      TrainingSessionModel.countDocuments({
        status: {
          $in: ['scheduled', 'in_progress'],
        },
        deletedAt: null,
      }),

      this.calculateAttendanceRate(),
    ]);

    return {
      institutions,
      students,
      faculty,
      examinations,
      companies,
      placements,
      trainingSessions,
      attendanceRate,
    };
  }

  private async countPlacedStudents(): Promise<number> {
    const result = await PlacementModel.aggregate<{ count: number }>([
      {
        $match: {
          status: 'joined',
          isPrimaryOffer: true,
          joinedAt: { $ne: null },
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: '$studentId',
        },
      },
      {
        $count: 'count',
      },
    ]);

    return result[0]?.count ?? 0;
  }

  private async calculateAttendanceRate(): Promise<number> {
    const results = await AttendanceRecordModel.aggregate<{
      _id: string;
      count: number;
    }>([
      {
        $match: {
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const counts = new Map(
      results.map((result) => [result._id, result.count]),
    );

    const present = counts.get('present') ?? 0;
    const absent = counts.get('absent') ?? 0;
    const late = counts.get('late') ?? 0;
    const excused = counts.get('excused') ?? 0;
    const onDuty = counts.get('on_duty') ?? 0;

    const attended = present + late + onDuty;
    const total = present + absent + late + excused + onDuty;

    return calculatePercentage(attended, total);
  }
}