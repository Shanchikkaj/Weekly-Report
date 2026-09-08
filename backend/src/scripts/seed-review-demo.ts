import { randomUUID } from 'crypto';
import { prisma } from '../config/prisma';
import { connectPostgres } from '../config/postgres';
import { connectMongo } from '../config/mongo';
import { connectRedis } from '../config/redis';
import { ReportContent } from '../models/ReportContent';
import { ReportVersion } from '../models/ReportVersion';

async function seedReviewDemo() {
  await connectPostgres();
  await connectMongo();
  await connectRedis();

  console.log('[Seed] Seeding sample report and version snapshot...');

  // Ensure project exists
  const project = await prisma.project.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Project Horizon',
      description: 'Core platform development',
      active: true,
    },
  });

  // Ensure team member exists
  let member = await prisma.user.findFirst({ where: { role: 'team_member' } });
  if (!member) {
    member = await prisma.user.create({
      data: {
        email: 'alice.member@weeklyreport.io',
        password_hash: 'hashedpassword',
        role: 'team_member',
      },
    });
  }

  // Ensure manager exists
  let manager = await prisma.user.findFirst({ where: { role: 'manager' } });
  if (!manager) {
    manager = await prisma.user.create({
      data: {
        email: 'bob.manager@weeklyreport.io',
        password_hash: 'hashedpassword',
        role: 'manager',
      },
    });
  }

  const reportId = randomUUID();
  const weekStart = new Date('2026-11-09');
  const weekEnd = new Date('2026-11-15');

  // Create Postgres Report in needs_correction
  const report = await prisma.report.create({
    data: {
      id: reportId,
      user_id: member.id,
      project_id: project.id,
      week_start: weekStart,
      week_end: weekEnd,
      status: 'needs_correction',
      current_comment: 'Please elaborate on the testing hours and include the staging migration blocker resolution.',
    },
  });

  const content = {
    report_id: reportId,
    tasks_completed: [
      {
        task_name: 'Implement OAuth2 refresh rotation',
        priority: 'high',
        planned_percent: 100,
        actual_percent: 100,
        status: 'done',
        time_planned_hours: 12,
        time_spent_hours: 14,
        output_deliverable: 'PR #102 merged into main',
      },
      {
        task_name: 'Database index optimization for reports',
        priority: 'medium',
        planned_percent: 100,
        actual_percent: 80,
        status: 'in_progress',
        time_planned_hours: 8,
        time_spent_hours: 6,
        output_deliverable: 'Migration scripts prepared',
      },
    ],
    tasks_planned_next_week: [
      'Finalize manager review dashboard',
      'Benchmark Redis rate limiting under load',
    ],
    blockers: [
      {
        text: 'Staging environment database migration timeout during index creation',
        is_key_issue: true,
      },
    ],
    achievements: [
      {
        text: 'Zero downtime deployment pipeline established',
        is_key_achievement: true,
      },
    ],
    hours_by_type: {
      development: 24,
      testing: 6,
      meetings: 4,
      documentation: 2,
    },
    notes: 'Overall sprint velocity on track. Needs DBA assistance for migration script.',
    updated_at: new Date(),
  };

  // 1. Current MongoDB report_content
  await ReportContent.findOneAndUpdate(
    { report_id: reportId },
    content,
    { upsert: true, new: true }
  );

  // 2. Snapshot into MongoDB report_versions
  const versionDoc = await ReportVersion.create({
    report_id: reportId,
    version_number: 1,
    content_snapshot: content,
    submitted_at: new Date(),
  });

  // 3. Postgres review_comments
  await prisma.reviewComment.create({
    data: {
      report_id: reportId,
      reviewer_id: manager.id,
      mongo_version_ref: '1',
      comment: 'Please elaborate on the testing hours and include the staging migration blocker resolution.',
      action: 'request_changes',
    },
  });

  console.log('[Seed] Created report ID:', reportId);
  console.log('[Seed] Created version snapshot ID:', versionDoc._id.toString());
  console.log('[Seed] Successfully populated MongoDB report_versions collection.');

  process.exit(0);
}

seedReviewDemo().catch((err) => {
  console.error('[Seed Error]:', err);
  process.exit(1);
});
