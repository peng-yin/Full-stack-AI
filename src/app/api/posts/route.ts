import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { redisUtils } from '@/lib/redis'
import { z } from 'zod'

const POSTS_CACHE_KEY = 'posts:list'
const POST_CACHE_KEY = 'post'
const LATEST_POSTS_KEY = 'posts:latest'
const CACHE_TTL = 120 // 2分钟
const LATEST_POSTS_LIMIT = 20

// 创建文章的验证 schema
const createPostSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  content: z.string().optional(),
  authorId: z.number().int().positive(),
  published: z.boolean().default(false),
})

// GET /api/posts - 获取文章列表
// 演示：最新列表使用 Redis List
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '10')
    const authorId = searchParams.get('authorId')
    const published = searchParams.get('published')
    const latest = searchParams.get('latest') === 'true'

    // 获取最新文章（使用 Redis List）
    if (latest && page === 1) {
      const cachedLatest = await redisUtils.lrange<{
        id: number
        title: string
        authorId: number
        authorName: string
        createdAt: string
      }>(LATEST_POSTS_KEY, 0, pageSize - 1)

      if (cachedLatest.length > 0) {
        return NextResponse.json({
          data: cachedLatest,
          total: cachedLatest.length,
          page: 1,
          pageSize,
          source: 'cache',
        })
      }
    }

    // 构建查询条件
    const whereClause: Record<string, unknown> = {}
    if (authorId) {
      whereClause.authorId = parseInt(authorId)
    }
    if (published !== null) {
      whereClause.published = published === 'true'
    }

    // 构建缓存 key
    const cacheKey = `${POSTS_CACHE_KEY}:${page}:${pageSize}:${authorId || ''}:${published || ''}`

    // 尝试从缓存获取
    const cached = await redisUtils.get<{ data: unknown[]; total: number }>(cacheKey)
    if (cached) {
      return NextResponse.json({
        ...cached,
        page,
        pageSize,
        source: 'cache',
      })
    }

    // 从数据库获取
    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where: whereClause,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          title: true,
          content: true,
          published: true,
          viewCount: true,
          author: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.post.count({ where: whereClause }),
    ])

    const result = { data: posts, total }

    // 写入缓存
    await redisUtils.set(cacheKey, result, CACHE_TTL)

    return NextResponse.json({
      ...result,
      page,
      pageSize,
      source: 'database',
    })
  } catch (error) {
    console.error('Error fetching posts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    )
  }
}

// POST /api/posts - 创建文章
// 演示：使用 Redis List 维护最新列表
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 验证请求体
    const validation = createPostSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { title, content, authorId, published } = validation.data

    // 检查作者是否存在
    const author = await prisma.user.findUnique({ where: { id: authorId } })
    if (!author) {
      return NextResponse.json({ error: 'Author not found' }, { status: 404 })
    }

    // 创建文章
    const post = await prisma.post.create({
      data: {
        title,
        content,
        authorId,
        published,
      },
      select: {
        id: true,
        title: true,
        content: true,
        published: true,
        author: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
      },
    })

    // 如果是已发布的文章，添加到最新列表
    if (published) {
      const latestItem = {
        id: post.id,
        title: post.title,
        authorId: post.author.id,
        authorName: post.author.name,
        createdAt: post.createdAt.toISOString(),
      }
      
      // 添加到列表头部
      await redisUtils.lpush(LATEST_POSTS_KEY, latestItem)
      // 只保留最新的 N 条
      await redisUtils.ltrim(LATEST_POSTS_KEY, 0, LATEST_POSTS_LIMIT - 1)
    }

    // 清除列表缓存
    await redisUtils.delPattern(`${POSTS_CACHE_KEY}:*`)

    return NextResponse.json(post, { status: 201 })
  } catch (error) {
    console.error('Error creating post:', error)
    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500 }
    )
  }
}
