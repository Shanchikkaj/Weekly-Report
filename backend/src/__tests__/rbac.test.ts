import request from 'supertest';
import mongoose from 'mongoose';
import app from '../index';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { connectPostgres, pool } from '../config/postgres';
import { connectMongo } from '../config/mongo';
import { connectRedis } from '../config/redis';

describe('RBAC & Ownership Authorization Test Suite', () => {
  let tokenA: string;
  let userAId: string;
  let tokenB: string;
  let tokenManager: string;
  let reportAId: string;
  const testProjectId = '00000000-0000-0000-0000-000000000001';

  beforeAll(async () => {
    // Ensure database connections are initialized
    await connectPostgres();
    await connectMongo();
    await connectRedis();

    // Create a seed project in PostgreSQL if missing
    await prisma.project.upsert({
      where: { id: testProjectId },
      update: {},
      create: {
        id: testProjectId,
        name: 'Project Alpha',
        description: 'Test Project for RBAC',
        active: true,
      },
    });
  });

  afterAll(async () => {
    try {
      if (reportAId) {
        await prisma.report.deleteMany({ where: { id: reportAId } });
      }
      await prisma.user.deleteMany({
        where: { email: { contains: 'rbac.test' } },
      });
      await prisma.project.deleteMany({ where: { id: testProjectId } });
    } catch {}
    await redis.quit().catch(() => {});
    await mongoose.disconnect().catch(() => {});
    await pool.end().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });


  // 1. Registers two team members, A and B, plus a manager
  it('1. should register TeamMember A, TeamMember B, and a Manager', async () => {
    const ts = Date.now();

    // Register Member A
    const resA = await request(app)
      .post('/api/auth/register')
      .send({
        email: `member_a_${ts}@rbac.test`,
        password: 'Password123!',
        role: 'team_member',
      });
    expect(resA.status).toBe(201);
    userAId = resA.body.user.id;

    // Login Member A
    const loginA = await request(app)
      .post('/api/auth/login')
      .send({ email: `member_a_${ts}@rbac.test`, password: 'Password123!' });
    expect(loginA.status).toBe(200);
    tokenA = loginA.body.accessToken;
    expect(tokenA).toBeDefined();

    // Register Member B
    const resB = await request(app)
      .post('/api/auth/register')
      .send({
        email: `member_b_${ts}@rbac.test`,
        password: 'Password123!',
        role: 'team_member',
      });
    expect(resB.status).toBe(201);

    // Login Member B
    const loginB = await request(app)
      .post('/api/auth/login')
      .send({ email: `member_b_${ts}@rbac.test`, password: 'Password123!' });
    expect(loginB.status).toBe(200);
    tokenB = loginB.body.accessToken;
    expect(tokenB).toBeDefined();

    // Register Manager
    const resM = await request(app)
      .post('/api/auth/register')
      .send({
        email: `manager_${ts}@rbac.test`,
        password: 'Password123!',
        role: 'manager',
      });
    expect(resM.status).toBe(201);

    // Login Manager
    const loginM = await request(app)
      .post('/api/auth/login')
      .send({ email: `manager_${ts}@rbac.test`, password: 'Password123!' });
    expect(loginM.status).toBe(200);
    tokenManager = loginM.body.accessToken;
    expect(tokenManager).toBeDefined();
  });

  // 2. A creates a report
  it('2. should allow TeamMember A to create a report', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        project_id: testProjectId,
        week_start: '2026-09-01',
        week_end: '2026-09-07',
      });

    expect(res.status).toBe(201);
    expect(res.body.report).toBeDefined();
    expect(res.body.report.user_id).toBe(userAId);
    reportAId = res.body.report.id;
  });

  // 3. B attempts to GET A's report by ID directly -> expect 403 or 404, never A's data
  it("3. should reject TeamMember B when attempting to GET TeamMember A's report directly (expect 403, never A's data)", async () => {
    const res = await request(app)
      .get(`/api/reports/${reportAId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    // Expect 403 Forbidden
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Forbidden|Access denied/i);

    // Ensure A's report data is NEVER leaked
    expect(res.body.report).toBeUndefined();
    expect(res.body.week_start).toBeUndefined();
    expect(res.body.tasks_completed).toBeUndefined();
  });

  // Supplementary verification: Owner A CAN access their own report
  it("3b. should allow Owner A to access their own report", async () => {
    const res = await request(app)
      .get(`/api/reports/${reportAId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(reportAId);
    expect(res.body.user_id).toBe(userAId);
  });

  // Supplementary verification: Manager CAN view any team member's report
  it("3c. should allow Manager to access TeamMember A's report for review", async () => {
    const res = await request(app)
      .get(`/api/reports/${reportAId}`)
      .set('Authorization', `Bearer ${tokenManager}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(reportAId);
  });

  // 4. A manager-only route is hit by a team_member token -> expect 403
  it('4. should reject TeamMember when hitting manager-only route with 403, but allow Manager', async () => {
    // Team Member hitting manager route -> 403
    const resMember = await request(app)
      .get('/api/reports/manager/review-queue')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(resMember.status).toBe(403);
    expect(resMember.body.error).toMatch(/Forbidden|Insufficient permissions/i);

    // Manager hitting manager route -> 200 OK
    const resManager = await request(app)
      .get('/api/reports/manager/review-queue')
      .set('Authorization', `Bearer ${tokenManager}`);

    expect(resManager.status).toBe(200);
    expect(resManager.body.message).toMatch(/Manager review queue accessed/i);
  });

  // 5. Unauthenticated request to protected route -> expect 401
  it('5. should reject unauthenticated requests to protected routes with 401', async () => {
    const res = await request(app).get(`/api/reports/${reportAId}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Authentication required/i);
  });
});
