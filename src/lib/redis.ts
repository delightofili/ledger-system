import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);

      return delay;
    },
    maxRetriesPerRequest: 3,
  });

redis.on("connect", () => console.log("Redis connected"));
redis.on("error", (err) => console.error("Redis error:", err));

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

export default redis;
