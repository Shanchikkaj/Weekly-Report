import request from 'supertest';
import mongoose from 'mongoose';
import app from '../index';
import { Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { connectPostgres, pool } from '../config/postgres';
import { connectMongo } from '../config/mongo';
import { connectRedis } from '../config/redis';
import { ReportContent } from '../models/ReportContent';
import { ReportVersion } from '../models/ReportVersion';

describe('STEP 7: Manager Review & Version History Workflow Test Suite', () => {
  let tokenA: string;
  let userAId: string;
  let tokenB: string;
  let tokenManager: string;
  let managerId: string;
  let reportId: string;
  const testProjectId = '00000000-0000-0000-0000-000000000003';

  beforeAll(async () => {
    await connectPostgres();
    await connectMongo();
    await connectRedis();

    await prisma.project.upsert({
      where: { id: testProjectId },
      update: {},
      create: {
        id: testProjectId,
        name: 'Sprint 42 Alpha',
        description: 'Testing review lifecycle',
        active: true,
      },
    });

    const ts = Date.now();

    // Register & Login Member A
    const resA = await request(app).post('/api/auth/register').send({
      email: `author_${ts}@review.test`,
      password: 'Password123!',
      role: 'team_member',
    });
    userAId = resA.body.user.id;
    const loginA = await request(app).post('/api/auth/login').send({
      email: `author_${ts}@review.test`,
      password: 'Password123!',
    });
    tokenA = loginA.body.accessToken;

    // Register & Login Member B
    await request(app).post('/api/auth/register').send({
      email: `bystander_${ts}@review.test`,
      password: 'Password123!',
      role: 'team_member',
    });
    const loginB = await request(app).post('/api/auth/login').send({
      email: `bystander_${ts}@review.test`,
      password: 'Password123!',
    });
    tokenB = loginB.body.accessToken;

    // Register & Login Manager (via trusted promotion)
    const resM = await request(app).post('/api/auth/register').send({
      email: `lead_manager_${ts}@review.test`,
      password: 'Password123!',
    });
    managerId = resM.body.user.id;
    await prisma.user.update({
      where: { id: managerId },
      data: { role: Role.manager },
    });
    const loginM = await request(app).post('/api/auth/login').send({
      email: `lead_manager_${ts}@review.test`,
      password: 'Password123!',
    });
    tokenManager = loginM.body.accessToken;
  });

  afterAll(async () => {
    try {
      if (reportId) {
        await prisma.reviewComment.deleteMany({ where: { report_id: reportId } });
        await prisma.report.deleteMany({ where: { id: reportId } });
        await ReportContent.deleteMany({ report_id: reportId });
        await ReportVersion.deleteMany({ report_id: reportId });
      }
      await prisma.user.deleteMany({
        where: { email: { contains: 'review.test' } },
      });
      await prisma.project.deleteMany({ where: { id: testProjectId } });
    } catch {}
    await redis.quit().catch(() => {});
    await mongoose.disconnect().catch(() => {});
    await pool.end().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });


  // 1. Initial report creation and draft editing
  it('1. should create and populate a draft report', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        project_id: testProjectId,
        week_start: '2026-11-02',
        week_end: '2026-11-08',
      });

    expect(res.status).toBe(201);
    reportId = res.body.report.id;

    // Author adds initial content
    const editRes = await request(app)
      .put(`/api/reports/${reportId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        tasks_completed: [
          {
            task_name: 'Initial feature implementation',
            priority: 'high',
            planned_percent: 100,
            actual_percent: 70,
            status: 'in_progress',
            time_planned_hours: 10,
            time_spent_hours: 8,
            output_deliverable: 'Draft commit',
          },
        ],
        tasks_planned_next_week: ['Complete unit tests'],
        blockers: [{ text: 'API documentation unclear', is_key_issue: true }],
        achievements: [{ text: 'Setup core boilerplate', is_key_achievement: true }],
        notes: 'Initial progress notes',
      });

    expect(editRes.status).toBe(200);
  });

  // 2. Author submits the report
  it('2. should submit the report (draft -> submitted)', async () => {
    const res = await request(app)
      .post(`/api/reports/${reportId}/submit`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.report.status).toBe('submitted');
  });

  // 3. Reject non-manager review attempt
  it('3. should reject non-manager attempting to review report with 403', async () => {
    const res = await request(app)
      .post(`/api/reports/${reportId}/review`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ action: 'approve' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Forbidden|Insufficient permissions/i);
  });

  // 4. Reject request_changes without required comment
  it('4. should reject request_changes without comment with 400', async () => {
    const res = await request(app)
      .post(`/api/reports/${reportId}/review`)
      .set('Authorization', `Bearer ${tokenManager}`)
      .send({ action: 'request_changes' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/comment is required when requesting changes/i);
  });

  // 5. Manager requests changes (snapshots content to MongoDB and updates Postgres)
  it('5. should snapshot report to MongoDB report_versions and set status=needs_correction', async () => {
    const changeComment = 'Please elaborate on the output_deliverable and actual hours.';
    const res = await request(app)
      .post(`/api/reports/${reportId}/review`)
      .set('Authorization', `Bearer ${tokenManager}`)
      .send({
        action: 'request_changes',
        comment: changeComment,
      });

    expect(res.status).toBe(200);
    expect(res.body.report.status).toBe('needs_correction');
    expect(res.body.report.current_comment).toBe(changeComment);
    expect(res.body.reviewComment).toBeDefined();
    expect(res.body.reviewComment.action).toBe('request_changes');
    expect(res.body.reviewComment.mongo_version_ref).toBe('1');

    // Verify snapshot exists in MongoDB
    const snapshot = await ReportVersion.findOne({ report_id: reportId, version_number: 1 });
    expect(snapshot).not.toBeNull();
    expect(snapshot!.version_number).toBe(1);
    expect(snapshot!.content_snapshot.tasks_completed.length).toBe(1);
    expect(snapshot!.content_snapshot.tasks_completed[0].task_name).toBe('Initial feature implementation');
  });

  // 6. Confirm Manager can NEVER modify report_content directly
  it('6. should confirm Manager can NEVER modify report_content directly (strictly rejected with 403)', async () => {
    const res = await request(app)
      .put(`/api/reports/${reportId}`)
      .set('Authorization', `Bearer ${tokenManager}`)
      .send({ notes: 'Manager trying to alter content' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Managers can never edit report content/i);
  });

  // 7. Team member edits report content during needs_correction and resubmits
  it('7. should allow owner to edit content during needs_correction and resubmit', async () => {
    const updateRes = await request(app)
      .put(`/api/reports/${reportId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        tasks_completed: [
          {
            task_name: 'Initial feature implementation (Revised)',
            priority: 'high',
            planned_percent: 100,
            actual_percent: 100,
            status: 'done',
            time_planned_hours: 10,
            time_spent_hours: 9.5,
            output_deliverable: 'PR #42 with test suites',
          },
        ],
        tasks_planned_next_week: ['Integration testing'],
        blockers: [{ text: 'Resolved', is_key_issue: false }],
        achievements: [{ text: 'Completed all sprint goals', is_key_achievement: true }],
        notes: 'Updated deliverables per manager feedback.',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.content.tasks_completed[0].task_name).toBe('Initial feature implementation (Revised)');

    // Author resubmits: needs_correction -> submitted
    const submitRes = await request(app)
      .post(`/api/reports/${reportId}/submit`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.report.status).toBe('submitted');
  });

  // 8. Manager approves the resubmitted report
  it('8. should allow Manager to approve the submitted report', async () => {
    const res = await request(app)
      .post(`/api/reports/${reportId}/review`)
      .set('Authorization', `Bearer ${tokenManager}`)
      .send({
        action: 'approve',
        comment: 'Great revision! Approved.',
      });

    expect(res.status).toBe(200);
    expect(res.body.report.status).toBe('approved');
    expect(res.body.report.current_comment).toBe('Great revision! Approved.');
    expect(res.body.reviewComment.action).toBe('approve');

    // Confirm NO additional version snapshot was created on approval
    const versionCount = await ReportVersion.countDocuments({ report_id: reportId });
    expect(versionCount).toBe(1);
  });

  // 9. Version history endpoint (GET /api/reports/:id/versions)
  it('9. should return the version history list', async () => {
    const res = await request(app)
      .get(`/api/reports/${reportId}/versions`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.versions)).toBe(true);
    expect(res.body.versions.length).toBe(1);
    expect(res.body.versions[0].version_number).toBe(1);
    expect(res.body.versions[0].content_snapshot.tasks_completed[0].task_name).toBe(
      'Initial feature implementation'
    );
  });

  // 10. Review comments history endpoint (GET /api/reports/:id/comments)
  it('10. should return all review comments ordered chronologically', async () => {
    const res = await request(app)
      .get(`/api/reports/${reportId}/comments`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.comments)).toBe(true);
    expect(res.body.comments.length).toBe(2);

    // First comment was request_changes
    expect(res.body.comments[0].action).toBe('request_changes');
    expect(res.body.comments[0].comment).toContain('Please elaborate');
    expect(res.body.comments[0].reviewer.id).toBe(managerId);

    // Second comment was approve
    expect(res.body.comments[1].action).toBe('approve');
    expect(res.body.comments[1].comment).toBe('Great revision! Approved.');

    // Third-party team member cannot view another members review comments
    const resB = await request(app)
      .get(`/api/reports/${reportId}/comments`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resB.status).toBe(403);
  });
});
