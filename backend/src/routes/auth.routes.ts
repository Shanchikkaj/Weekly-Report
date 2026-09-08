import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { loginRateLimiter } from '../middleware/loginRateLimiter';

const router = Router();

router.post('/register', authController.register);
router.post('/login', loginRateLimiter, authController.login);
router.post('/refresh', authController.refresh);
router.get('/refresh', authController.refresh);
router.post('/logout', authController.logout);


export default router;
