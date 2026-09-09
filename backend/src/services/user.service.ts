import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { ReportContent } from '../models/ReportContent';
import { Role, ReportStatus } from '@prisma/client';
import { invalidateUserSessions } from './auth.service';

export class UserService {
  /**
   * List users with pagination and search (Manager only)
   */
  async listUsers(query: { page?: string | number; limit?: string | number; search?: string; role?: Role }) {
    const page = Math.max(1, parseInt(String(query.page || 1), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || 20), 10)));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.role) {
      where.role = query.role;
    }

    if (query.search && typeof query.search === 'string' && query.search.trim()) {
      where.email = { contains: query.search.trim(), mode: 'insensitive' };
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          email: true,
          role: true,
          active: true,
          created_at: true,
          _count: {
            select: {
              reports: true,
              project_members: true,
            },
          },
        },
      }),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Create / Invite a new user (Manager only)
   */
  async createUser(dto: { email: string; password?: string; role?: Role }) {
    if (!dto.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email)) {
      throw new AppError(400, 'A valid email address is required.');
    }

    const password = dto.password || 'Welcome123!';
    if (password.length < 8) {
      throw new AppError(400, 'Password must be at least 8 characters long.');
    }

    const existing = await prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true },
    });
    if (existing) {
      throw new AppError(400, 'A user with this email already exists.');
    }

    const password_hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        password_hash,
        role: dto.role || Role.team_member,
        active: true,
      },
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
        created_at: true,
      },
    });

    return user;
  }

  /**
   * Update user role (Manager only)
   */
  async updateRole(id: string, newRole: Role) {
    if (![Role.team_member, Role.manager].includes(newRole)) {
      throw new AppError(400, 'Invalid role specified.');
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) {
      throw new AppError(404, 'User not found.');
    }

    return prisma.user.update({
      where: { id },
      data: { role: newRole },
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
      },
    });
  }

  /**
   * Update active status (soft deactivation, Manager only)
   */
  async updateStatus(id: string, active: boolean, currentUserId: string) {
    if (id === currentUserId) {
      throw new AppError(400, 'You cannot deactivate your own account.');
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) {
      throw new AppError(404, 'User not found.');
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { active },
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
      },
    });

    if (!active) {
      await invalidateUserSessions(id);
    }

    return updatedUser;
  }

  /**
   * Member Profile: full report history + computed stats
   */
  async getUserStats(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
        created_at: true,
      },
    });

    if (!user) {
      throw new AppError(404, 'User not found.');
    }

    const reports = await prisma.report.findMany({
      where: { user_id: userId },
      orderBy: { week_start: 'desc' },
      include: {
        project: { select: { id: true, name: true } },
      },
    });

    const reportIds = reports.map((r) => r.id);
    const contents = await ReportContent.find({ report_id: { $in: reportIds } }).lean();

    let totalHoursLogged = 0;
    let totalTasksCompleted = 0;

    for (const c of contents) {
      if (c.hours_by_type) {
        totalHoursLogged +=
          (c.hours_by_type.development || 0) +
          (c.hours_by_type.testing || 0) +
          (c.hours_by_type.meetings || 0) +
          (c.hours_by_type.documentation || 0);
      }
      if (Array.isArray(c.tasks_completed)) {
        totalTasksCompleted += c.tasks_completed.filter((t: any) => t.status === 'done').length;
      }
    }

    const approvedCount = reports.filter((r) => r.status === ReportStatus.approved).length;
    const submittedCount = reports.filter((r) => r.status === ReportStatus.submitted).length;
    const needsCorrectionCount = reports.filter((r) => r.status === ReportStatus.needs_correction).length;
    const draftCount = reports.filter((r) => r.status === ReportStatus.draft).length;

    const approvalRate = reports.length > 0 ? Math.round((approvedCount / reports.length) * 100) : 0;

    return {
      user,
      stats: {
        total_reports: reports.length,
        approved: approvedCount,
        submitted: submittedCount,
        needs_correction: needsCorrectionCount,
        draft: draftCount,
        approval_rate: approvalRate,
        total_hours: totalHoursLogged,
        tasks_completed: totalTasksCompleted,
      },
      reports,
    };
  }
}

export const userService = new UserService();
