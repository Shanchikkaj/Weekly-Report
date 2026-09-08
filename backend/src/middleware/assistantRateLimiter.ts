import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';

const MAX_REQUESTS = 10;
const WINDOW_SECONDS = 60 * 60; // 1 hour (3600 seconds)

export const getAssistantRateLimitKey = (userId: string): string => {
  return `rate_limit:assistant:${userId}`;
};

export const assistantRateLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const key = getAssistantRateLimitKey(userId);

    // Atomically increment request count
    const count = await redis.incr(key);

    // Set TTL on first request or if key lacks expiry
    if (count === 1) {
      await redis.expire(key, WINDOW_SECONDS);
    } else {
      const currentTtl = await redis.ttl(key);
      if (currentTtl === -1) {
        await redis.expire(key, WINDOW_SECONDS);
      }
    }

    if (count > MAX_REQUESTS) {
      const ttl = await redis.ttl(key);
      const waitMinutes = Math.ceil((ttl > 0 ? ttl : WINDOW_SECONDS) / 60);

      return res.status(429).json({
        error: `Rate limit exceeded. AI assistant queries are limited to ${MAX_REQUESTS} requests per hour. Please try again in ${waitMinutes} minute${waitMinutes === 1 ? '' : 's'}.`,
      });
    }

    next();
  } catch (error) {
    console.error('[AssistantRateLimiter Error]:', error);
    next();
  }
};
