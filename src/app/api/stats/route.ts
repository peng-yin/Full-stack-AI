import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { redisUtils } from '@/lib/redis'

// GET /api/stats - 获取统计数据
// 演示：计数器、日期统计、实时数据
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'overview'

    switch (type) {
      case 'overview':
        return await getOverviewStats()
      case 'daily':
        return await getDailyStats(searchParams)
      case 'realtime':
        return await getRealtimeStats()
      default:
        return NextResponse.json({ error: 'Invalid stats type' }, { status: 400 })
    }
  } catch (error) {
    console.error('Error fetching stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}

// 概览统计
async function getOverviewStats() {
  const cacheKey = 'stats:overview'
  
  // 尝试从缓存获取
  const cached = await redisUtils.get(cacheKey)
  if (cached) {
    return NextResponse.json({ data: cached, source: 'cache' })
  }

  // 从数据库获取
  const [
    userCount,
    productCount,
    orderCount,
    totalRevenue,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.product.count({ where: { status: 'ACTIVE' } }),
    prisma.order.count(),
    prisma.order.aggregate({
      where: { status: { in: ['PAID', 'SHIPPED', 'COMPLETED'] } },
      _sum: { totalAmount: true },
    }),
  ])

  const stats = {
    users: userCount,
    products: productCount,
    orders: orderCount,
    revenue: totalRevenue._sum.totalAmount || 0,
  }

  // 缓存5分钟
  await redisUtils.set(cacheKey, stats, 300)

  return NextResponse.json({ data: stats, source: 'database' })
}

// 日期范围统计
async function getDailyStats(searchParams: URLSearchParams) {
  const days = parseInt(searchParams.get('days') || '7')
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days + 1)
  startDate.setHours(0, 0, 0, 0)

  // 获取订单统计
  const orderStats = await redisUtils.getCountsByDateRange(
    'stats:orders:paid',
    startDate,
    endDate
  )

  // 从数据库补充数据（如果 Redis 中没有）
  const orders = await prisma.order.groupBy({
    by: ['createdAt'],
    where: {
      createdAt: { gte: startDate, lte: endDate },
      status: { in: ['PAID', 'SHIPPED', 'COMPLETED'] },
    },
    _count: true,
    _sum: { totalAmount: true },
  })

  // 按日期整理数据
  const dailyData: Record<string, { orders: number; revenue: number }> = {}
  const current = new Date(startDate)
  
  while (current <= endDate) {
    const dateStr = current.toISOString().split('T')[0]
    dailyData[dateStr] = { orders: 0, revenue: 0 }
    current.setDate(current.getDate() + 1)
  }

  // 填充数据库数据
  for (const order of orders) {
    const dateStr = order.createdAt.toISOString().split('T')[0]
    if (dailyData[dateStr]) {
      dailyData[dateStr].orders = order._count
      dailyData[dateStr].revenue = Number(order._sum.totalAmount || 0)
    }
  }

  return NextResponse.json({
    data: {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      daily: dailyData,
    },
  })
}

// 实时统计（使用 Redis）
async function getRealtimeStats() {
  // 获取今日统计
  const today = new Date().toISOString().split('T')[0]
  
  const [
    todayOrders,
    todayRevenue,
    onlineUsers,
    activeProducts,
  ] = await Promise.all([
    redisUtils.get<number>(`stats:orders:paid:${today}`),
    redisUtils.get<number>('stats:revenue:today'),
    redisUtils.scard('online:users'),
    redisUtils.scard('active:products'),
  ])

  return NextResponse.json({
    data: {
      todayOrders: todayOrders || 0,
      todayRevenue: todayRevenue || 0,
      onlineUsers,
      activeProducts,
      timestamp: new Date().toISOString(),
    },
  })
}
