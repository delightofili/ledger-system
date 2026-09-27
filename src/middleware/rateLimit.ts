import { Request, Response, NextFunction } from "express";
import { redis } from "../lib/redis";

interface RateLimitOptions {
  windowSeconds: number;
  maxRequests: number;
  keyPrefix?: string;
}

export function rateLimit(options: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const identifier = (req.headers["x-user-id"] as string) || req.ip;
    const prefix = options.keyPrefix || "global";
    const key = `ratelimit:${prefix}:${identifier}`;

    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, options.windowSeconds);
    }

    res.setHeader("X-RateLimit-Limit", options.maxRequests);
    res.setHeader(
      "X-RateLimit-Remaining",
      Math.max(0, options.maxRequests - count),
    );

    if (count > options.maxRequests) {
      return res.status(429).json({
        error: "Rate limit exceeded",
        retryAfter: await redis.ttl(key),
      });
    }

    next();
  };
}
