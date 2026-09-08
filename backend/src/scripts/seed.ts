import bcrypt from 'bcryptjs';
import crypto from 'crypto';
const uuidv4 = () => crypto.randomUUID();
import { prisma } from '../config/prisma';
import { connectPostgres, pool } from '../config/postgres';
import { connectMongo } from '../config/mongo';
import mongoose from 'mongoose';
import { ReportContent } from '../models/ReportContent';
import { ReportVersion } from '../models/ReportVersion';
import { Role, ReportStatus, ReviewAction } from '@prisma/client';

function formatYYYYMMDD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Helper to compute Monday-to-Sunday weekly dates for N weeks in the past
 * Follows strict Monday-start convention (Monday = week_start, Sunday = week_end).
 */
function getPastWeeks(numWeeks: number): { week_start: string; week_end: string; label: string }[] {
  const weeks: { week_start: string; week_end: string; label: string }[] = [];
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = date.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diffToMonday = date.getDate() - day + (day === 0 ? -6 : 1);
  const currentMonday = new Date(date.getFullYear(), date.getMonth(), diffToMonday);

  for (let i = numWeeks - 1; i >= 0; i--) {
    const monday = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() - i * 7);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);

    const startStr = formatYYYYMMDD(monday);
    const endStr = formatYYYYMMDD(sunday);

    weeks.push({
      week_start: startStr,
      week_end: endStr,
      label: i === 0 ? 'Current Week' : `${i} week${i > 1 ? 's' : ''} ago`,
    });
  }

  return weeks;
}

