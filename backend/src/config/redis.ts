import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy(times) {
    if (times > 5) {
      return null; // Stop retrying after 5 attempts
    }
    return Math.min(times * 1000, 3000);
  },
});

redis.on('error', (err: any) => {
  console.error(`[Redis] Connection error: ${err?.message || err}`);
});

export const connectRedis = async (): Promise<boolean> => {
  try {
    await redis.connect();
    await redis.ping();
    console.log('[Redis] Connected successfully');
    return true;
  } catch (error: any) {
    console.error(`[Redis] Connection error: ${error?.message || error}`);
    return false;
  }
};
