import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { redisUtils } from '@/lib/redis'
import { z } from 'zod'

const CART_CACHE_KEY = 'cart'
const CACHE_TTL = 300 // 5分钟

// 添加购物车的验证 schema
const addToCartSchema = z.object({
  userId: z.number().int().positive(),
  productId: z.number().int().positive(),
  quantity: z.number().int().positive().default(1),
})

// GET /api/cart - 获取购物车
// 演示：使用 Redis Hash 存储购物车
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      )
    }

    const userIdNum = parseInt(userId)
    const cacheKey = `${CART_CACHE_KEY}:${userIdNum}`

    // 先尝试从 Redis Hash 获取
    const cachedCart = await redisUtils.hgetall<number>(cacheKey)
    
    if (Object.keys(cachedCart).length > 0) {
      // 从缓存获取商品详情
      const productIds = Object.keys(cachedCart).map(Number)
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          name: true,
          price: true,
          stock: true,
          status: true,
          images: true,
        },
      })

      const items = products.map(product => ({
        productId: product.id,
        product,
        quantity: cachedCart[product.id.toString()],
      }))

      const totalAmount = items.reduce(
        (sum, item) => sum + Number(item.product.price) * item.quantity,
        0
      )

      return NextResponse.json({
        data: {
          items,
          totalAmount,
          itemCount: items.length,
        },
        source: 'cache',
      })
    }

    // 从数据库获取
    const cartItems = await prisma.cartItem.findMany({
      where: { userId: userIdNum },
      select: {
        id: true,
        quantity: true,
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            stock: true,
            status: true,
            images: true,
          },
        },
      },
    })

    // 同步到 Redis
    if (cartItems.length > 0) {
      const cartData: Record<string, number> = {}
      for (const item of cartItems) {
        cartData[item.product.id.toString()] = item.quantity
      }
      await redisUtils.hmset(cacheKey, cartData)
      await redisUtils.expire(cacheKey, CACHE_TTL)
    }

    const items = cartItems.map(item => ({
      productId: item.product.id,
      product: item.product,
      quantity: item.quantity,
    }))

    const totalAmount = items.reduce(
      (sum, item) => sum + Number(item.product.price) * item.quantity,
      0
    )

    return NextResponse.json({
      data: {
        items,
        totalAmount,
        itemCount: items.length,
      },
      source: 'database',
    })
  } catch (error) {
    console.error('Error fetching cart:', error)
    return NextResponse.json(
      { error: 'Failed to fetch cart' },
      { status: 500 }
    )
  }
}

// POST /api/cart - 添加商品到购物车
// 演示：Redis Hash 操作
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 验证请求体
    const validation = addToCartSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { userId, productId, quantity } = validation.data

    // 检查用户是否存在
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // 检查商品是否存在且有库存
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }
    if (product.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Product is not available' }, { status: 400 })
    }

    // 使用 upsert 添加或更新购物车
    const cartItem = await prisma.cartItem.upsert({
      where: {
        userId_productId: { userId, productId },
      },
      update: {
        quantity: { increment: quantity },
      },
      create: {
        userId,
        productId,
        quantity,
      },
      select: {
        id: true,
        quantity: true,
        product: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
      },
    })

    // 检查是否超过库存
    if (cartItem.quantity > product.stock) {
      // 回滚到库存数量
      await prisma.cartItem.update({
        where: { id: cartItem.id },
        data: { quantity: product.stock },
      })
      
      return NextResponse.json(
        { error: `Only ${product.stock} items available` },
        { status: 400 }
      )
    }

    // 更新 Redis 缓存
    const cacheKey = `${CART_CACHE_KEY}:${userId}`
    await redisUtils.hset(cacheKey, productId.toString(), cartItem.quantity)
    await redisUtils.expire(cacheKey, CACHE_TTL)

    return NextResponse.json({
      message: 'Added to cart',
      data: cartItem,
    })
  } catch (error) {
    console.error('Error adding to cart:', error)
    return NextResponse.json(
      { error: 'Failed to add to cart' },
      { status: 500 }
    )
  }
}

// DELETE /api/cart - 清空购物车
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const productId = searchParams.get('productId')

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      )
    }

    const userIdNum = parseInt(userId)
    const cacheKey = `${CART_CACHE_KEY}:${userIdNum}`

    if (productId) {
      // 删除单个商品
      const productIdNum = parseInt(productId)
      await prisma.cartItem.deleteMany({
        where: { userId: userIdNum, productId: productIdNum },
      })
      await redisUtils.hdel(cacheKey, productId)
    } else {
      // 清空购物车
      await prisma.cartItem.deleteMany({
        where: { userId: userIdNum },
      })
      await redisUtils.del(cacheKey)
    }

    return NextResponse.json({ message: 'Cart updated' })
  } catch (error) {
    console.error('Error updating cart:', error)
    return NextResponse.json(
      { error: 'Failed to update cart' },
      { status: 500 }
    )
  }
}
