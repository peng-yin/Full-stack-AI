import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { redisUtils } from '@/lib/redis'
import { z } from 'zod'

const ORDERS_CACHE_KEY = 'orders:list'
const ORDER_CACHE_KEY = 'order'
const CACHE_TTL = 60

// 创建订单的验证 schema
const createOrderSchema = z.object({
  userId: z.number().int().positive(),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().positive(),
  })).min(1, 'At least one item is required'),
  address: z.string().min(1, 'Address is required'),
  remark: z.string().optional(),
})

// 生成订单号
function generateOrderNo(): string {
  const now = new Date()
  const dateStr = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `ORD${dateStr}${random}`
}

// GET /api/orders - 获取订单列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '10')
    const userId = searchParams.get('userId')
    const status = searchParams.get('status')

    // 构建查询条件
    const whereClause: Record<string, unknown> = {}
    if (userId) {
      whereClause.userId = parseInt(userId)
    }
    if (status) {
      whereClause.status = status
    }

    // 尝试从缓存获取
    const cacheKey = `${ORDERS_CACHE_KEY}:${userId || 'all'}:${status || 'all'}:${page}:${pageSize}`
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
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: whereClause,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          orderNo: true,
          totalAmount: true,
          status: true,
          address: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          items: {
            select: {
              id: true,
              quantity: true,
              price: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  images: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where: whereClause }),
    ])

    const result = { data: orders, total }

    // 写入缓存
    await redisUtils.set(cacheKey, result, CACHE_TTL)

    return NextResponse.json({
      ...result,
      page,
      pageSize,
      source: 'database',
    })
  } catch (error) {
    console.error('Error fetching orders:', error)
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    )
  }
}

// POST /api/orders - 创建订单
// 演示：事务处理、库存扣减、分布式锁防止超卖
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 验证请求体
    const validation = createOrderSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { userId, items, address, remark } = validation.data

    // 检查用户是否存在
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // 获取所有商品的分布式锁，防止超卖
    const productIds = items.map(item => item.productId)
    const lockKeys = productIds.map(id => `lock:product:stock:${id}`)
    const locks: Array<{ key: string; value: string }> = []

    try {
      // 按顺序获取锁，避免死锁
      const sortedLockKeys = [...lockKeys].sort()
      for (const lockKey of sortedLockKeys) {
        const lockValue = await redisUtils.acquireLock(lockKey, 30, 10, 100)
        if (!lockValue) {
          // 释放已获取的锁
          for (const lock of locks) {
            await redisUtils.releaseLock(lock.key, lock.value)
          }
          return NextResponse.json(
            { error: 'System busy, please try again' },
            { status: 503 }
          )
        }
        locks.push({ key: lockKey, value: lockValue })
      }

      // 获取商品信息并验证库存
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
      })

      const productMap = new Map(products.map(p => [p.id, p]))

      // 验证所有商品
      for (const item of items) {
        const product = productMap.get(item.productId)
        if (!product) {
          return NextResponse.json(
            { error: `Product ${item.productId} not found` },
            { status: 404 }
          )
        }
        if (product.status !== 'ACTIVE') {
          return NextResponse.json(
            { error: `Product ${product.name} is not available` },
            { status: 400 }
          )
        }
        if (product.stock < item.quantity) {
          return NextResponse.json(
            { error: `Insufficient stock for ${product.name}. Available: ${product.stock}` },
            { status: 400 }
          )
        }
      }

      // 计算总金额
      let totalAmount = 0
      const orderItems = items.map(item => {
        const product = productMap.get(item.productId)!
        const price = Number(product.price)
        totalAmount += price * item.quantity
        return {
          productId: item.productId,
          quantity: item.quantity,
          price: product.price,
        }
      })

      // 使用事务创建订单并扣减库存
      const order = await prisma.$transaction(async (tx) => {
        // 创建订单
        const newOrder = await tx.order.create({
          data: {
            orderNo: generateOrderNo(),
            userId,
            totalAmount,
            address,
            remark,
            items: {
              create: orderItems,
            },
          },
          select: {
            id: true,
            orderNo: true,
            totalAmount: true,
            status: true,
            address: true,
            createdAt: true,
            items: {
              select: {
                id: true,
                quantity: true,
                price: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        })

        // 扣减库存并增加销量
        for (const item of items) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: { decrement: item.quantity },
              salesCount: { increment: item.quantity },
            },
          })
        }

        return newOrder
      })

      // 清除相关缓存
      await Promise.all([
        redisUtils.delPattern(`${ORDERS_CACHE_KEY}:*`),
        ...productIds.map(id => redisUtils.del(`product:${id}`)),
        redisUtils.delPattern('products:*'),
      ])

      // 更新销量排行榜
      for (const item of items) {
        await redisUtils.zincrby('ranking:sales', item.quantity, item.productId.toString())
      }

      return NextResponse.json(order, { status: 201 })
    } finally {
      // 释放所有锁
      for (const lock of locks) {
        await redisUtils.releaseLock(lock.key, lock.value)
      }
    }
  } catch (error) {
    console.error('Error creating order:', error)
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    )
  }
}
