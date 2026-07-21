import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const globalForRedis = globalThis as unknown as {
  redisClient: Redis | undefined;
};

export function getRedisConnection(): Redis {
  if (!globalForRedis.redisClient) {
    globalForRedis.redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return globalForRedis.redisClient;
}

export const redis = getRedisConnection();
