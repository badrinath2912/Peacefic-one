import { Router } from 'express';


import { attendanceRoutes } from './attendance.routes';
import { auditRoutes } from './audit.routes';
import { authRoutes } from './auth.routes';
import { batchRoutes } from './batch.routes';
import { courseRoutes } from './course.routes';
import { departmentRoutes } from './department.routes';
import { examinationRoutes } from './examination.routes';
import { facultyRoutes } from './faculty.routes';
import { fileRoutes } from './file.routes';
import {
  applicationRoutes,
  companyRoutes,
  jobRoutes,
  interviewRoutes,
  placementRoutes,
} from './placement.routes';
import { studentRoutes } from './student.routes';
import { trainingRoutes } from './training.routes';

import { config } from '@/config/env';
import { requestContext } from '@/config/request-context';
import { authenticate, requireActiveAccount } from '@/middleware/auth.middleware';

/**
 * v1 mount point. A future v2 is a sibling folder and one extra mount line
 * here, leaving v1 untouched.
 */
export function registerV1Routes(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({
      success: true,
      data: {
        name: 'Peacefic One API',
        version: 'v1',
        environment: config.env,
        docs: config.docs.enabled ? '/api/docs' : null,
      },
      meta: { requestId: requestContext.requestId(), timestamp: new Date().toISOString() },
    });
  });

  // Public and self-service auth endpoints handle their own guards.
  router.use('/auth', authRoutes());

  // Everything below requires a signed-in, usable account. Permission checks
  // are declared per route; row-level scope is applied in the services.
  router.use(authenticate, requireActiveAccount);

  router.use('/departments', departmentRoutes());
  router.use('/batches', batchRoutes());
  router.use('/students', studentRoutes());
  router.use('/faculty', facultyRoutes());
  router.use('/attendance', attendanceRoutes());
  router.use('/courses', courseRoutes());
  router.use('/training', trainingRoutes());
  router.use('/examinations', examinationRoutes());
  router.use('/companies', companyRoutes());
  router.use('/jobs', jobRoutes());
  router.use('/applications', applicationRoutes());
  router.use('/placements', placementRoutes());
  router.use('/interviews', interviewRoutes());
  router.use('/audit', auditRoutes());
  router.use('/files', fileRoutes());

  return router;
}