async function runSeed() {
  console.log('===============================================================');
  console.log('🌱 Starting Weekly Report & Team Dashboard Database Seeder');
  console.log('===============================================================');

  // 1. Establish database connections
  await connectPostgres();
  await connectMongo();

  // 2. Clean existing database records safely (cascade deletes)
  console.log('\n[1/6] Cleaning existing data...');
  // Clean MongoDB collections
  await ReportVersion.deleteMany({});
  await ReportContent.deleteMany({});

  // Clean PostgreSQL tables using TRUNCATE CASCADE to ensure complete wipe
  try {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "review_comments", "reports", "project_members", "projects", "users" CASCADE;'
    );
  } catch (err) {
    // Fallback if TRUNCATE has permission constraints
    await prisma.reviewComment.deleteMany({});
    await prisma.report.deleteMany({});
    await prisma.projectMember.deleteMany({});
    await prisma.project.deleteMany({});
    await prisma.user.deleteMany({});
  }
  console.log('✓ Cleaned PostgreSQL and MongoDB collections.');

  // 3. Create Seed Users
  console.log('\n[2/6] Seeding Manager and Team Member accounts...');
  const salt = await bcrypt.genSalt(10);
  const defaultPassword = 'Password123!';
  const hashedPassword = await bcrypt.hash(defaultPassword, salt);

  const managerUser = await prisma.user.create({
    data: {
      email: 'manager@company.com',
      password_hash: hashedPassword,
      role: Role.manager,
      active: true,
    },
  });

  const memberData = [
    { email: 'alice.chen@company.com', name: 'Alice Chen' },
    { email: 'bob.martinez@company.com', name: 'Bob Martinez' },
    { email: 'charlie.kim@company.com', name: 'Charlie Kim' },
    { email: 'diana.ross@company.com', name: 'Diana Ross' },
    { email: 'evan.wright@company.com', name: 'Evan Wright' },
  ];

  const createdMembers = [];
  for (const m of memberData) {
    const user = await prisma.user.create({
      data: {
        email: m.email,
        password_hash: hashedPassword,
        role: Role.team_member,
        active: true,
      },
    });
    createdMembers.push({ ...user, displayName: m.name });
  }

  console.log(`✓ Seeded 1 Manager (${managerUser.email}) and ${createdMembers.length} Team Members.`);

  // 4. Create Seed Projects
  console.log('\n[3/6] Seeding Organizational Projects...');
  const projectData = [
    {
      name: 'Core Cloud Platform',
      description: 'Distributed microservices, authentication gateway, and scalable event brokers.',
    },
    {
      name: 'Mobile & Web Experience',
      description: 'Responsive user interface, real-time collaboration dashboards, and design system.',
    },
    {
      name: 'Data & Analytics Pipeline',
      description: 'High-throughput data ingestion, warehouse modeling, and reporting metrics.',
    },
    {
      name: 'DevOps & Security Automation',
      description: 'CI/CD pipelines, container orchestration, vulnerability scanning, and IAM.',
    },
  ];

  const createdProjects = [];
  for (const p of projectData) {
    const project = await prisma.project.create({
      data: {
        name: p.name,
        description: p.description,
        active: true,
      },
    });
    createdProjects.push(project);
  }

  console.log(`✓ Seeded ${createdProjects.length} Projects.`);

  // 5. Assign Members to Projects
  console.log('\n[4/6] Assigning Team Members to Projects...');
  // Distribute members across projects
  await prisma.projectMember.createMany({
    data: [
      { user_id: createdMembers[0].id, project_id: createdProjects[0].id }, // Alice -> Cloud Platform
      { user_id: createdMembers[0].id, project_id: createdProjects[1].id }, // Alice -> Web Experience
      { user_id: createdMembers[1].id, project_id: createdProjects[1].id }, // Bob -> Web Experience
      { user_id: createdMembers[2].id, project_id: createdProjects[2].id }, // Charlie -> Data & Analytics
      { user_id: createdMembers[3].id, project_id: createdProjects[3].id }, // Diana -> DevOps & Security
      { user_id: createdMembers[4].id, project_id: createdProjects[0].id }, // Evan -> Cloud Platform
      { user_id: createdMembers[4].id, project_id: createdProjects[2].id }, // Evan -> Data & Analytics
    ],
  });
  console.log('✓ Assigned project memberships.');

  // 6. Generate 4-5 Weeks of Realistic Reports
  console.log('\n[5/6] Seeding 4 Weeks of Reports with Multi-Status Workflows & Versions...');
  const pastWeeks = getPastWeeks(4); // 4 past weeks

  // Sample tasks library for variety
  const taskTemplates = [
    { name: 'Implement OAuth2 refresh token rotation', priority: 'high', hours: 14, cat: 'development' },
    { name: 'Refactor Postgres query indexing for dashboard filters', priority: 'high', hours: 10, cat: 'development' },
    { name: 'Configure Jest automated test suites with Supertest', priority: 'medium', hours: 8, cat: 'testing' },
    { name: 'Sprint backlog grooming and architecture review', priority: 'low', hours: 6, cat: 'meetings' },
    { name: 'Document REST API specifications and OpenAPI schema', priority: 'medium', hours: 5, cat: 'documentation' },
    { name: 'Resolve Redis connection pool leak under high concurrency', priority: 'high', hours: 12, cat: 'development' },
    { name: 'Build Recharts trend charts and status breakdown UI', priority: 'medium', hours: 16, cat: 'development' },
    { name: 'Run security vulnerability scan & dependency audit', priority: 'medium', hours: 4, cat: 'testing' },
    { name: 'Setup Docker multi-stage builds and health checks', priority: 'high', hours: 9, cat: 'development' },
    { name: 'Stakeholder demo and user feedback interview session', priority: 'low', hours: 4, cat: 'meetings' },
  ];

  let totalReports = 0;
  let totalComments = 0;
  let totalVersions = 0;

  for (let wIdx = 0; wIdx < pastWeeks.length; wIdx++) {
    const week = pastWeeks[wIdx];
    const isOldWeek = wIdx < pastWeeks.length - 2; // Weeks 3 and 4 in the past
    const isRecentWeek = wIdx === pastWeeks.length - 2; // Week 2 in the past
    const isCurrentWeek = wIdx === pastWeeks.length - 1; // Last/Current week

    for (let mIdx = 0; mIdx < createdMembers.length; mIdx++) {
      const member = createdMembers[mIdx];
      const project = createdProjects[(mIdx + wIdx) % createdProjects.length];

      // Determine realistic status based on week
      let status: ReportStatus;
      let hasVersionSnapshot = false;
      let managerComment: string | null = null;
      let reviewAction: ReviewAction | null = null;

      if (isOldWeek) {
        // Older weeks are mostly approved
        status = ReportStatus.approved;
        managerComment = 'Excellent execution and thorough test coverage this week!';
        reviewAction = ReviewAction.approve;
      } else if (isRecentWeek) {
        // Mix of approved, needs_correction, and submitted
        if (mIdx === 0) {
          status = ReportStatus.approved;
          managerComment = 'Great job hitting all deliverables ahead of schedule.';
          reviewAction = ReviewAction.approve;
        } else if (mIdx === 1) {
          status = ReportStatus.needs_correction;
          managerComment = 'Please add deliverables detail for the migration task and verify performance numbers.';
          reviewAction = ReviewAction.request_changes;
          hasVersionSnapshot = true;
        } else {
          status = ReportStatus.approved;
          managerComment = 'Approved. Keep up the consistent cadence.';
          reviewAction = ReviewAction.approve;
        }
      } else {
        // Current / latest week has submitted, draft, and needs_correction
        if (mIdx === 0 || mIdx === 2) {
          status = ReportStatus.submitted; // Ready for manager review
        } else if (mIdx === 1) {
          status = ReportStatus.draft; // In progress by author
        } else if (mIdx === 3) {
          status = ReportStatus.needs_correction;
          managerComment = 'Need clarification on the testing blockers before sign-off.';
          reviewAction = ReviewAction.request_changes;
          hasVersionSnapshot = true;
        } else {
          status = ReportStatus.submitted; // Ready for manager review
        }
      }

      // Generate shared UUID
      const reportId = uuidv4();

      // Create Postgres Report Header
      const reportRow = await prisma.report.create({
        data: {
          id: reportId,
          user_id: member.id,
          project_id: project.id,
          week_start: new Date(week.week_start),
          week_end: new Date(week.week_end),
          status: status,
          current_comment: status === ReportStatus.needs_correction ? managerComment : null,
        },
      });
      totalReports++;

      // Pick tasks for this report
      const t1 = taskTemplates[(mIdx * 2 + wIdx) % taskTemplates.length];
      const t2 = taskTemplates[(mIdx * 2 + wIdx + 1) % taskTemplates.length];
      const t3 = taskTemplates[(mIdx * 2 + wIdx + 2) % taskTemplates.length];

      const tasksCompleted = [
        {
          task_name: t1.name,
          priority: t1.priority as any,
          planned_percent: 100,
          actual_percent: status === ReportStatus.approved ? 100 : 85,
          status: (status === ReportStatus.approved ? 'done' : 'in_progress') as any,
          time_planned_hours: t1.hours,
          time_spent_hours: t1.hours + (wIdx % 2),
          output_deliverable: `PR #${100 + wIdx * 10 + mIdx} merged and verified on staging`,
        },
        {
          task_name: t2.name,
          priority: t2.priority as any,
          planned_percent: 100,
          actual_percent: status === ReportStatus.draft ? 40 : 100,
          status: (status === ReportStatus.draft ? 'in_progress' : 'done') as any,
          time_planned_hours: t2.hours,
          time_spent_hours: t2.hours,
          output_deliverable: `Unit tests passing with 95% branch coverage`,
        },
        {
          task_name: t3.name,
          priority: t3.priority as any,
          planned_percent: 100,
          actual_percent: status === ReportStatus.needs_correction ? 60 : 100,
          status: (status === ReportStatus.needs_correction ? 'blocked' : 'done') as any,
          time_planned_hours: t3.hours,
          time_spent_hours: t3.hours,
          output_deliverable: 'Technical design document approved by team lead',
        },
      ];

      const blockers =
        mIdx % 2 === 1
          ? [
              {
                text: `Pending staging environment database migration lock in ${project.name}`,
                is_key_issue: true,
              },
              {
                text: 'Awaiting third-party webhook verification credentials',
                is_key_issue: false,
              },
            ]
          : [];

      const achievements = [
        {
          text: `Successfully resolved critical latency bottleneck in ${project.name} reducing p99 by 40%`,
          is_key_achievement: true,
        },
        {
          text: 'Completed cross-team knowledge sharing presentation on polyglot DB architecture',
          is_key_achievement: false,
        },
      ];

      const hoursByType = {
        development: t1.hours + t2.hours,
        testing: 6,
        meetings: 4,
        documentation: 3,
      };

      const plannedNextWeek = [
        'Deploy v2.1 service update to production cluster',
        'Complete end-to-end integration test coverage',
        'Participate in quarterly architecture planning review',
      ];

      // Insert MongoDB Report Content
      await ReportContent.create({
        report_id: reportId,
        tasks_completed: tasksCompleted,
        tasks_planned_next_week: plannedNextWeek,
        blockers: blockers,
        achievements: achievements,
        hours_by_type: hoursByType,
        notes: `Weekly progress logged for ${project.name}. All milestones on track.`,
        updated_at: new Date(),
      });

      // If needs_correction or had review, add snapshot in MongoDB & ReviewComment in Postgres
      if (hasVersionSnapshot) {
        await ReportVersion.create({
          report_id: reportId,
          version_number: 1,
          content_snapshot: {
            tasks_completed: tasksCompleted,
            tasks_planned_next_week: plannedNextWeek,
            blockers: blockers,
            achievements: achievements,
            hours_by_type: hoursByType,
            notes: 'Initial submission snapshot prior to requested changes.',
          },
          submitted_at: new Date(week.week_end),
        });
        totalVersions++;
      }

      if (managerComment && reviewAction) {
        await prisma.reviewComment.create({
          data: {
            report_id: reportId,
            reviewer_id: managerUser.id,
            mongo_version_ref: hasVersionSnapshot ? '1' : null,
            comment: managerComment,
            action: reviewAction,
            created_at: new Date(week.week_end),
          },
        });
        totalComments++;
      }
    }
  }

  console.log(`✓ Seeded ${totalReports} Reports across 4 weeks.`);
  console.log(`✓ Seeded ${totalVersions} MongoDB Version Snapshots.`);
  console.log(`✓ Seeded ${totalComments} Manager Review Comments.`);

  // Verify exact database row counts
  const finalUserCount = await prisma.user.count();
  const finalMemberCount = await prisma.user.count({ where: { role: Role.team_member } });
  const finalManagerCount = await prisma.user.count({ where: { role: Role.manager } });
  const finalProjectCount = await prisma.project.count();

  console.log('\n[6/6] Database Verification:');
  console.log(`- Total Users: ${finalUserCount} (1 Manager + ${finalMemberCount} Team Members)`);
  console.log(`- Total Projects: ${finalProjectCount}`);
  console.log(`- Total Reports: ${totalReports}`);

  // 7. Print Credentials Table
  console.log('\n===============================================================');
  console.log('✅ SEEDING COMPLETE! LOGIN CREDENTIALS ROSTER');
  console.log('===============================================================');
  console.log('Role        | Email                      | Password     ');
  console.log('------------|----------------------------|--------------');
  console.log(`Manager     | manager@company.com        | ${defaultPassword}`);
  for (const m of createdMembers) {
    const padEmail = m.email.padEnd(26, ' ');
    console.log(`Team Member | ${padEmail} | ${defaultPassword}`);
  }
  console.log('===============================================================\n');

  // Disconnect connections
  await mongoose.disconnect();
  await pool.end();
  await prisma.$disconnect();
}

runSeed()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Seeding failed with error:', err);
    process.exit(1);
  });
