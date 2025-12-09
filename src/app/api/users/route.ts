import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { redisUtils } from '@/lib/redis'
import { z } from 'zod'

const USERS_CACHE_KEY = 'users:list'
const CACHE_TTL = 60 // 60秒

// 创建用户的验证 schema
const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(1, 'Name is required').optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

// GET /api/users - 获取用户列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '10')
    const search = searchParams.get('search')

    // 尝试从缓存获取（如果没有搜索条件）
    const cacheKey = `${USERS_CACHE_KEY}:${page}:${pageSize}`
    const cached = await redisUtils.get<{ data: unknown[]; total: number }>(cacheKey)
    if (cached && !search) {
      return NextResponse.json({
        ...cached,
        page,
        pageSize,
        source: 'cache',
      })
    }

    // 从数据库获取
    const whereClause = search
      ? {
          OR: [
            { email: { contains: search } },
            { name: { contains: search } },
          ],
        }
      : {}

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: whereClause,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where: whereClause }),
    ])

    const result = { data: users, total }

    // 写入缓存
    await redisUtils.set(cacheKey, result, CACHE_TTL)

    return NextResponse.json({
      ...result,
      page,
      pageSize,
      source: 'database',
    })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

// POST /api/users - 创建用户
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 验证请求体
    const validation = createUserSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { email, name, password } = validation.data

    // 检查邮箱是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })
    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already exists' },
        { status: 409 }
      )
    }

    // 创建用户（实际项目中应该对密码进行哈希处理）
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password, // TODO: 使用 bcrypt 哈希
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    })

    // 清除缓存
    await redisUtils.delPattern(`${USERS_CACHE_KEY}:*`)

    return NextResponse.json(user, { status: 201 })
  } catch (error) {
    console.error('Error creating user:', error)
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    )
  }
}
