import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { Role } from '@prisma/client';

/**
 * Production-safe, idempotent initial data bootstrapper.
 * Explicitly gated behind SEED_DATABASE=true.
 * Refuses to overwrite existing production records if any user already exists.
 * Credentials MUST be supplied via temporary secret environment variables.
 */
export async function bootstrapProductionData(): Promise<void> {
  const seedFlag = (process.env.SEED_DATABASE || '').trim().toLowerCase();
  if (seedFlag !== 'true') {
    return;
  }

  console.log('[Production Bootstrap] SEED_DATABASE=true detected. Evaluating bootstrap requirements...');

  const managerEmail = (process.env.SEED_MANAGER_EMAIL || '').trim();
  const managerPassword = (process.env.SEED_MANAGER_PASSWORD || '').trim();
  const initialProjectName = (process.env.SEED_PROJECT_NAME || 'Core Engineering').trim();

  if (!managerEmail || !managerPassword) {
    console.warn(
      '[Production Bootstrap] WARNING: SEED_DATABASE=true is set, but SEED_MANAGER_EMAIL or SEED_MANAGER_PASSWORD is not provided. Skipping bootstrap.'
    );
    return;
  }

  if (managerPassword.length < 8) {
    console.error('[Production Bootstrap] ERROR: SEED_MANAGER_PASSWORD must be at least 8 characters. Aborting bootstrap.');
    return;
  }

  // Idempotency check: refuse to overwrite existing production users or data
  const existingUserCount = await prisma.user.count();
  if (existingUserCount > 0) {
    console.log(
      `[Production Bootstrap] Database already contains ${existingUserCount} user(s). Refusing to overwrite existing production data. Skipping bootstrap.`
    );
    return;
  }

  console.log(`[Production Bootstrap] No existing users found. Initializing primary manager account for: ${managerEmail}...`);

  const passwordHash = await bcrypt.hash(managerPassword, 12);

  const manager = await prisma.user.create({
    data: {
      email: managerEmail,
      password_hash: passwordHash,
      role: Role.manager,
      active: true,
    },
  });

  const project = await prisma.project.create({
    data: {
      name: initialProjectName,
      description: 'Initial production organization project',
      active: true,
      project_members: {
        create: {
          user_id: manager.id,
        },
      },
    },
  });

  console.log('[Production Bootstrap] SUCCESS: Initial manager account created.');
  console.log(`[Production Bootstrap] Manager: ${manager.email} | Project: ${project.name}`);
  console.log('[Production Bootstrap] IMPORTANT: Please immediately remove or disable SEED_DATABASE, SEED_MANAGER_EMAIL, and SEED_MANAGER_PASSWORD from Render environment variables.');
}

// Standalone execution support
if (require.main === module) {
  bootstrapProductionData()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Production Bootstrap] Unexpected error:', err?.message || err);
      process.exit(1);
    });
}
