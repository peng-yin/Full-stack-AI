import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { redisUtils } from '@/lib/redis'
import { z } from 'zod'

const PRODUCTS_CACHE_KEY = 'products:list'
const PRODUCT_CACHE_KEY = 'product'
const CACHE_TTL = 300 // 5分钟
const NULL_CACHE_TTL = 60 // 空值缓存1分钟

// 创建商品的验证 schema
const createProductSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().optional(),
  price: z.number().positive('Price must be positive'),
  stock: z.number().int().min(0).default(0),
  categoryId: z.number().int().positive().optional(),
  images: z.array(z.string().url()).optional(),
})

// GET /api/products - 获取商品列表
// 演示：分页缓存、缓存雪崩防护（随机过期时间）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '10')
    const categoryId = searchParams.get('categoryId')
    const search = searchParams.get('search')
    const sortBy = searchParams.get('sortBy') || 'createdAt' // createdAt, price, salesCount
    const sortOrder = searchParams.get('sortOrder') || 'desc'

    // 构建缓存 key（包含所有查询参数）
    const cacheKey = `${PRODUCTS_CACHE_KEY}:${page}:${pageSize}:${categoryId || ''}:${search || ''}:${sortBy}:${sortOrder}`

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

    // 构建查询条件
    const whereClause: Record<string, unknown> = {
      status: 'ACTIVE',
    }

    if (categoryId) {
      whereClause.categoryId = parseInt(categoryId)
    }

    if (search) {
      whereClause.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ]
    }

    // 构建排序
    const orderBy: Record<string, string> = {}
    if (['createdAt', 'price', 'salesCount', 'viewCount'].includes(sortBy)) {
      orderBy[sortBy] = sortOrder === 'asc' ? 'asc' : 'desc'
    } else {
      orderBy.createdAt = 'desc'
    }

    // 从数据库获取
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: whereClause,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          stock: true,
          status: true,
          salesCount: true,
          viewCount: true,
          images: true,
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          createdAt: true,
        },
        orderBy,
      }),
      prisma.product.count({ where: whereClause }),
    ])

    const result = { data: products, total }

    // 使用随机过期时间防止缓存雪崩
    await redisUtils.setWithJitter(cacheKey, result, CACHE_TTL, 0.2)

    return NextResponse.json({
      ...result,
      page,
      pageSize,
      source: 'database',
    })
  } catch (error) {
    console.error('Error fetching products:', error)
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    )
  }
}

// POST /api/products - 创建商品
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 验证请求体
    const validation = createProductSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { name, description, price, stock, categoryId, images } = validation.data

    // 如果指定了分类，检查分类是否存在
    if (categoryId) {
      const category = await prisma.category.findUnique({ where: { id: categoryId } })
      if (!category) {
        return NextResponse.json(
          { error: 'Category not found' },
          { status: 404 }
        )
      }
    }

    // 创建商品
    const product = await prisma.product.create({
      data: {
        name,
        description,
        price,
        stock,
        categoryId,
        images: images ? JSON.stringify(images) : null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        stock: true,
        status: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
      },
    })

    // 清除商品列表缓存
    await redisUtils.delPattern(`${PRODUCTS_CACHE_KEY}:*`)

    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    console.error('Error creating product:', error)
    return NextResponse.json(
      { error: 'Failed to create product' },
      { status: 500 }
    )
  }
}
