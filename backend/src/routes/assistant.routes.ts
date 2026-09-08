import { Router } from 'express';
import { assistantController } from '../controllers/assistant.controller';
import { requireRole } from '../middleware/auth.middleware';
import { assistantRateLimiter } from '../middleware/assistantRateLimiter';

const router = Router();

// Manager role enforcement on AI assistant query endpoint
router.use(requireRole('manager'));

router.post('/query', assistantRateLimiter, assistantController.query);

export default router;

