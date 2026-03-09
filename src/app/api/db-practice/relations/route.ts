import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * 关联关系操作实战 API
 * 
 * 覆盖操作：
 * - 嵌套创建（nested create）：创建主记录的同时创建关联记录
 * - connect：关联已有记录
 * - connectOrCreate：存在则关联，不存在则创建后关联
 * - disconnect：断开关联
 * - set：重置关联（多对多）
 * - include vs select：关联查询的两种方式
 * - 深层嵌套查询
 */

// POST /api/db-practice/relations - 关联操作
export async function POST(request: NextRequest) {
  try {
    const { action, data } = await request.json()

    switch (action) {
      // ==========================================
      // 1. 嵌套创建（Nested Create）
      // 创建商品的同时创建关联的标签
      // ==========================================
      case 'nestedCreate': {
        const product = await prisma.product.create({
          data: {
            name: '测试商品-嵌套创建',
            price: 99.99,
            stock: 100,
            description: '通过嵌套创建的商品',
            // 同时创建关联的标签关系
            tags: {
              create: [
                {
                  tag: {
                    // connectOrCreate：标签存在就关联，不存在就创建
                    connectOrCreate: {
                      where: { name: '热卖' },
                      create: { name: '热卖', color: '#ff4444' },
                    },
                  },
                },
                {
                  tag: {
                    connectOrCreate: {
                      where: { name: '新品' },
                      create: { name: '新品', color: '#44ff44' },
                    },
                  },
                },
              ],
            },
          },
          // 查询结果包含关联数据
          include: {
            tags: {
              include: {
                tag: true,
              },
            },
            category: true,
          },
        })
        return NextResponse.json({
          operation: 'nestedCreate',
          result: product,
          explanation: '嵌套创建：一次请求同时创建主记录和关联记录。connectOrCreate 保证标签不重复。',
        })
      }

      // ==========================================
      // 2. connect - 关联已有记录
      // 给商品关联已有的分类
      // ==========================================
      case 'connect': {
        // 先确保有可用的分类和商品
        const category = await prisma.category.upsert({
          where: { id: data?.categoryId || 1 },
          create: { name: '电子产品', description: '电子数码类商品' },
          update: {},
        })

        // 获取一个可用的商品
        let product = await prisma.product.findFirst({
          where: { id: data?.productId, deletedAt: null },
        })
        if (!product) {
          product = await prisma.product.findFirst({
            where: { deletedAt: null },
          })
        }
        if (!product) {
          return NextResponse.json({ error: '没有可用的商品，请先通过"嵌套创建"创建商品' }, { status: 400 })
        }

        const updated = await prisma.product.update({
          where: { id: product.id },
          data: {
            // connect 关联一个已存在的分类
            category: {
              connect: { id: category.id },
            },
          },
          include: {
            category: true,
          },
        })
        return NextResponse.json({
          operation: 'connect',
          result: updated,
          explanation: `connect 把已存在的记录关联起来。这里把商品"${product.name}"关联到分类"${category.name}"。对一对多关系，相当于设置外键。`,
        })
      }

      // ==========================================
      // 3. disconnect - 断开关联
      // 移除商品的分类
      // ==========================================
      case 'disconnect': {
        const pid = data?.productId
        if (!pid) {
          return NextResponse.json({ error: 'productId required' }, { status: 400 })
        }

        const product = await prisma.product.update({
          where: { id: pid },
          data: {
            // disconnect 断开一对多关系（设置外键为 null）
            category: {
              disconnect: true,
            },
          },
          include: {
            category: true,
          },
        })
        return NextResponse.json({
          operation: 'disconnect',
          result: product,
          explanation: 'disconnect: true 断开关联，外键字段设为 null。要求外键字段允许为空（可选关系）。',
        })
      }

      // ==========================================
      // 4. connectOrCreate - 存在即关联，不存在就创建
      // 给商品打标签（标签可能不存在）
      // ==========================================
      case 'connectOrCreate': {
        const productId2 = data?.productId
        const tagName = data?.tagName || '限量版'
        const tagColor = data?.tagColor || '#ff00ff'

        if (!productId2) {
          return NextResponse.json({ error: 'productId required' }, { status: 400 })
        }

        // 通过显式多对多关联表操作
        const productTag = await prisma.productTag.create({
          data: {
            product: { connect: { id: productId2 } },
            tag: {
              connectOrCreate: {
                where: { name: tagName },
                create: { name: tagName, color: tagColor },
              },
            },
          },
          include: {
            product: { select: { id: true, name: true } },
            tag: true,
          },
        })
        return NextResponse.json({
          operation: 'connectOrCreate',
          result: productTag,
          explanation: 'connectOrCreate 是最常用的关联操作之一。标签存在就直接关联，不存在就自动创建再关联。',
        })
      }

      // ==========================================
      // 5. set - 重置多对多关联
      // 重新设置商品的所有标签（先清空再关联）
      // ==========================================
      case 'setTags': {
        const productId3 = data?.productId
        const tagIds: number[] = data?.tagIds || []

        if (!productId3) {
          return NextResponse.json({ error: 'productId required' }, { status: 400 })
        }

        // 对于显式多对多关联表，需要手动先删再建
        await prisma.$transaction([
          // 先删除该商品的所有标签关联
          prisma.productTag.deleteMany({
            where: { productId: productId3 },
          }),
          // 再批量创建新的关联
          ...tagIds.map((tagId: number) =>
            prisma.productTag.create({
              data: { productId: productId3, tagId },
            })
          ),
        ])

        // 查询最新结果
        const product = await prisma.product.findUnique({
          where: { id: productId3 },
          include: {
            tags: { include: { tag: true } },
          },
        })
        return NextResponse.json({
          operation: 'setTags',
          result: product,
          explanation: '重置多对多关联：先 deleteMany 删除所有旧关联，再批量 create 新关联。用事务保证原子性。',
        })
      }

      // ==========================================
      // 6. include vs select - 两种关联查询方式
      // ==========================================
      case 'queryStyles': {
        // 方式1: include - 包含完整的关联记录
        const withInclude = await prisma.order.findFirst({
          include: {
            user: true,           // 包含用户的所有字段
            items: {
              include: {
                product: true,    // 包含每个订单项的商品所有字段
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        })

        // 方式2: select - 精确选择需要的字段（更高效）
        const withSelect = await prisma.order.findFirst({
          select: {
            id: true,
            orderNo: true,
            totalAmount: true,
            status: true,
            user: {
              select: {
                id: true,
                name: true,       // 只要用户的 id 和 name
              },
            },
            items: {
              select: {
                quantity: true,
                price: true,
                product: {
                  select: {
                    name: true,   // 只要商品名
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        })

        return NextResponse.json({
          operation: 'queryStyles',
          includeResult: withInclude,
          selectResult: withSelect,
          explanation: 'include 返回关联表的全部字段；select 精确指定字段，性能更好。两者不能混用在同一层级。',
        })
      }

      // ==========================================
      // 7. 深层嵌套查询
      // 查分类 → 商品 → 标签，3层嵌套
      // ==========================================
      case 'deepNested': {
        const categories = await prisma.category.findMany({
          where: {
            parentId: null, // 只查顶级分类
          },
          include: {
            children: {
              // 第2层：子分类
              include: {
                products: {
                  // 第3层：子分类下的商品
                  where: { deletedAt: null },
                  take: 3,
                  include: {
                    tags: {
                      // 第4层：商品的标签
                      include: { tag: true },
                    },
                  },
                },
              },
            },
            products: {
              // 顶级分类下的商品
              where: { deletedAt: null },
              take: 3,
              include: {
                tags: { include: { tag: true } },
              },
            },
          },
        })
        return NextResponse.json({
          operation: 'deepNested',
          result: categories,
          explanation: '深层嵌套查询可以一次获取多层关联数据。但层级太深会影响性能，一般不超过3-4层。',
        })
      }

      // ==========================================
      // 8. _count - 关联计数
      // 查每个分类下有多少商品
      // ==========================================
      case 'relationCount': {
        const categories = await prisma.category.findMany({
          include: {
            _count: {
              select: {
                products: true,  // 统计关联的商品数量
                children: true,  // 统计子分类数量
              },
            },
          },
        })
        return NextResponse.json({
          operation: 'relationCount',
          result: categories,
          explanation: '_count 可以高效统计关联记录数量，不需要加载所有关联数据。比 include 后在代码里 .length 更高效。',
        })
      }

      default:
        return NextResponse.json(
          {
            error: 'Unknown action',
            availableActions: [
              'nestedCreate — 嵌套创建商品+标签',
              'connect — 关联已有分类（需要 data.productId, data.categoryId）',
              'disconnect — 断开分类关联（需要 data.productId）',
              'connectOrCreate — 给商品打标签（需要 data.productId, 可选 data.tagName）',
              'setTags — 重置商品标签（需要 data.productId, data.tagIds）',
              'queryStyles — include vs select 对比',
              'deepNested — 深层嵌套查询（分类→商品→标签）',
              'relationCount — 关联计数 (_count)',
            ],
          },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Relation operation error:', error)
    return NextResponse.json({ error: 'Relation operation failed', detail: String(error) }, { status: 500 })
  }
}
