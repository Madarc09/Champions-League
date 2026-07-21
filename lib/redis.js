import { Redis } from "@upstash/redis";

let redisClient;

function redisCredentials() {
  return {
    // Direct Upstash integrations use UPSTASH_*. Vercel's older KV integration
    // injects the same REST credentials as KV_REST_API_*.
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "",
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || ""
  };
}

export function getRedis() {
  const { url, token } = redisCredentials();
  if (!url || !token) return null;

  if (!redisClient) {
    redisClient = new Redis({ url, token });
  }

  return redisClient;
}

export function redisEnabled() {
  const { url, token } = redisCredentials();
  return Boolean(url && token);
}
