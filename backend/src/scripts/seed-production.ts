import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { Role, ReportStatus, ReviewAction } from '@prisma/client';
import { ReportContent } from '../models/ReportContent';
import { ReportVersion } from '../models/ReportVersion';

const uuidv4 = () => crypto.randomUUID();

function formatYYYYMMDD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

    weeks.push({
      week_start: formatYYYYMMDD(monday),
      week_end: formatYYYYMMDD(sunday),
      label: i === 0 ? 'Current Week' : `${i} week${i > 1 ? 's' : ''} ago`,
    });
  }

  return weeks;
}

/**
 * Production-safe, idempotent initial data bootstrapper.
 * Explicitly gated behind SEED_DATABASE=true.
 * Refuses to overwrite existing production records if any user already exists.
 * Credentials MUST be supplied via temporary secret environment variables.
 *
 * Supports two distinct modes:
 * 1. Minimal (Default, SEED_DEMO_DATA not true):
 *    Creates primary manager account + 1 initial project.
 * 2. Demonstration Dataset (SEED_DEMO_DATA=true):
 *    Creates primary manager + 5 team members + 4 projects + 4 weeks of reports,
 *    MongoDB content documents, versions, and review comments for immediate dashboard/AI evaluation.
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
  const shouldSeedDemo = (process.env.SEED_DEMO_DATA || '').trim().toLowerCase() === 'true';
  const demoMemberPassword = (process.env.SEED_DEMO_PASSWORD || managerPassword).trim();

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

  const managerPasswordHash = await bcrypt.hash(managerPassword, 12);

  const manager = await prisma.user.create({
    data: {
      email: managerEmail,
      password_hash: managerPasswordHash,
      role: Role.manager,
      active: true,
    },
  });

  if (!shouldSeedDemo) {
    // Mode 1: Minimal manager and single initial project
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

    console.log('[Production Bootstrap] SUCCESS: Initial manager account created (Minimal Mode).');
    console.log(`[Production Bootstrap] Manager: ${manager.email} | Project: ${project.name}`);
  } else {
    // Mode 2: Complete five-member demonstration dataset
    console.log('[Production Bootstrap] SEED_DEMO_DATA=true detected. Seeding demonstration team, projects, and 4 weeks of reports...');

    const memberPasswordHash = await bcrypt.hash(demoMemberPassword, 12);

    const memberData = [
      { email: 'alice.chen@company.com', name: 'Alice Chen' },
      { email: 'bob.martinez@company.com', name: 'Bob Martinez' },
      { email: 'charlie.kim@company.com', name: 'Charlie Kim' },
      { email: 'diana.ross@company.com', name: 'Diana Ross' },
      { email: 'evan.wright@company.com', name: 'Evan Wright' },
    ];

    const createdMembers = [];
    for (const m of memberData) {
      const u = await prisma.user.create({
        data: {
          email: m.email,
          password_hash: memberPasswordHash,
          role: Role.team_member,
          active: true,
        },
      });
      createdMembers.push(u);
    }

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
      const proj = await prisma.project.create({
        data: {
          name: p.name,
          description: p.description,
          active: true,
        },
      });
      createdProjects.push(proj);
    }

    // Assign project memberships
    await prisma.projectMember.createMany({
      data: [
        { user_id: manager.id, project_id: createdProjects[0].id },
        { user_id: manager.id, project_id: createdProjects[1].id },
        { user_id: createdMembers[0].id, project_id: createdProjects[0].id },
        { user_id: createdMembers[0].id, project_id: createdProjects[1].id },
        { user_id: createdMembers[1].id, project_id: createdProjects[1].id },
        { user_id: createdMembers[2].id, project_id: createdProjects[2].id },
        { user_id: createdMembers[3].id, project_id: createdProjects[3].id },
        { user_id: createdMembers[4].id, project_id: createdProjects[0].id },
      ],
    });

    const pastWeeks = getPastWeeks(4);
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
    for (let wIdx = 0; wIdx < pastWeeks.length; wIdx++) {
      const week = pastWeeks[wIdx];
      const isOldWeek = wIdx < pastWeeks.length - 2;
      const isRecentWeek = wIdx === pastWeeks.length - 2;

      for (let mIdx = 0; mIdx < createdMembers.length; mIdx++) {
        const member = createdMembers[mIdx];
        const project = createdProjects[(mIdx + wIdx) % createdProjects.length];

        let status: ReportStatus;
        let hasVersionSnapshot = false;
        let managerComment: string | null = null;
        let reviewAction: ReviewAction | null = null;

        if (isOldWeek) {
          status = ReportStatus.approved;
          managerComment = 'Excellent execution and thorough test coverage this week!';
          reviewAction = ReviewAction.approve;
        } else if (isRecentWeek) {
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
          if (mIdx === 0 || mIdx === 2) {
            status = ReportStatus.submitted;
          } else if (mIdx === 1) {
            status = ReportStatus.draft;
          } else if (mIdx === 3) {
            status = ReportStatus.needs_correction;
            managerComment = 'Need clarification on the testing blockers before sign-off.';
            reviewAction = ReviewAction.request_changes;
            hasVersionSnapshot = true;
          } else {
            status = ReportStatus.submitted;
          }
        }

        const reportId = uuidv4();

        await prisma.report.create({
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

        if (hasVersionSnapshot) {
          await ReportVersion.create({
            report_id: reportId,
            version_number: 1,
            snapshot_data: {
              tasks_completed: tasksCompleted.map((t) => ({ ...t, actual_percent: 40, status: 'in_progress' })),
              tasks_planned_next_week: plannedNextWeek,
              blockers: [{ text: 'Initial blocker requiring lead clarification', is_key_issue: true }],
              achievements: [],
              hours_by_type: hoursByType,
              notes: 'Initial draft version before changes requested.',
            },
            change_summary: 'Initial draft snapshot created prior to manager revision request',
            created_at: new Date(Date.now() - 3600000),
          });

          await prisma.reviewComment.create({
            data: {
              report_id: reportId,
              reviewer_id: manager.id,
              comment: managerComment || 'Revision requested.',
              action: reviewAction || ReviewAction.request_changes,
            },
          });
        }
      }
    }

    console.log(`[Production Bootstrap] SUCCESS: Demonstration dataset created (${createdMembers.length} members, ${createdProjects.length} projects, ${totalReports} reports).`);
  }

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
