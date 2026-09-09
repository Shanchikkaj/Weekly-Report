import request from 'supertest';
import mongoose from 'mongoose';
import app from '../index';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { connectPostgres, pool } from '../config/postgres';
import { connectMongo } from '../config/mongo';
import { connectRedis } from '../config/redis';
import { Role, ReportStatus } from '@prisma/client';
import { ReportContent } from '../models/ReportContent';



describe('Report CRUD & State Machine Workflow Test Suite', () => {
  let tokenA: string;
  let userAId: string;
  let tokenB: string;
  let tokenManager: string;
  let reportId: string;
  const testProjectId = '00000000-0000-0000-0000-000000000002';

  beforeAll(async () => {
    await connectPostgres();
    await connectMongo();
    await connectRedis();

    // Create a seed project in PostgreSQL
    await prisma.project.upsert({
      where: { id: testProjectId },
      update: {},
      create: {
        id: testProjectId,
        name: 'Workflow Core Project',
        description: 'Test Project for Report CRUD',
        active: true,
      },
    });

    const ts = Date.now();

    // Register & Login Member A
    const resA = await request(app).post('/api/auth/register').send({
      email: `member_a_${ts}@workflow.test`,
      password: 'Password123!',
      role: 'team_member',
    });
    userAId = resA.body.user.id;
    const loginA = await request(app).post('/api/auth/login').send({
      email: `member_a_${ts}@workflow.test`,
      password: 'Password123!',
    });
    tokenA = loginA.body.accessToken;

    // Register & Login Member B
    await request(app).post('/api/auth/register').send({
      email: `member_b_${ts}@workflow.test`,
      password: 'Password123!',
      role: 'team_member',
    });
    const loginB = await request(app).post('/api/auth/login').send({
      email: `member_b_${ts}@workflow.test`,
      password: 'Password123!',
    });
    tokenB = loginB.body.accessToken;

    // Register & Login Manager (via trusted promotion)
    await request(app).post('/api/auth/register').send({
      email: `manager_${ts}@workflow.test`,
      password: 'Password123!',
    });
    await prisma.user.update({
      where: { email: `manager_${ts}@workflow.test` },
      data: { role: Role.manager },
    });
    const loginM = await request(app).post('/api/auth/login').send({
      email: `manager_${ts}@workflow.test`,
      password: 'Password123!',
    });
    tokenManager = loginM.body.accessToken;
  });

  afterAll(async () => {
    try {
      if (reportId) {
        await prisma.report.deleteMany({ where: { id: reportId } });
        await ReportContent.deleteMany({ report_id: reportId });
      }
      await prisma.user.deleteMany({
        where: { email: { contains: 'workflow.test' } },
      });
      await prisma.project.deleteMany({ where: { id: testProjectId } });
    } catch {}
    await redis.quit().catch(() => {});
    await mongoose.disconnect().catch(() => {});
    await pool.end().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });


  // 1. Create Report (POST /api/reports)
  it('1. should create a report with status=draft and linked MongoDB content', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        project_id: testProjectId,
        week_start: '2026-10-05',
        week_end: '2026-10-11',
      });

    expect(res.status).toBe(201);
    expect(res.body.report).toBeDefined();
    expect(res.body.report.status).toBe('draft');
    expect(res.body.report.user_id).toBe(userAId);
    expect(res.body.content).toBeDefined();
    expect(res.body.content.report_id).toBe(res.body.report.id);

    reportId = res.body.report.id;
  });

  // 2. Edit Report Content while in draft (PUT /api/reports/:id)
  it('2. should allow the owner to edit report content while in draft', async () => {
    const res = await request(app)
      .put(`/api/reports/${reportId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        tasks_completed: [
          {
            task_name: 'Build State Machine',
            priority: 'high',
            planned_percent: 100,
            actual_percent: 100,
            status: 'done',
            time_planned_hours: 6,
            time_spent_hours: 5,
            output_deliverable: 'PR #12',
          },
        ],
        tasks_planned_next_week: ['Deploy to staging'],
        blockers: [{ text: 'No blockers', is_key_issue: false }],
        achievements: [{ text: 'Zero bug sprint', is_key_achievement: true }],
        hours_by_type: { development: 5, testing: 1, meetings: 0, documentation: 0 },
        notes: 'Everything smooth',
      });

    expect(res.status).toBe(200);
    expect(res.body.content.tasks_completed.length).toBe(1);
    expect(res.body.content.tasks_completed[0].task_name).toBe('Build State Machine');
    expect(res.body.content.achievements[0].is_key_achievement).toBe(true);
  });

  // 3. Reject non-owner attempting to edit
  it('3. should reject non-owner attempting to edit report content with 403', async () => {
    const res = await request(app)
      .put(`/api/reports/${reportId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ notes: 'Malicious update' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Forbidden|only edit your own/i);
  });

  // 4. Reject Manager attempting to edit report content (Managers can NEVER edit content)
  it('4. should reject Manager attempting to edit report content with 403', async () => {
    const res = await request(app)
      .put(`/api/reports/${reportId}`)
      .set('Authorization', `Bearer ${tokenManager}`)
      .send({ notes: 'Manager attempted edit' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Managers can never edit report content/i);
  });

  // 5. Submit report (POST /api/reports/:id/submit -> draft -> submitted)
  it('5. should allow owner to submit report (draft -> submitted)', async () => {
    const res = await request(app)
      .post(`/api/reports/${reportId}/submit`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.report.status).toBe('submitted');
  });

  // 6. Attempting to edit a submitted report is rejected with 403
  it('6. should REJECT attempting to edit a submitted report with 403 (content locked)', async () => {
    const res = await request(app)
      .put(`/api/reports/${reportId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ notes: 'Attempt edit while submitted' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/cannot be edited while status is 'submitted'/i);
  });

  // 7. Attempting to re-submit an already submitted report is rejected with 409
  it('7. should REJECT submitting an already submitted report with 409', async () => {
    const res = await request(app)
      .post(`/api/reports/${reportId}/submit`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Illegal transition/i);
  });

  // 8. Attempting to submit an approved report is rejected with 409
  it('8. should REJECT submitting an already approved report with 409', async () => {
    // Manually set status to approved in DB to simulate post-approval state
    await prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.approved },
    });

    const res = await request(app)
      .post(`/api/reports/${reportId}/submit`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Illegal transition.*from 'approved' to 'submitted'/i);
  });

  // 9. List reports with pagination
  it('9. should return a paginated list of reports for the owner', async () => {
    const res = await request(app)
      .get('/api/reports?page=1&limit=10')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(10);
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(1);

    // Ensure member B does not see member A's report in their list
    const resB = await request(app)
      .get('/api/reports')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(resB.status).toBe(200);
    const hasA = resB.body.data.some((r: any) => r.id === reportId);
    expect(hasA).toBe(false);
  });
});
