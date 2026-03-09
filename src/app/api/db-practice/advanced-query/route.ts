import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// BigInt JSON 序列化支持（MySQL $queryRaw 返回 COUNT(*) 等为 BigInt）
function serializeResult(data: unknown): unknown {
  return JSON.parse(JSON.stringify(data, (_key, value) =>
    typeof value === 'bigint' ? Number(value) : value
  ))
}

/**
 * 高级查询实战 API
 * 
 * 覆盖操作：
 * - cursor 游标分页（大数据量分页）
 * - distinct 去重查询
 * - select 精确字段选择
 * - 复杂 where 条件（AND/OR/NOT/嵌套）
 * - $queryRaw 原始 SQL 查询
 * - $executeRaw 原始 SQL 执行
 * - aggregate 聚合查询
 * - groupBy 分组查询（带 having）
 */

// POST /api/db-practice/advanced-query - 高级查询
export async function POST(request: NextRequest) {
  try {
    const { action, data } = await request.json()

    switch (action) {
      // ==========================================
      // 1. Cursor 游标分页
      // 适用：大数据量场景，避免 offset 性能问题
      // 原理：WHERE id > lastId ORDER BY id LIMIT N
      // ==========================================
      case 'cursorPagination': {
        const cursor = data?.cursor as number | undefined // 上一页最后一条的 ID
        const pageSize = data?.pageSize || 10

        const products = await prisma.product.findMany({
          take: pageSize,
          ...(cursor ? {
            skip: 1,                  // 跳过 cursor 本身
            cursor: { id: cursor },   // 从 cursor 位置开始
          } : {}),
          where: { deletedAt: null },
          orderBy: { id: 'asc' },
          select: {
            id: true,
            name: true,
            price: true,
            createdAt: true,
          },
        })

        const nextCursor = products.length === pageSize
          ? products[products.length - 1].id
          : null

        return NextResponse.json({
          operation: 'cursorPagination',
          result: {
            data: products,
            nextCursor,
            hasMore: nextCursor !== null,
          },
          explanation: [
            'Cursor 分页对比 Offset 分页：',
            '- Offset: LIMIT 10 OFFSET 10000 → 数据库要先扫描10000条再跳过，越往后越慢',
            '- Cursor: WHERE id > 10000 LIMIT 10 → 直接从索引定位，性能恒定',
            '使用方式：第一次不传 cursor，之后用返回的 nextCursor 请求下一页',
          ],
        })
      }

      // ==========================================
      // 2. distinct 去重查询
      // 适用：获取不重复的字段值
      // ==========================================
      case 'distinct': {
        // 查询所有不重复的商品状态
        const distinctStatuses = await prisma.product.findMany({
          distinct: ['status'],
          select: { status: true },
          where: { deletedAt: null },
        })

        // 多字段去重：查所有出现过的 (categoryId, status) 组合
        const distinctCombinations = await prisma.product.findMany({
          distinct: ['categoryId', 'status'],
          select: {
            categoryId: true,
            status: true,
          },
          where: { deletedAt: null },
        })

        // 查所有下过单的用户（去重）
        const distinctOrderUsers = await prisma.order.findMany({
          distinct: ['userId'],
          select: {
            userId: true,
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        })

        return NextResponse.json({
          operation: 'distinct',
          result: {
            distinctStatuses,
            distinctCombinations,
            distinctOrderUsers,
          },
          explanation: 'distinct 可以对一个或多个字段去重。配合 select 使用，相当于 SQL 的 SELECT DISTINCT。',
        })
      }

      // ==========================================
      // 3. 复杂 where 条件
      // AND / OR / NOT / 嵌套组合
      // ==========================================
      case 'complexWhere': {
        // 场景：搜索「(名称包含"手机" OR 价格>=1000) AND 状态为ACTIVE AND 不是分类5」
        const products = await prisma.product.findMany({
          where: {
            // 顶层条件默认是 AND
            AND: [
              {
                OR: [
                  { name: { contains: '手机' } },
                  { price: { gte: 1000 } },
                ],
              },
              { status: 'ACTIVE' },
              { deletedAt: null },
              {
                NOT: {
                  categoryId: 5,
                },
              },
            ],
          },
          select: {
            id: true,
            name: true,
            price: true,
            status: true,
            categoryId: true,
          },
          take: 20,
        })

        // 更多 where 过滤操作符示例
        const filterExamples = await prisma.product.findMany({
          where: {
            deletedAt: null,
            price: {
              gte: 10,       // >= 10
              lte: 500,      // <= 500
            },
            name: {
              contains: '商品',    // LIKE '%商品%'
              // startsWith: '测试',  // LIKE '测试%'
              // endsWith: '版',      // LIKE '%版'
            },
            categoryId: {
              in: [1, 2, 3],       // IN (1, 2, 3)
              // notIn: [4, 5],     // NOT IN (4, 5)
            },
            description: {
              not: null,           // IS NOT NULL
            },
          },
          take: 10,
        })

        return NextResponse.json({
          operation: 'complexWhere',
          result: { products, filterExamples },
          explanation: [
            'where 条件操作符一览：',
            '- equals: 精确匹配（默认）',
            '- not: 不等于',
            '- in / notIn: 在/不在列表中',
            '- lt / lte / gt / gte: 比较运算',
            '- contains / startsWith / endsWith: 字符串模糊匹配',
            '- AND / OR / NOT: 逻辑组合，支持无限嵌套',
          ],
        })
      }

      // ==========================================
      // 4. $queryRaw - 原始 SQL 查询
      // 适用：复杂 JOIN、子查询、窗口函数等 Prisma 不支持的操作
      // ==========================================
      case 'rawQuery': {
        // 场景1：窗口函数 - 每个分类销量最高的3个商品
        const topProducts = await prisma.$queryRaw`
          SELECT * FROM (
            SELECT 
              p.id, p.name, p.price, p.sales_count,
              c.name as category_name,
              ROW_NUMBER() OVER (PARTITION BY p.category_id ORDER BY p.sales_count DESC) as rank_num
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.deleted_at IS NULL AND p.status = 'ACTIVE'
          ) ranked
          WHERE rank_num <= 3
          ORDER BY category_name, rank_num
        `

        // 场景2：参数化查询（防 SQL 注入）
        const minPrice = data?.minPrice || 100
        const productsByPrice = await prisma.$queryRaw`
          SELECT id, name, price, stock
          FROM products
          WHERE price >= ${minPrice} AND deleted_at IS NULL
          ORDER BY price DESC
          LIMIT 10
        `

        // 场景3：统计每月订单数和金额
        const monthlyStats = await prisma.$queryRaw`
          SELECT 
            DATE_FORMAT(created_at, '%Y-%m') as month,
            COUNT(*) as order_count,
            SUM(total_amount) as total_revenue,
            AVG(total_amount) as avg_amount
          FROM orders
          GROUP BY DATE_FORMAT(created_at, '%Y-%m')
          ORDER BY month DESC
          LIMIT 12
        `

        return NextResponse.json({
          operation: 'rawQuery',
          result: serializeResult({
            topProducts,
            productsByPrice,
            monthlyStats,
          }),
          explanation: [
            '$queryRaw 要点：',
            '- 使用模板字符串（tagged template）自动参数化，防 SQL 注入',
            '- 适合窗口函数、复杂JOIN、子查询等 Prisma ORM 不支持的场景',
            '- 返回的字段名是数据库原始列名（snake_case），不是 Prisma 映射后的名（camelCase）',
          ],
        })
      }

      // ==========================================
      // 5. $executeRaw - 原始 SQL 执行（不返回数据）
      // 适用：DDL、批量更新等
      // ==========================================
      case 'rawExecute': {
        // 场景：批量更新浏览量（原子操作）
        const affectedRows = await prisma.$executeRaw`
          UPDATE products 
          SET view_count = view_count + 1 
          WHERE id IN (1, 2, 3) AND deleted_at IS NULL
        `
        // affectedRows 是受影响的行数

        return NextResponse.json({
          operation: 'rawExecute',
          result: { affectedRows },
          explanation: '$executeRaw 不返回数据，只返回受影响行数。适合 UPDATE/DELETE/INSERT 等写操作。',
        })
      }

      // ==========================================
      // 6. aggregate - 聚合查询
      // ==========================================
      case 'aggregate': {
        // 商品价格统计
        const priceStats = await prisma.product.aggregate({
          where: { status: 'ACTIVE', deletedAt: null },
          _count: { _all: true },      // 总数
          _sum: { stock: true },        // 库存总量
          _avg: { price: true },        // 平均价格
          _min: { price: true },        // 最低价
          _max: { price: true },        // 最高价
        })

        // 订单金额统计
        const orderStats = await prisma.order.aggregate({
          where: { status: { in: ['PAID', 'SHIPPED', 'COMPLETED'] } },
          _count: { _all: true },
          _sum: { totalAmount: true },
          _avg: { totalAmount: true },
          _min: { totalAmount: true },
          _max: { totalAmount: true },
        })

        return NextResponse.json({
          operation: 'aggregate',
          result: { priceStats, orderStats },
          explanation: 'aggregate 支持 _count/_sum/_avg/_min/_max，相当于 SQL 的 COUNT/SUM/AVG/MIN/MAX。',
        })
      }

      // ==========================================
      // 7. groupBy - 分组查询 + having
      // ==========================================
      case 'groupBy': {
        // 按商品状态分组统计
        const byStatus = await prisma.product.groupBy({
          by: ['status'],
          where: { deletedAt: null },
          _count: { _all: true },
          _avg: { price: true },
          _sum: { stock: true },
          orderBy: { status: 'asc' },
        })

        // 按用户分组统计订单，having 过滤（只看下了3单以上的用户）
        // 注意：Prisma having 的类型定义较严格，这里用 raw 查询更合适
        const topBuyers = await prisma.$queryRaw`
          SELECT user_id, COUNT(*) as order_count, SUM(total_amount) as total_amount
          FROM orders
          GROUP BY user_id
          HAVING order_count >= 3
          ORDER BY total_amount DESC
          LIMIT 10
        `

        // 按月份分组统计订单
        // 注意：Prisma 的 groupBy 不支持日期函数分组，复杂分组需要用 $queryRaw
        const byMonth = await prisma.$queryRaw`
          SELECT 
            DATE_FORMAT(created_at, '%Y-%m') as month,
            status,
            COUNT(*) as count,
            SUM(total_amount) as total
          FROM orders
          GROUP BY month, status
          HAVING count > 0
          ORDER BY month DESC
          LIMIT 20
        `

        return NextResponse.json({
          operation: 'groupBy',
          result: serializeResult({ byStatus, topBuyers, byMonth }),
          explanation: [
            'groupBy 要点：',
            '- by: 分组字段（数组）',
            '- having: 分组后过滤（相当于 SQL HAVING）',
            '- 支持 _count/_sum/_avg/_min/_max 聚合',
            '- 复杂分组（如按月份）需要用 $queryRaw',
          ],
        })
      }

      // ==========================================
      // 8. 关联过滤（relation filter）
      // 根据关联表的条件查询主表
      // ==========================================
      case 'relationFilter': {
        // 场景1：查询「有至少一个已完成订单的用户」
        const usersWithCompletedOrders = await prisma.user.findMany({
          where: {
            orders: {
              some: {                    // 至少有一个满足条件的关联记录
                status: 'COMPLETED',
              },
            },
          },
          select: {
            id: true,
            name: true,
            email: true,
            _count: { select: { orders: true } },
          },
          take: 10,
        })

        // 场景2：查询「所有订单都已完成的用户」
        const usersAllCompleted = await prisma.user.findMany({
          where: {
            orders: {
              every: {                   // 每一个关联记录都满足条件
                status: 'COMPLETED',
              },
            },
            // 排除没有订单的用户
            NOT: {
              orders: { none: {} },
            },
          },
          select: {
            id: true,
            name: true,
            _count: { select: { orders: true } },
          },
          take: 10,
        })

        // 场景3：查询「没有任何订单的用户」
        const usersWithNoOrders = await prisma.user.findMany({
          where: {
            orders: {
              none: {},                  // 没有任何关联记录
            },
          },
          select: {
            id: true,
            name: true,
            email: true,
          },
          take: 10,
        })

        // 场景4：查询「包含特定标签的商品」
        const productsWithTag = await prisma.product.findMany({
          where: {
            deletedAt: null,
            tags: {
              some: {
                tag: {
                  name: { in: ['热卖', '推荐'] },
                },
              },
            },
          },
          include: {
            tags: { include: { tag: true } },
          },
          take: 10,
        })

        return NextResponse.json({
          operation: 'relationFilter',
          result: {
            usersWithCompletedOrders,
            usersAllCompleted,
            usersWithNoOrders,
            productsWithTag,
          },
          explanation: [
            '关联过滤操作符：',
            '- some: 至少有一个关联记录满足条件（EXISTS）',
            '- every: 所有关联记录都满足条件',
            '- none: 没有任何关联记录满足条件（NOT EXISTS）',
            '- is / isNot: 一对一关系的过滤',
          ],
        })
      }

      default:
        return NextResponse.json(
          {
            error: 'Unknown action',
            availableActions: [
              'cursorPagination — 游标分页（data.cursor, data.pageSize）',
              'distinct — 去重查询',
              'complexWhere — 复杂条件（AND/OR/NOT）',
              'rawQuery — 原始SQL查询（data.minPrice）',
              'rawExecute — 原始SQL执行',
              'aggregate — 聚合查询',
              'groupBy — 分组查询+having',
              'relationFilter — 关联过滤（some/every/none）',
            ],
          },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Advanced query error:', error)
    return NextResponse.json({ error: 'Advanced query failed', detail: String(error) }, { status: 500 })
  }
}
