import { redis } from '../../config/redis';

afterAll(async () => {
  // Flush Redis database 1 used during tests
  try {
    if (redis.status === 'ready' || redis.status === 'connect') {
      await redis.flushdb();
    }
  } catch {}
});
