import Redis from 'ioredis'

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined
}

export const redis = globalForRedis.redis ?? new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis

// Redis 工具函数
export const redisUtils = {
  // 获取缓存
  async get<T>(key: string): Promise<T | null> {
    const data = await redis.get(key)
    if (!data) return null
    try {
      return JSON.parse(data) as T
    } catch {
      return data as unknown as T
    }
  },

  // 设置缓存
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const data = typeof value === 'string' ? value : JSON.stringify(value)
    if (ttlSeconds) {
      await redis.setex(key, ttlSeconds, data)
    } else {
      await redis.set(key, data)
    }
  },

  // 删除缓存
  async del(key: string): Promise<void> {
    await redis.del(key)
  },

  // 删除匹配的缓存
  async delPattern(pattern: string): Promise<void> {
    const keys = await redis.keys(pattern)
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  },

  // 设置验证码（带过期时间）
  async setVerificationCode(email: string, code: string, ttlSeconds = 300): Promise<void> {
    await redis.setex(`verification:${email}`, ttlSeconds, code)
  },

  // 获取验证码
  async getVerificationCode(email: string): Promise<string | null> {
    return await redis.get(`verification:${email}`)
  },

  // 删除验证码
  async delVerificationCode(email: string): Promise<void> {
    await redis.del(`verification:${email}`)
  },
}
