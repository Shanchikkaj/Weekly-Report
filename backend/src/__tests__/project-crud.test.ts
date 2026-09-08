import request from 'supertest';
import mongoose from 'mongoose';
import app from '../index';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { connectPostgres, pool } from '../config/postgres';
import { connectMongo } from '../config/mongo';
import { connectRedis } from '../config/redis';
import { ReportContent } from '../models/ReportContent';

describe('STEP 8: Projects Module & Soft Delete Workflow Test Suite', () => {
  let memberToken: string;
  let memberId: string;
  let managerToken: string;
  let managerId: string;

  let createdProjectId: string;
  let linkedReportId: string;

  beforeAll(async () => {
    await connectPostgres();
    await connectMongo();
    await connectRedis();

    const ts = Date.now();

    // Register & Login Team Member
    const memberRes = await request(app).post('/api/auth/register').send({
      email: `member_proj_${ts}@project.test`,
      password: 'Password123!',
      role: 'team_member',
    });
    memberId = memberRes.body.user.id;
    const memberLogin = await request(app).post('/api/auth/login').send({
      email: `member_proj_${ts}@project.test`,
      password: 'Password123!',
    });
    memberToken = memberLogin.body.accessToken;

    // Register & Login Manager
    const managerRes = await request(app).post('/api/auth/register').send({
      email: `manager_proj_${ts}@project.test`,
      password: 'Password123!',
      role: 'manager',
    });
    managerId = managerRes.body.user.id;
    const managerLogin = await request(app).post('/api/auth/login').send({
      email: `manager_proj_${ts}@project.test`,
      password: 'Password123!',
    });
    managerToken = managerLogin.body.accessToken;
  });

  afterAll(async () => {
    try {
      if (linkedReportId) {
        await prisma.reviewComment.deleteMany({ where: { report_id: linkedReportId } });
        await prisma.report.deleteMany({ where: { id: linkedReportId } });
        await ReportContent.deleteMany({ report_id: linkedReportId });
      }
      if (createdProjectId) {
        await prisma.projectMember.deleteMany({ where: { project_id: createdProjectId } });
        await prisma.project.deleteMany({ where: { id: createdProjectId } });
      }
      await prisma.user.deleteMany({
        where: { email: { contains: 'project.test' } },
      });
    } catch {}
    await redis.quit().catch(() => {});
    await mongoose.disconnect().catch(() => {});
    await pool.end().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });


  it('1. should allow all authenticated users to list projects (paginated)', async () => {
    const res = await request(app)
      .get('/api/projects?page=1&limit=10')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty('meta');
    expect(res.body.meta).toHaveProperty('total');
    expect(res.body.meta).toHaveProperty('page', 1);
    expect(res.body.meta).toHaveProperty('limit', 10);
  });

  it('2. should reject non-manager attempting to create project with 403', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        name: 'Unauthorized Project',
        description: 'Should fail',
      });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions for this resource.');
  });

  it('3. should allow Manager to create a new project', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        name: 'Project Apollo',
        description: 'Next generation cloud architecture',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('message', 'Project created successfully.');
    expect(res.body.project).toHaveProperty('id');
    expect(res.body.project.name).toBe('Project Apollo');
    expect(res.body.project.description).toBe('Next generation cloud architecture');
    expect(res.body.project.active).toBe(true);

    createdProjectId = res.body.project.id;
  });

  it('4. should reject non-manager attempting to update project with 403', async () => {
    const res = await request(app)
      .put(`/api/projects/${createdProjectId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        name: 'Hacked Project Name',
      });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions for this resource.');
  });

  it('5. should allow Manager to update a project', async () => {
    const res = await request(app)
      .put(`/api/projects/${createdProjectId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        name: 'Project Apollo Renamed',
        description: 'Updated description for cloud architecture',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Project updated successfully.');
    expect(res.body.project.name).toBe('Project Apollo Renamed');
    expect(res.body.project.description).toBe('Updated description for cloud architecture');
  });

  it('6. should reject non-manager attempting to assign a member with 403', async () => {
    const res = await request(app)
      .post(`/api/projects/${createdProjectId}/members`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        user_id: memberId,
      });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions for this resource.');
  });

  it('7. should allow Manager to assign a team member to the project', async () => {
    const res = await request(app)
      .post(`/api/projects/${createdProjectId}/members`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        user_id: memberId,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('message', 'Member assigned to project successfully.');
    expect(res.body.membership.user_id).toBe(memberId);
    expect(res.body.membership.project_id).toBe(createdProjectId);
  });

  it('8. should allow authenticated users to view project details including members', async () => {
    const res = await request(app)
      .get(`/api/projects/${createdProjectId}`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdProjectId);
    expect(res.body.name).toBe('Project Apollo Renamed');
    expect(Array.isArray(res.body.project_members)).toBe(true);
    expect(res.body.project_members.some((m: any) => m.user_id === memberId)).toBe(true);
  });

  it('9. should reject non-manager attempting to delete project with 403', async () => {
    const res = await request(app)
      .delete(`/api/projects/${createdProjectId}`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'Forbidden: Insufficient permissions for this resource.');
  });

  it('10. should link a report to this project, then soft-delete project without foreign key violation', async () => {
    // 1. Team member creates a report linked to this project
    const reportRes = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        project_id: createdProjectId,
        week_start: '2026-10-05',
        week_end: '2026-10-11',
      });

    expect(reportRes.status).toBe(201);
    linkedReportId = reportRes.body.report.id;

    // 2. Manager soft-deletes the project (active = false)
    const deleteRes = await request(app)
      .delete(`/api/projects/${createdProjectId}`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toHaveProperty('message', 'Project deactivated successfully.');
    expect(deleteRes.body.project.active).toBe(false);

    // 3. Confirm the project is soft-deleted in DB (active is false)
    const dbProject = await prisma.project.findUnique({ where: { id: createdProjectId } });
    expect(dbProject?.active).toBe(false);

    // 4. Confirm the linked report is completely intact and accessible
    const checkReportRes = await request(app)
      .get(`/api/reports/${linkedReportId}`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(checkReportRes.status).toBe(200);
    expect(checkReportRes.body.id).toBe(linkedReportId);
    expect(checkReportRes.body.project_id).toBe(createdProjectId);

    // 5. Default project listing (active=true) filters out the deactivated project
    const activeProjectsRes = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(activeProjectsRes.body.data.some((p: any) => p.id === createdProjectId)).toBe(false);

    // 6. Project listing with active=all includes the soft-deleted project
    const allProjectsRes = await request(app)
      .get('/api/projects?active=all')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(allProjectsRes.body.data.some((p: any) => p.id === createdProjectId)).toBe(true);
  });
});
