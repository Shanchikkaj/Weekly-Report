import { Request, Response, NextFunction } from 'express';
import { dashboardService } from '../services/dashboard.service';

export class DashboardController {
  async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { week_start } = req.query;
      const result = await dashboardService.getSummary(week_start as string);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getReports(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await dashboardService.getDashboardReports(req.query as any);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getTrends(_req: Request, res: Response, next: NextFunction) {
    try {
      const result = await dashboardService.getTrends();
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getSideBySide(req: Request, res: Response, next: NextFunction) {
    try {
      const { week_start, section } = req.query;
      const result = await dashboardService.getSideBySide(
        week_start as string,
        (section as any) || 'blockers'
      );
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getAvailableWeeks(req: Request, res: Response, next: NextFunction) {
    try {
      const weeks = await dashboardService.getAvailableWeeks();
      return res.status(200).json({ weeks });
    } catch (error) {
      next(error);
    }
  }
}

export const dashboardController = new DashboardController();
