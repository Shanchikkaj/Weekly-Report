import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60; // 15 minutes

export const getLoginRateLimitKey = (ip: string, email: string): string => {
  const cleanIp = ip.replace(/[:.]/g, '_');
  const cleanEmail = email.toLowerCase().trim();
  return `rate_limit:login:${cleanIp}:${cleanEmail}`;
};

export const loginRateLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const rawIp = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';
    const email = req.body?.email ? String(req.body.email).toLowerCase().trim() : 'unknown';
    const key = getLoginRateLimitKey(rawIp, email);

    // Atomically increment attempt count
    const attempts = await redis.incr(key);

    // If first attempt, set TTL window
    if (attempts === 1) {
      await redis.expire(key, WINDOW_SECONDS);
    }

    // Attach key to req so controller can clear it on successful authentication
    (req as any).rateLimitKey = key;

    if (attempts > MAX_ATTEMPTS) {
      const ttl = await redis.ttl(key);
      const waitMinutes = Math.ceil((ttl > 0 ? ttl : WINDOW_SECONDS) / 60);

      return res.status(429).json({
        error: `Too many login attempts. Please try again after ${waitMinutes} minutes.`,
      });
    }

    next();
  } catch (error) {
    // If Redis encounters a transient error, don't break the entire login route
    console.error('[RateLimiter Error]:', error);
    next();
  }
};
