import { Router } from 'express';
import { reportController } from '../controllers/report.controller';
import { requireRole } from '../middleware/auth.middleware';

const router = Router();

// Manager review queue route (declared before parameterized /:id to prevent route shadowing)
router.get('/manager/review-queue', requireRole('manager'), reportController.managerQueue);

// List reports (paginated)
router.get('/', reportController.listReports);

// Create report (TeamMember only)
router.post('/', requireRole('team_member'), reportController.createReport);

// Get single report by ID (Owner or Manager)
router.get('/:id', reportController.getReportById);

// Update report content (Owner only, while draft or needs_correction; Managers rejected)
router.put('/:id', reportController.updateReportContent);

// Submit report (Owner only, draft|needs_correction -> submitted)
router.post('/:id/submit', reportController.submitReport);

// Manager review action (approve | request_changes) - Manager only
router.post('/:id/review', requireRole('manager'), reportController.reviewReport);

// Report version history (Owner or Manager)
router.get('/:id/versions', reportController.getReportVersions);

// Report review comments history (Owner or Manager)
router.get('/:id/comments', reportController.getReportComments);

export default router;
