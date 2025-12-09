import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { redisUtils } from '@/lib/redis'
import { z } from 'zod'

const CATEGORIES_CACHE_KEY = 'categories:list'
const CATEGORY_TREE_CACHE_KEY = 'categories:tree'
const CACHE_TTL = 600 // 10分钟

// 创建分类的验证 schema
const createCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().optional(),
  parentId: z.number().int().positive().optional(),
})

// GET /api/categories - 获取分类列表
// 演示：树形结构缓存
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tree = searchParams.get('tree') === 'true'

    if (tree) {
      return await getCategoryTree()
    }

    // 尝试从缓存获取
    const cached = await redisUtils.get<unknown[]>(CATEGORIES_CACHE_KEY)
    if (cached) {
      return NextResponse.json({
        data: cached,
        source: 'cache',
      })
    }

    // 从数据库获取
    const categories = await prisma.category.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        parentId: true,
        parent: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            products: true,
            children: true,
          },
        },
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    // 写入缓存
    await redisUtils.set(CATEGORIES_CACHE_KEY, categories, CACHE_TTL)

    return NextResponse.json({
      data: categories,
      source: 'database',
    })
  } catch (error) {
    console.error('Error fetching categories:', error)
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    )
  }
}

// 获取分类树
async function getCategoryTree() {
  // 尝试从缓存获取
  const cached = await redisUtils.get<unknown[]>(CATEGORY_TREE_CACHE_KEY)
  if (cached) {
    return NextResponse.json({
      data: cached,
      source: 'cache',
    })
  }

  // 从数据库获取所有分类
  const categories = await prisma.category.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      parentId: true,
      _count: {
        select: {
          products: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  // 构建树形结构
  interface CategoryNode {
    id: number
    name: string
    description: string | null
    parentId: number | null
    productCount: number
    children: CategoryNode[]
  }

  const categoryMap = new Map<number, CategoryNode>()
  const roots: CategoryNode[] = []

  // 初始化所有节点
  for (const cat of categories) {
    categoryMap.set(cat.id, {
      id: cat.id,
      name: cat.name,
      description: cat.description,
      parentId: cat.parentId,
      productCount: cat._count.products,
      children: [],
    })
  }

  // 构建树
  for (const cat of categories) {
    const node = categoryMap.get(cat.id)!
    if (cat.parentId) {
      const parent = categoryMap.get(cat.parentId)
      if (parent) {
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    } else {
      roots.push(node)
    }
  }

  // 写入缓存
  await redisUtils.set(CATEGORY_TREE_CACHE_KEY, roots, CACHE_TTL)

  return NextResponse.json({
    data: roots,
    source: 'database',
  })
}

// POST /api/categories - 创建分类
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 验证请求体
    const validation = createCategorySchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { name, description, parentId } = validation.data

    // 如果指定了父分类，检查是否存在
    if (parentId) {
      const parent = await prisma.category.findUnique({ where: { id: parentId } })
      if (!parent) {
        return NextResponse.json(
          { error: 'Parent category not found' },
          { status: 404 }
        )
      }
    }

    // 创建分类
    const category = await prisma.category.create({
      data: {
        name,
        description,
        parentId,
      },
      select: {
        id: true,
        name: true,
        description: true,
        parentId: true,
        parent: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
      },
    })

    // 清除缓存
    await Promise.all([
      redisUtils.del(CATEGORIES_CACHE_KEY),
      redisUtils.del(CATEGORY_TREE_CACHE_KEY),
    ])

    return NextResponse.json(category, { status: 201 })
  } catch (error) {
    console.error('Error creating category:', error)
    return NextResponse.json(
      { error: 'Failed to create category' },
      { status: 500 }
    )
  }
}
