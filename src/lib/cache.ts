import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    return await redis.get<T>(key)
  } catch {
    return null
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, value, { ex: ttlSeconds })
  } catch {
    // Cache failures are non-fatal
  }
}

export const MODULE_TTL: Record<string, number> = {
  crops: 6 * 3600,
  weather: 3 * 3600,
  dams: 12 * 3600,
  budget: 24 * 3600,
  elections: 24 * 3600,
  schemes: 24 * 3600,
  mpi: 7 * 24 * 3600,
  demographics: 7 * 24 * 3600,
}
