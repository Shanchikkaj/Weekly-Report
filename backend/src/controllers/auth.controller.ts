import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { redis } from '../config/redis';

const COOKIE_NAME = 'refreshToken';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await authService.register(req.body);
      return res.status(201).json({
        message: 'User registered successfully.',
        user,
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { user, accessToken, refreshToken } = await authService.login(req.body);

      // Reset rate-limit on successful authentication
      const rateLimitKey = (req as any).rateLimitKey;
      if (rateLimitKey) {
        await redis.del(rateLimitKey).catch((e) => console.error('Redis del error:', e));
      }

      // Set refresh token in httpOnly cookie
      // In production across domains (e.g., Vercel + Render), sameSite must be 'none' with secure=true
      const isProduction = process.env.NODE_ENV === 'production';
      const cookieSameSite = (process.env.COOKIE_SAMESITE as 'lax' | 'strict' | 'none') || (isProduction ? 'none' : 'lax');
      const isCookieSecure = isProduction || cookieSameSite === 'none';

      res.cookie(COOKIE_NAME, refreshToken, {
        httpOnly: true,
        secure: isCookieSecure,
        sameSite: cookieSameSite,
        maxAge: SEVEN_DAYS_MS,
      });

      return res.status(200).json({
        message: 'Login successful.',
        user,
        accessToken,
      });
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies?.[COOKIE_NAME] || req.body?.refreshToken;
      const { accessToken } = await authService.refresh(refreshToken);


      return res.status(200).json({
        accessToken,
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies?.[COOKIE_NAME];
      await authService.logout(refreshToken);

      const isProduction = process.env.NODE_ENV === 'production';
      const cookieSameSite = (process.env.COOKIE_SAMESITE as 'lax' | 'strict' | 'none') || (isProduction ? 'none' : 'lax');
      const isCookieSecure = isProduction || cookieSameSite === 'none';

      res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: isCookieSecure,
        sameSite: cookieSameSite,
      });

      return res.status(200).json({
        message: 'Logged out successfully.',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
