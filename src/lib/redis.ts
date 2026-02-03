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

  // Hash 操作 - 获取所有字段
  async hgetall<T = string>(key: string): Promise<Record<string, T>> {
    const data = await redis.hgetall(key)
    if (!data) return {}
    
    // 尝试将值转换为指定类型
    const result: Record<string, T> = {}
    for (const [field, value] of Object.entries(data)) {
      try {
        result[field] = JSON.parse(value) as T
      } catch {
        result[field] = value as unknown as T
      }
    }
    return result
  },

  // Hash 操作 - 设置字段
  async hset(key: string, field: string, value: unknown): Promise<void> {
    const data = typeof value === 'string' ? value : JSON.stringify(value)
    await redis.hset(key, field, data)
  },

  // Hash 操作 - 获取字段
  async hget<T = string>(key: string, field: string): Promise<T | null> {
    const data = await redis.hget(key, field)
    if (!data) return null
    try {
      return JSON.parse(data) as T
    } catch {
      return data as unknown as T
    }
  },

  // Hash 操作 - 删除字段
  async hdel(key: string, ...fields: string[]): Promise<void> {
    if (fields.length > 0) {
      await redis.hdel(key, ...fields)
    }
  },

  // Hash 操作 - 增加字段值
  async hincrby(key: string, field: string, increment: number): Promise<number> {
    return await redis.hincrby(key, field, increment)
  },

  // Hash 操作 - 批量设置多个字段
  async hmset(key: string, data: Record<string, unknown>): Promise<void> {
    const flatData: Record<string, string> = {}
    for (const [field, value] of Object.entries(data)) {
      flatData[field] = typeof value === 'string' ? value : JSON.stringify(value)
    }
    await redis.hmset(key, flatData)
  },

  // 设置过期时间
  async expire(key: string, seconds: number): Promise<void> {
    await redis.expire(key, seconds)
  },

  // 获取 TTL
  async ttl(key: string): Promise<number> {
    return await redis.ttl(key)
  },

  // 检查键是否存在
  async exists(key: string): Promise<boolean> {
    const result = await redis.exists(key)
    return result === 1
  },

  // 分布式锁 - 获取锁
  async acquireLock(
    key: string,
    ttlSeconds: number,
    retryTimes = 3,
    retryDelayMs = 100
  ): Promise<string | null> {
    const lockValue = `${Date.now()}-${Math.random()}`
    
    for (let i = 0; i < retryTimes; i++) {
      const result = await redis.set(key, lockValue, 'EX', ttlSeconds, 'NX')
      if (result === 'OK') {
        return lockValue
      }
      
      // 等待后重试
      if (i < retryTimes - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs))
      }
    }
    
    return null
  },

  // 分布式锁 - 释放锁
  async releaseLock(key: string, lockValue: string): Promise<boolean> {
    // Lua 脚本确保原子性：只有持有锁的进程才能释放
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `
    
    const result = await redis.eval(script, 1, key, lockValue)
    return result === 1
  },

  // Sorted Set 操作 - 添加成员
  async zadd(key: string, score: number, member: string): Promise<void> {
    await redis.zadd(key, score, member)
  },

  // Sorted Set 操作 - 增加成员分数
  async zincrby(key: string, increment: number, member: string): Promise<number> {
    const result = await redis.zincrby(key, increment, member)
    return parseFloat(result)
  },

  // Sorted Set 操作 - 获取倒序排名（从高到低，从0开始）
  async zrevrank(key: string, member: string): Promise<number | null> {
    const rank = await redis.zrevrank(key, member)
    return rank
  },

  // Sorted Set 操作 - 获取倒序范围（从高到低）
  async zrevrange(key: string, start: number, stop: number, withScores = false): Promise<string[]> {
    if (withScores) {
      return await redis.zrevrange(key, start, stop, 'WITHSCORES')
    }
    return await redis.zrevrange(key, start, stop)
  },

  // Sorted Set 操作 - 获取正序范围（从低到高）
  async zrange(key: string, start: number, stop: number, withScores = false): Promise<string[]> {
    if (withScores) {
      return await redis.zrange(key, start, stop, 'WITHSCORES')
    }
    return await redis.zrange(key, start, stop)
  },

  // Sorted Set 操作 - 删除成员
  async zrem(key: string, ...members: string[]): Promise<void> {
    if (members.length > 0) {
      await redis.zrem(key, ...members)
    }
  },

  // List 操作 - 左侧推入
  async lpush(key: string, value: unknown): Promise<void> {
    const data = typeof value === 'string' ? value : JSON.stringify(value)
    await redis.lpush(key, data)
  },

  // List 操作 - 右侧推入
  async rpush(key: string, value: unknown): Promise<void> {
    const data = typeof value === 'string' ? value : JSON.stringify(value)
    await redis.rpush(key, data)
  },

  // List 操作 - 获取范围
  async lrange<T = string>(key: string, start: number, stop: number): Promise<T[]> {
    const data = await redis.lrange(key, start, stop)
    return data.map(item => {
      try {
        return JSON.parse(item) as T
      } catch {
        return item as unknown as T
      }
    })
  },

  // List 操作 - 修剪列表
  async ltrim(key: string, start: number, stop: number): Promise<void> {
    await redis.ltrim(key, start, stop)
  },

  // Set 操作 - 添加成员
  async sadd(key: string, ...members: string[]): Promise<void> {
    if (members.length > 0) {
      await redis.sadd(key, ...members)
    }
  },

  // Set 操作 - 获取所有成员
  async smembers(key: string): Promise<string[]> {
    return await redis.smembers(key)
  },

  // Set 操作 - 删除成员
  async srem(key: string, ...members: string[]): Promise<void> {
    if (members.length > 0) {
      await redis.srem(key, ...members)
    }
  },

  // Set 操作 - 检查成员是否存在
  async sismember(key: string, member: string): Promise<boolean> {
    const result = await redis.sismember(key, member)
    return result === 1
  },

  // Set 操作 - 获取集合大小
  async scard(key: string): Promise<number> {
    return await redis.scard(key)
  },

  // 计数器操作 - 自增
  async incr(key: string): Promise<number> {
    return await redis.incr(key)
  },

  // 计数器操作 - 增加指定值
  async incrBy(key: string, increment: number): Promise<number> {
    return await redis.incrby(key, increment)
  },

  // 计数器操作 - 自减
  async decr(key: string): Promise<number> {
    return await redis.decr(key)
  },

  // 计数器操作 - 减少指定值
  async decrBy(key: string, decrement: number): Promise<number> {
    return await redis.decrby(key, decrement)
  },

  // 按日期自增（用于统计）
  async incrByDate(baseKey: string, date?: Date): Promise<number> {
    const targetDate = date || new Date()
    const dateStr = targetDate.toISOString().split('T')[0] // YYYY-MM-DD
    const key = `${baseKey}:${dateStr}`
    return await redis.incr(key)
  },

  // 缓存穿透防护 - 获取或设置（支持 null 值缓存）
  async getOrSetWithNull<T>(
    key: string,
    fetchFn: () => Promise<T | null>,
    ttlSeconds = 300,
    nullTtlSeconds = 60
  ): Promise<T | null> {
    // 先尝试从缓存获取
    const cached = await redis.get(key)
    
    if (cached !== null) {
      // 如果缓存的是特殊的 null 标记
      if (cached === '__NULL__') {
        return null
      }
      try {
        return JSON.parse(cached) as T
      } catch {
        return cached as unknown as T
      }
    }
    
    // 缓存不存在，从数据库获取
    const data = await fetchFn()
    
    if (data === null) {
      // 缓存 null 值（用特殊标记），防止缓存穿透
      await redis.setex(key, nullTtlSeconds, '__NULL__')
      return null
    }
    
    // 缓存正常数据
    const value = typeof data === 'string' ? data : JSON.stringify(data)
    await redis.setex(key, ttlSeconds, value)
    return data
  },

  // 缓存击穿防护 - 使用分布式锁获取或设置
  async getOrSetWithLock<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds = 300,
    lockTtlSeconds = 10
  ): Promise<T> {
    // 先尝试从缓存获取
    const cached = await this.get<T>(key)
    if (cached !== null) {
      return cached
    }
    
    // 缓存不存在，尝试获取锁
    const lockKey = `lock:${key}`
    const lockValue = await this.acquireLock(lockKey, lockTtlSeconds, 10, 50)
    
    if (lockValue) {
      try {
        // 获取到锁，双重检查缓存（防止其他进程已经设置）
        const doubleCheck = await this.get<T>(key)
        if (doubleCheck !== null) {
          return doubleCheck
        }
        
        // 执行耗时操作
        const data = await fetchFn()
        
        // 设置缓存
        await this.set(key, data, ttlSeconds)
        
        return data
      } finally {
        // 释放锁
        await this.releaseLock(lockKey, lockValue)
      }
    } else {
      // 没有获取到锁，等待一小段时间后重试获取缓存
      await new Promise(resolve => setTimeout(resolve, 100))
      const retryCache = await this.get<T>(key)
      if (retryCache !== null) {
        return retryCache
      }
      
      // 如果还是没有，直接查询（降级策略）
      return await fetchFn()
    }
  },

  // 缓存雪崩防护 - 设置带随机抖动的过期时间
  async setWithJitter(
    key: string,
    value: unknown,
    ttlSeconds: number,
    jitterRatio = 0.1
  ): Promise<void> {
    // 添加随机抖动（±10%）
    const jitter = Math.floor(ttlSeconds * jitterRatio * (Math.random() * 2 - 1))
    const finalTtl = ttlSeconds + jitter
    await this.set(key, value, finalTtl)
  },

  // 统计辅助 - 按日期范围获取计数
  async getCountsByDateRange(
    baseKey: string,
    startDate: Date,
    endDate: Date
  ): Promise<Record<string, number>> {
    const result: Record<string, number> = {}
    const currentDate = new Date(startDate)
    
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0]
      const key = `${baseKey}:${dateStr}`
      const count = await redis.get(key)
      result[dateStr] = count ? parseInt(count) : 0
      
      // 下一天
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    return result
  },
}
