import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  ROLE_DEFINITIONS,
  ROLE_KEY_VALUES,
} from '@peacefic/shared';

import { connectDatabase, disconnectDatabase } from '@/config/database';
import { logger } from '@/config/logger';
import { PermissionModel } from '@/models/permission.model';
import { RoleModel } from '@/models/role.model';

/**
 * Reference data only, and idempotent: running it twice changes nothing.
 * Demo fixtures live in `demo.seeder.ts` and never run in production.
 */
async function seedPermissions(): Promise<number> {
  const operations = PERMISSION_DEFINITIONS.map((permission) => ({
    updateOne: {
      filter: { key: permission.key },
      update: {
        $set: {
          resource: permission.resource,
          action: permission.action,
          description: permission.description,
          module: permission.module,
          isDangerous: permission.isDangerous ?? false,
        },
        $setOnInsert: { key: permission.key },
      },
      upsert: true,
    },
  }));

  await PermissionModel.bulkWrite(operations, { ordered: false });
  return operations.length;
}

async function seedRoles(): Promise<number> {
  const operations = ROLE_KEY_VALUES.map((key) => {
    const definition = ROLE_DEFINITIONS[key];
    return {
      updateOne: {
        filter: { key, collegeId: null },
        update: {
          $set: {
            name: definition.name,
            description: definition.description,
            scope: definition.scope,
            permissions: DEFAULT_ROLE_PERMISSIONS[key],
            isSystem: true,
          },
          $setOnInsert: { key, collegeId: null },
        },
        upsert: true,
      },
    };
  });

  await RoleModel.bulkWrite(operations, { ordered: false });
  return operations.length;
}

export async function runSeed(): Promise<void> {
  const permissions = await seedPermissions();
  const roles = await seedRoles();
  logger.info('Reference data seeded', { permissions, roles });
}

if (require.main === module) {
  void (async () => {
    try {
      await connectDatabase();
      await runSeed();
      await disconnectDatabase();
      process.exit(0);
    } catch (error) {
      logger.error('Seed failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  })();
}
