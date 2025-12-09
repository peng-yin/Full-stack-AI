import { prisma } from './prisma'
import { redis } from './redis'
import crypto from 'crypto'

// 生成随机验证码
export function generateVerificationCode(length = 6): string {
  const chars = '0123456789'
  let code = ''
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// 生成 session token
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

// 简单的密码哈希（生产环境建议使用 bcrypt）
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex')
}

// 验证密码
export function verifyPassword(password: string, hashedPassword: string): boolean {
  return hashPassword(password) === hashedPassword
}

// 创建用户会话
export async function createSession(
  userId: number,
  userAgent?: string,
  ip?: string
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7天过期

  // 保存到数据库
  await prisma.session.create({
    data: {
      userId,
      token,
      userAgent,
      ip,
      expiresAt,
    },
  })

  // 保存到 Redis（用于快速验证）
  await redis.setex(
    `session:${token}`,
    7 * 24 * 60 * 60,
    JSON.stringify({ userId, expiresAt: expiresAt.toISOString() })
  )

  return { token, expiresAt }
}

// 验证会话
export async function verifySession(token: string): Promise<{ userId: number } | null> {
  // 先从 Redis 获取
  const cached = await redis.get(`session:${token}`)
  if (cached) {
    const session = JSON.parse(cached)
    if (new Date(session.expiresAt) > new Date()) {
      return { userId: session.userId }
    }
    // 过期则删除
    await redis.del(`session:${token}`)
    return null
  }

  // Redis 没有则从数据库获取
  const session = await prisma.session.findUnique({
    where: { token },
    select: { userId: true, expiresAt: true },
  })

  if (!session || session.expiresAt < new Date()) {
    return null
  }

  // 写回 Redis
  const ttl = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)
  if (ttl > 0) {
    await redis.setex(
      `session:${token}`,
      ttl,
      JSON.stringify({ userId: session.userId, expiresAt: session.expiresAt.toISOString() })
    )
  }

  return { userId: session.userId }
}

// 删除会话
export async function deleteSession(token: string): Promise<void> {
  await Promise.all([
    prisma.session.delete({ where: { token } }).catch(() => {}),
    redis.del(`session:${token}`),
  ])
}

// 删除用户所有会话
export async function deleteAllUserSessions(userId: number): Promise<void> {
  const sessions = await prisma.session.findMany({
    where: { userId },
    select: { token: true },
  })

  await Promise.all([
    prisma.session.deleteMany({ where: { userId } }),
    ...sessions.map((s) => redis.del(`session:${s.token}`)),
  ])
}
