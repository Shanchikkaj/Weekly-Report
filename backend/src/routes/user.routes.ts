import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { requireRole } from '../middleware/auth.middleware';

const router = Router();

// Manager-only administration endpoints
router.get('/', requireRole('manager'), userController.listUsers);
router.post('/', requireRole('manager'), userController.createUser);
router.put('/:id/role', requireRole('manager'), userController.updateRole);
router.put('/:id/status', requireRole('manager'), userController.updateStatus);

// User stats: Managers can view any user; Team members can view only their own
router.get('/:id/stats', userController.getUserStats);

export default router;
