import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { requireRole } from '../middleware/auth.middleware';

const router = Router();

// Manager role enforcement on all dashboard aggregation endpoints
router.use(requireRole('manager'));

router.get('/summary', dashboardController.getSummary);
router.get('/reports', dashboardController.getReports);
router.get('/trends', dashboardController.getTrends);
router.get('/side-by-side', dashboardController.getSideBySide);
router.get('/weeks', dashboardController.getAvailableWeeks);

export default router;
