import request from 'supertest';

import { seedReferenceData, testApp } from '../helpers/app';
import {
  createPlatformAdmin,
  createTenant,
  type TenantFixture,
} from '../helpers/fixtures';

const API = '/api/v1';

describe('platform aggregation API', () => {
  const app = testApp();
  let tenant: TenantFixture;
  let platform: { token: string; userId: string };

  const auth = (token: string) => ({
    Authorization: `Bearer ${token}`,
  });

  beforeEach(async () => {
    await seedReferenceData();
    tenant = await createTenant(app);
    platform = await createPlatformAdmin(app);
  });

  describe('authorization', () => {
    it('allows a platform administrator', async () => {
      await request(app)
        .get(`${API}/platform/aggregation/overview`)
        .set(auth(platform.token))
        .expect(200);
    });

    it('refuses a college administrator', async () => {
      await request(app)
        .get(`${API}/platform/aggregation/overview`)
        .set(auth(tenant.token))
        .expect(403);
    });

    it('refuses an unauthenticated caller', async () => {
      await request(app)
        .get(`${API}/platform/aggregation/overview`)
        .expect(401);
    });
  });
});
