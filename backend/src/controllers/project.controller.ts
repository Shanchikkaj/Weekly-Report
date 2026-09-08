import { Request, Response, NextFunction } from 'express';
import { projectService } from '../services/project.service';

export class ProjectController {
  async listProjects(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await projectService.listProjects(req.query);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getProjectById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const project = await projectService.getProjectById(id);
      return res.status(200).json(project);
    } catch (error) {
      next(error);
    }
  }

  async createProject(req: Request, res: Response, next: NextFunction) {
    try {
      const project = await projectService.createProject(req.body);
      return res.status(201).json({
        message: 'Project created successfully.',
        project,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateProject(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const project = await projectService.updateProject(id, req.body);
      return res.status(200).json({
        message: 'Project updated successfully.',
        project,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteProject(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await projectService.deleteProject(id);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async assignMember(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { user_id } = req.body;
      const result = await projectService.assignMember(id, user_id);
      return res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const projectController = new ProjectController();
