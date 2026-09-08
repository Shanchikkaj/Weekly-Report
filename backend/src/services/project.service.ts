import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

export interface CreateProjectDTO {
  name: string;
  description?: string;
}

export interface UpdateProjectDTO {
  name?: string;
  description?: string;
  active?: boolean;
}

export interface ListProjectsQuery {
  page?: string | number;
  limit?: string | number;
  active?: string | boolean;
  search?: string;
}

export class ProjectService {
  /**
   * List projects with pagination and active/search filters
   */
  async listProjects(query: ListProjectsQuery) {
    const page = Math.max(1, parseInt(String(query.page || 1), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || 20), 10) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    // Filter by active status (default to active=true unless 'all' or explicit boolean)
    if (query.active !== undefined) {
      if (query.active === 'all') {
        // No active filter
      } else if (query.active === 'false' || query.active === false) {
        where.active = false;
      } else {
        where.active = true;
      }
    } else {
      // Default: show active projects
      where.active = true;
    }

    if (query.search && typeof query.search === 'string' && query.search.trim()) {
      where.name = {
        contains: query.search.trim(),
        mode: 'insensitive',
      };
    }

    const [total, data] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: {
              project_members: true,
              reports: true,
            },
          },
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get single project by ID with members list
   */
  async getProjectById(id: string) {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        project_members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                role: true,
                active: true,
              },
            },
          },
        },
        _count: {
          select: {
            reports: true,
          },
        },
      },
    });

    if (!project) {
      throw new AppError(404, 'Project not found.');
    }

    return project;
  }

  /**
   * Create a new project (Manager only)
   */
  async createProject(dto: CreateProjectDTO) {
    if (!dto.name || typeof dto.name !== 'string' || !dto.name.trim()) {
      throw new AppError(400, 'Project name is required.');
    }

    return prisma.project.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        active: true,
      },
    });
  }

  /**
   * Update an existing project (Manager only)
   */
  async updateProject(id: string, dto: UpdateProjectDTO) {
    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, 'Project not found.');
    }

    const data: any = {};
    if (dto.name !== undefined) {
      if (typeof dto.name !== 'string' || !dto.name.trim()) {
        throw new AppError(400, 'Project name cannot be empty.');
      }
      data.name = dto.name.trim();
    }

    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }

    if (dto.active !== undefined) {
      data.active = Boolean(dto.active);
    }

    return prisma.project.update({
      where: { id },
      data,
    });
  }

  /**
   * Soft delete a project by setting active = false (Manager only).
   * Does NOT hard delete to protect reports referencing it via FK ON DELETE RESTRICT.
   */
  async deleteProject(id: string) {
    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, 'Project not found.');
    }

    const project = await prisma.project.update({
      where: { id },
      data: { active: false },
    });

    return {
      message: 'Project deactivated successfully.',
      project,
    };
  }

  /**
   * Assign a team member to a project (Manager only)
   */
  async assignMember(projectId: string, userId: string) {
    if (!userId || typeof userId !== 'string') {
      throw new AppError(400, 'User ID is required.');
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new AppError(404, 'Project not found.');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, active: true },
    });
    if (!user) {
      throw new AppError(404, 'User not found.');
    }

    const existingMembership = await prisma.projectMember.findUnique({
      where: {
        user_id_project_id: {
          user_id: userId,
          project_id: projectId,
        },
      },
    });

    if (existingMembership) {
      return {
        message: 'User is already assigned to this project.',
        membership: existingMembership,
      };
    }

    const membership = await prisma.projectMember.create({
      data: {
        project_id: projectId,
        user_id: userId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return {
      message: 'Member assigned to project successfully.',
      membership,
    };
  }
}

export const projectService = new ProjectService();
