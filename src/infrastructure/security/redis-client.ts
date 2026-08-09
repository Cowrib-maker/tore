import Redis from "ioredis";

let client: Redis | null = null;

/**
 * Shared Redis client for production rate limiting (REDIS_URL).
 * Returns null when Redis is not configured (dev/test in-memory fallback).
 */
export function getRedisClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!client) {
    client = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });
  }

  return client;
}
