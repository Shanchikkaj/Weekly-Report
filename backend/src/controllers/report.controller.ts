import { Request, Response, NextFunction } from 'express';
import { reportService } from '../services/report.service';

export class ReportController {
  async createReport(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const result = await reportService.createReport(user.id, req.body);
      return res.status(201).json({
        message: 'Report created successfully.',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateReportContent(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { id } = req.params;
      const result = await reportService.updateReportContent(id, user.id, user.role, req.body);
      return res.status(200).json({
        message: 'Report content updated successfully.',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async submitReport(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { id } = req.params;
      const report = await reportService.submitReport(id, user.id, user.role);
      return res.status(200).json({
        message: 'Report submitted successfully.',
        report,
      });
    } catch (error) {
      next(error);
    }
  }

  async getReportById(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { id } = req.params;
      const report = await reportService.getReportById(id, user.id, user.role);
      return res.status(200).json(report);
    } catch (error) {
      next(error);
    }
  }

  async listReports(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const result = await reportService.listReports(user.id, user.role, req.query);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async reviewReport(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { id } = req.params;
      const result = await reportService.reviewReport(id, user.id, user.role, req.body);
      return res.status(200).json({
        message: `Report ${req.body.action === 'approve' ? 'approved' : 'returned for correction'} successfully.`,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getReportVersions(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { id } = req.params;
      const versions = await reportService.getReportVersions(id, user.id, user.role);
      return res.status(200).json({ versions });
    } catch (error) {
      next(error);
    }
  }

  async getReportComments(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { id } = req.params;
      const comments = await reportService.getReportComments(id, user.id, user.role);
      return res.status(200).json({ comments });
    } catch (error) {
      next(error);
    }
  }

  async managerQueue(req: Request, res: Response, _next: NextFunction) {
    return res.status(200).json({
      message: 'Manager review queue accessed successfully.',
      user: req.user,
    });
  }
}

export const reportController = new ReportController();
