import request from 'supertest';
import mongoose from 'mongoose';
import app from '../index';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { connectPostgres, pool } from '../config/postgres';
import { connectMongo } from '../config/mongo';
import { connectRedis } from '../config/redis';

describe('Dashboard & User Management RBAC Test Suite', () => {
  let memberAToken: string;
  let memberAId: string;

  let memberBToken: string;
  let memberBId: string;

  let managerToken: string;
  let managerId: string;

  beforeAll(async () => {
    await connectPostgres();
    await connectMongo();
    await connectRedis();

    const ts = Date.now();

    // Register & Login Team Member A
    const resA = await request(app).post('/api/auth/register').send({
      email: `member_a_${ts}@dashrbac.test`,
      password: 'Password123!',
      role: 'team_member',
    });
    memberAId = resA.body.user.id;
    const loginA = await request(app).post('/api/auth/login').send({
      email: `member_a_${ts}@dashrbac.test`,
      password: 'Password123!',
    });
    memberAToken = loginA.body.accessToken;

    // Register & Login Team Member B
    const resB = await request(app).post('/api/auth/register').send({
      email: `member_b_${ts}@dashrbac.test`,
      password: 'Password123!',
      role: 'team_member',
    });
    memberBId = resB.body.user.id;
    const loginB = await request(app).post('/api/auth/login').send({
      email: `member_b_${ts}@dashrbac.test`,
      password: 'Password123!',
    });
    memberBToken = loginB.body.accessToken;

    // Register & Login Manager
    const resM = await request(app).post('/api/auth/register').send({
      email: `manager_${ts}@dashrbac.test`,
      password: 'Password123!',
      role: 'manager',
    });
    managerId = resM.body.user.id;
    const loginM = await request(app).post('/api/auth/login').send({
      email: `manager_${ts}@dashrbac.test`,
      password: 'Password123!',
    });
    managerToken = loginM.body.accessToken;
  });

  afterAll(async () => {
    try {
      await prisma.user.deleteMany({
        where: { email: { contains: 'dashrbac.test' } },
      });
    } catch {}
    await redis.quit().catch(() => {});
    await mongoose.disconnect().catch(() => {});
    await pool.end().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });


  describe('1. Dashboard Endpoints RBAC', () => {
    it('should reject team_member hitting GET /api/dashboard/summary with 403', async () => {
      const res = await request(app)
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${memberAToken}`);

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions for this resource.');
    });

    it('should reject team_member hitting GET /api/dashboard/reports with 403', async () => {
      const res = await request(app)
        .get('/api/dashboard/reports')
        .set('Authorization', `Bearer ${memberAToken}`);

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions for this resource.');
    });

    it('should reject team_member hitting GET /api/dashboard/trends with 403', async () => {
      const res = await request(app)
        .get('/api/dashboard/trends')
        .set('Authorization', `Bearer ${memberAToken}`);

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions for this resource.');
    });

    it('should reject team_member hitting GET /api/dashboard/side-by-side with 403', async () => {
      const res = await request(app)
        .get('/api/dashboard/side-by-side')
        .set('Authorization', `Bearer ${memberAToken}`);

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions for this resource.');
    });

    it('should allow Manager hitting dashboard endpoints with 200', async () => {
      const sumRes = await request(app)
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(sumRes.status).toBe(200);
      expect(sumRes.body).toHaveProperty('total_submitted_this_week');

      const trendsRes = await request(app)
        .get('/api/dashboard/trends')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(trendsRes.status).toBe(200);
      expect(trendsRes.body).toHaveProperty('tasksTrend');
    });
  });

  describe('2. User Management Endpoints RBAC', () => {
    it('should reject team_member hitting GET /api/users with 403', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${memberAToken}`);

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions for this resource.');
    });

    it('should reject team_member hitting POST /api/users with 403', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${memberAToken}`)
        .send({
          email: 'unauthorized_invite@dashrbac.test',
          role: 'team_member',
        });

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions for this resource.');
    });

    it('should reject team_member hitting PUT /api/users/:id/role with 403', async () => {
      const res = await request(app)
        .put(`/api/users/${memberAId}/role`)
        .set('Authorization', `Bearer ${memberAToken}`)
        .send({ role: 'manager' });

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions for this resource.');
    });

    it('should reject team_member hitting PUT /api/users/:id/status with 403', async () => {
      const res = await request(app)
        .put(`/api/users/${memberBId}/status`)
        .set('Authorization', `Bearer ${memberAToken}`)
        .send({ active: false });

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions for this resource.');
    });

    it('should allow Manager to manage users', async () => {
      const listRes = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveProperty('data');
      expect(Array.isArray(listRes.body.data)).toBe(true);
    });
  });

  describe('3. User Statistics & Profile Ownership RBAC', () => {
    it('should ALLOW team_member A to GET their OWN stats (/api/users/:id/stats)', async () => {
      const res = await request(app)
        .get(`/api/users/${memberAId}/stats`)
        .set('Authorization', `Bearer ${memberAToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.id).toBe(memberAId);
      expect(res.body).toHaveProperty('stats');
      expect(res.body.stats).toHaveProperty('total_reports');
      expect(res.body.stats).toHaveProperty('approval_rate');
    });

    it("should REJECT team_member A attempting to GET team_member B's stats with 403", async () => {
      const res = await request(app)
        .get(`/api/users/${memberBId}/stats`)
        .set('Authorization', `Bearer ${memberAToken}`);

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions for this resource.');
    });

    it("should ALLOW Manager to GET any team_member's stats", async () => {
      const res = await request(app)
        .get(`/api/users/${memberAId}/stats`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(memberAId);
    });
  });
});
