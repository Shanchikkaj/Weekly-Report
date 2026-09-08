import { Request, Response, NextFunction } from 'express';
import { userService } from '../services/user.service';
import { AppError } from '../middleware/errorHandler';

export class UserController {
  async listUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await userService.listUsers(req.query as any);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async createUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await userService.createUser(req.body);
      return res.status(201).json({
        message: 'User created successfully.',
        user,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateRole(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { role } = req.body;
      const user = await userService.updateRole(id, role);
      return res.status(200).json({
        message: 'User role updated successfully.',
        user,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { active } = req.body;
      const currentUser = req.user!;
      const user = await userService.updateStatus(id, Boolean(active), currentUser.id);
      return res.status(200).json({
        message: `User ${active ? 'activated' : 'deactivated'} successfully.`,
        user,
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const currentUser = req.user!;

      // Managers can view any user's stats; Team members can only view their own
      if (currentUser.role !== 'manager' && currentUser.id !== id) {
        throw new AppError(403, 'Forbidden: Insufficient permissions for this resource.');
      }

      const stats = await userService.getUserStats(id);
      return res.status(200).json(stats);
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
