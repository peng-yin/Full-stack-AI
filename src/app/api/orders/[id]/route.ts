import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { redisUtils } from '@/lib/redis'
import { z } from 'zod'

const ORDERS_CACHE_KEY = 'orders:list'
const ORDER_CACHE_KEY = 'order'
const CACHE_TTL = 60

// 更新订单状态的验证 schema
const updateOrderSchema = z.object({
  status: z.enum(['PAID', 'SHIPPED', 'COMPLETED', 'CANCELLED']),
})

// GET /api/orders/[id] - 获取单个订单
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 })
    }

    // 尝试从缓存获取
    const cacheKey = `${ORDER_CACHE_KEY}:${id}`
    const cached = await redisUtils.get(cacheKey)
    if (cached) {
      return NextResponse.json({ data: cached, source: 'cache' })
    }

    // 从数据库获取
    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        orderNo: true,
        totalAmount: true,
        status: true,
        address: true,
        remark: true,
        paidAt: true,
        shippedAt: true,
        completedAt: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
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
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // 写入缓存
    await redisUtils.set(cacheKey, order, CACHE_TTL)

    return NextResponse.json({ data: order, source: 'database' })
  } catch (error) {
    console.error('Error fetching order:', error)
    return NextResponse.json(
      { error: 'Failed to fetch order' },
      { status: 500 }
    )
  }
}

// PUT /api/orders/[id] - 更新订单状态
// 演示：状态机、事务处理、库存回滚
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 })
    }

    const body = await request.json()
    const validation = updateOrderSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { status: newStatus } = validation.data

    // 获取分布式锁
    const lockKey = `lock:order:${id}`
    const lockValue = await redisUtils.acquireLock(lockKey, 30, 5, 100)
    if (!lockValue) {
      return NextResponse.json(
        { error: 'Order is being processed, please try again' },
        { status: 503 }
      )
    }

    try {
      // 获取当前订单
      const existingOrder = await prisma.order.findUnique({
        where: { id },
        include: { items: true },
      })

      if (!existingOrder) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      }

      // 状态机验证
      const validTransitions: Record<string, string[]> = {
        PENDING: ['PAID', 'CANCELLED'],
        PAID: ['SHIPPED', 'CANCELLED', 'REFUNDED'],
        SHIPPED: ['COMPLETED'],
        COMPLETED: ['REFUNDED'],
        CANCELLED: [],
        REFUNDED: [],
      }

      const allowedStatuses = validTransitions[existingOrder.status] || []
      if (!allowedStatuses.includes(newStatus)) {
        return NextResponse.json(
          { error: `Cannot change status from ${existingOrder.status} to ${newStatus}` },
          { status: 400 }
        )
      }

      // 准备更新数据
      const updateData: Record<string, unknown> = { status: newStatus }
      const now = new Date()

      switch (newStatus) {
        case 'PAID':
          updateData.paidAt = now
          break
        case 'SHIPPED':
          updateData.shippedAt = now
          break
        case 'COMPLETED':
          updateData.completedAt = now
          break
        case 'CANCELLED':
          updateData.cancelledAt = now
          break
      }

      // 如果是取消订单，需要回滚库存
      if (newStatus === 'CANCELLED' && existingOrder.status === 'PENDING') {
        await prisma.$transaction(async (tx) => {
          // 更新订单状态
          await tx.order.update({
            where: { id },
            data: updateData,
          })

          // 回滚库存
          for (const item of existingOrder.items) {
            await tx.product.update({
              where: { id: item.productId },
              data: {
                stock: { increment: item.quantity },
                salesCount: { decrement: item.quantity },
              },
            })

            // 更新销量排行榜
            await redisUtils.zincrby('ranking:sales', -item.quantity, item.productId.toString())
          }
        })
      } else {
        // 普通状态更新
        await prisma.order.update({
          where: { id },
          data: updateData,
        })
      }

      // 获取更新后的订单
      const updatedOrder = await prisma.order.findUnique({
        where: { id },
        select: {
          id: true,
          orderNo: true,
          totalAmount: true,
          status: true,
          paidAt: true,
          shippedAt: true,
          completedAt: true,
          cancelledAt: true,
          updatedAt: true,
        },
      })

      // 清除缓存
      await Promise.all([
        redisUtils.del(`${ORDER_CACHE_KEY}:${id}`),
        redisUtils.delPattern(`${ORDERS_CACHE_KEY}:*`),
      ])

      // 记录日订单统计
      if (newStatus === 'PAID') {
        await redisUtils.incrByDate('stats:orders:paid')
        await redisUtils.incrBy('stats:revenue:today', Number(existingOrder.totalAmount))
      }

      return NextResponse.json(updatedOrder)
    } finally {
      await redisUtils.releaseLock(lockKey, lockValue)
    }
  } catch (error) {
    console.error('Error updating order:', error)
    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500 }
    )
  }
}
