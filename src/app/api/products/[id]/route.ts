import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { redisUtils } from '@/lib/redis'
import { z } from 'zod'

const PRODUCTS_CACHE_KEY = 'products:list'
const PRODUCT_CACHE_KEY = 'product'
const PRODUCT_VIEW_KEY = 'product:views'
const CACHE_TTL = 300
const NULL_CACHE_TTL = 60

// 更新商品的验证 schema
const updateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  price: z.number().positive().optional(),
  stock: z.number().int().min(0).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'OUT_OF_STOCK']).optional(),
  images: z.array(z.string().url()).optional(),
})

// GET /api/products/[id] - 获取单个商品
// 演示：缓存穿透防护（缓存空值）、缓存击穿防护（分布式锁）、浏览量统计
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 })
    }

    const cacheKey = `${PRODUCT_CACHE_KEY}:${id}`

    // 使用缓存穿透防护获取商品
    // 如果商品不存在，也会缓存空值，防止恶意请求穿透到数据库
    const product = await redisUtils.getOrSetWithNull(
      cacheKey,
      async () => {
        return await prisma.product.findUnique({
          where: { id },
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
            updatedAt: true,
          },
        })
      },
      CACHE_TTL,
      NULL_CACHE_TTL
    )

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // 异步增加浏览量（使用 Redis 计数，定期同步到数据库）
    // 这样可以避免频繁写数据库
    incrementViewCount(id).catch(console.error)

    return NextResponse.json({ data: product })
  } catch (error) {
    console.error('Error fetching product:', error)
    return NextResponse.json(
      { error: 'Failed to fetch product' },
      { status: 500 }
    )
  }
}

// 异步增加浏览量
async function incrementViewCount(productId: number) {
  const viewKey = `${PRODUCT_VIEW_KEY}:${productId}`
  const count = await redisUtils.incr(viewKey)
  
  // 每累积100次浏览，同步到数据库
  if (count % 100 === 0) {
    await prisma.product.update({
      where: { id: productId },
      data: { viewCount: { increment: 100 } },
    })
    // 重置计数器
    await redisUtils.del(viewKey)
    // 清除商品缓存
    await redisUtils.del(`${PRODUCT_CACHE_KEY}:${productId}`)
  }
}

// PUT /api/products/[id] - 更新商品
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 })
    }

    const body = await request.json()
    const validation = updateProductSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      )
    }

    // 检查商品是否存在
    const existingProduct = await prisma.product.findUnique({ where: { id } })
    if (!existingProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // 如果更新分类，检查分类是否存在
    if (validation.data.categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: validation.data.categoryId },
      })
      if (!category) {
        return NextResponse.json(
          { error: 'Category not found' },
          { status: 404 }
        )
      }
    }

    // 准备更新数据
    const updateData: Record<string, unknown> = { ...validation.data }
    if (validation.data.images) {
      updateData.images = JSON.stringify(validation.data.images)
    }

    // 更新商品
    const product = await prisma.product.update({
      where: { id },
      data: updateData,
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
        updatedAt: true,
      },
    })

    // 清除缓存
    await Promise.all([
      redisUtils.del(`${PRODUCT_CACHE_KEY}:${id}`),
      redisUtils.delPattern(`${PRODUCTS_CACHE_KEY}:*`),
    ])

    return NextResponse.json(product)
  } catch (error) {
    console.error('Error updating product:', error)
    return NextResponse.json(
      { error: 'Failed to update product' },
      { status: 500 }
    )
  }
}

// DELETE /api/products/[id] - 删除商品
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 })
    }

    // 检查商品是否存在
    const existingProduct = await prisma.product.findUnique({ where: { id } })
    if (!existingProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // 检查是否有未完成的订单
    const pendingOrders = await prisma.orderItem.count({
      where: {
        productId: id,
        order: {
          status: { in: ['PENDING', 'PAID', 'SHIPPED'] },
        },
      },
    })

    if (pendingOrders > 0) {
      return NextResponse.json(
        { error: 'Cannot delete product with pending orders' },
        { status: 400 }
      )
    }

    // 删除商品
    await prisma.product.delete({ where: { id } })

    // 清除缓存
    await Promise.all([
      redisUtils.del(`${PRODUCT_CACHE_KEY}:${id}`),
      redisUtils.delPattern(`${PRODUCTS_CACHE_KEY}:*`),
    ])

    return NextResponse.json({ message: 'Product deleted successfully' })
  } catch (error) {
    console.error('Error deleting product:', error)
    return NextResponse.json(
      { error: 'Failed to delete product' },
      { status: 500 }
    )
  }
}
