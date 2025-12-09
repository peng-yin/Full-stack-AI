import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { redisUtils } from '@/lib/redis'

// GET /api/stats/ranking - 获取排行榜
// 演示：Sorted Set 实现排行榜
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'sales'
    const limit = parseInt(searchParams.get('limit') || '10')

    switch (type) {
      case 'sales':
        return await getSalesRanking(limit)
      case 'views':
        return await getViewsRanking(limit)
      case 'users':
        return await getUserOrderRanking(limit)
      default:
        return NextResponse.json({ error: 'Invalid ranking type' }, { status: 400 })
    }
  } catch (error) {
    console.error('Error fetching ranking:', error)
    return NextResponse.json(
      { error: 'Failed to fetch ranking' },
      { status: 500 }
    )
  }
}

// 商品销量排行榜
async function getSalesRanking(limit: number) {
  const rankingKey = 'ranking:sales'
  
  // 从 Redis 获取排行榜
  const ranking = await redisUtils.zrevrange(rankingKey, 0, limit - 1, true)
  
  if (ranking.length === 0) {
    // Redis 中没有数据，从数据库初始化
    const products = await prisma.product.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { salesCount: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        price: true,
        salesCount: true,
        images: true,
      },
    })

    // 写入 Redis
    for (const product of products) {
      await redisUtils.zadd(rankingKey, product.salesCount, product.id.toString())
    }

    return NextResponse.json({
      data: products.map((p, index) => ({
        rank: index + 1,
        ...p,
      })),
      source: 'database',
    })
  }

  // 解析排行榜数据
  const productIds: number[] = []
  const scores: Record<number, number> = {}
  
  for (let i = 0; i < ranking.length; i += 2) {
    const productId = parseInt(ranking[i])
    const score = parseFloat(ranking[i + 1])
    productIds.push(productId)
    scores[productId] = score
  }

  // 获取商品详情
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      name: true,
      price: true,
      salesCount: true,
      images: true,
    },
  })

  // 按排名排序
  const sortedProducts = productIds.map((id, index) => {
    const product = products.find(p => p.id === id)
    return {
      rank: index + 1,
      ...product,
      salesCount: scores[id],
    }
  }).filter(p => p.id)

  return NextResponse.json({
    data: sortedProducts,
    source: 'redis',
  })
}

// 商品浏览量排行榜
async function getViewsRanking(limit: number) {
  const rankingKey = 'ranking:views'
  
  // 从 Redis 获取排行榜
  const ranking = await redisUtils.zrevrange(rankingKey, 0, limit - 1, true)
  
  if (ranking.length === 0) {
    // 从数据库初始化
    const products = await prisma.product.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { viewCount: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        price: true,
        viewCount: true,
        images: true,
      },
    })

    // 写入 Redis
    for (const product of products) {
      await redisUtils.zadd(rankingKey, product.viewCount, product.id.toString())
    }

    return NextResponse.json({
      data: products.map((p, index) => ({
        rank: index + 1,
        ...p,
      })),
      source: 'database',
    })
  }

  // 解析排行榜数据
  const productIds: number[] = []
  const scores: Record<number, number> = {}
  
  for (let i = 0; i < ranking.length; i += 2) {
    const productId = parseInt(ranking[i])
    const score = parseFloat(ranking[i + 1])
    productIds.push(productId)
    scores[productId] = score
  }

  // 获取商品详情
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      name: true,
      price: true,
      viewCount: true,
      images: true,
    },
  })

  const sortedProducts = productIds.map((id, index) => {
    const product = products.find(p => p.id === id)
    return {
      rank: index + 1,
      ...product,
      viewCount: scores[id],
    }
  }).filter(p => p.id)

  return NextResponse.json({
    data: sortedProducts,
    source: 'redis',
  })
}

// 用户消费排行榜
async function getUserOrderRanking(limit: number) {
  const rankingKey = 'ranking:user:orders'
  
  // 从 Redis 获取排行榜
  const ranking = await redisUtils.zrevrange(rankingKey, 0, limit - 1, true)
  
  if (ranking.length === 0) {
    // 从数据库初始化
    const userStats = await prisma.order.groupBy({
      by: ['userId'],
      where: { status: { in: ['PAID', 'SHIPPED', 'COMPLETED'] } },
      _sum: { totalAmount: true },
      _count: true,
      orderBy: { _sum: { totalAmount: 'desc' } },
      take: limit,
    })

    const userIds = userStats.map(s => s.userId)
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    })

    const result = userStats.map((stat, index) => {
      const user = users.find(u => u.id === stat.userId)
      const totalSpent = Number(stat._sum.totalAmount || 0)
      
      // 写入 Redis
      redisUtils.zadd(rankingKey, totalSpent, stat.userId.toString())
      
      return {
        rank: index + 1,
        userId: stat.userId,
        name: user?.name,
        email: user?.email,
        orderCount: stat._count,
        totalSpent,
      }
    })

    return NextResponse.json({
      data: result,
      source: 'database',
    })
  }

  // 解析排行榜数据
  const userIds: number[] = []
  const scores: Record<number, number> = {}
  
  for (let i = 0; i < ranking.length; i += 2) {
    const userId = parseInt(ranking[i])
    const score = parseFloat(ranking[i + 1])
    userIds.push(userId)
    scores[userId] = score
  }

  // 获取用户详情和订单数
  const [users, orderCounts] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    }),
    prisma.order.groupBy({
      by: ['userId'],
      where: { 
        userId: { in: userIds },
        status: { in: ['PAID', 'SHIPPED', 'COMPLETED'] },
      },
      _count: true,
    }),
  ])

  const orderCountMap = new Map(orderCounts.map(o => [o.userId, o._count]))

  const sortedUsers = userIds.map((id, index) => {
    const user = users.find(u => u.id === id)
    return {
      rank: index + 1,
      userId: id,
      name: user?.name,
      email: user?.email,
      orderCount: orderCountMap.get(id) || 0,
      totalSpent: scores[id],
    }
  }).filter(u => u.name || u.email)

  return NextResponse.json({
    data: sortedUsers,
    source: 'redis',
  })
}

// POST /api/stats/ranking - 更新排行榜分数
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, id, increment } = body

    if (!type || !id || increment === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: type, id, increment' },
        { status: 400 }
      )
    }

    let rankingKey: string
    switch (type) {
      case 'sales':
        rankingKey = 'ranking:sales'
        break
      case 'views':
        rankingKey = 'ranking:views'
        break
      case 'users':
        rankingKey = 'ranking:user:orders'
        break
      default:
        return NextResponse.json({ error: 'Invalid ranking type' }, { status: 400 })
    }

    // 更新分数
    const newScore = await redisUtils.zincrby(rankingKey, increment, id.toString())
    const rank = await redisUtils.zrevrank(rankingKey, id.toString())

    return NextResponse.json({
      data: {
        id,
        newScore: parseFloat(newScore),
        rank: rank !== null ? rank + 1 : null,
      },
    })
  } catch (error) {
    console.error('Error updating ranking:', error)
    return NextResponse.json(
      { error: 'Failed to update ranking' },
      { status: 500 }
    )
  }
}
