import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { redisUtils } from '@/lib/redis'

// 强制动态渲染（使用 searchParams）
export const dynamic = 'force-dynamic'

const HOT_PRODUCTS_KEY = 'products:hot'
const CACHE_TTL = 60 // 1分钟

// GET /api/products/hot - 获取热门商品
// 演示：缓存击穿防护（使用分布式锁重建缓存）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '10')

    // 使用分布式锁防止缓存击穿
    // 当缓存过期时，只有一个请求会去查询数据库，其他请求等待
    const products = await redisUtils.getOrSetWithLock(
      HOT_PRODUCTS_KEY,
      async () => {
        // 模拟耗时查询
        return await prisma.product.findMany({
          where: { status: 'ACTIVE' },
          orderBy: [
            { salesCount: 'desc' },
            { viewCount: 'desc' },
          ],
          take: limit,
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            stock: true,
            salesCount: true,
            viewCount: true,
            images: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })
      },
      CACHE_TTL,
      5 // 锁的超时时间
    )

    return NextResponse.json({
      data: products,
      total: products.length,
    })
  } catch (error) {
    console.error('Error fetching hot products:', error)
    return NextResponse.json(
      { error: 'Failed to fetch hot products' },
      { status: 500 }
    )
  }
}
