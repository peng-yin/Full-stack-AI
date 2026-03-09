import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

/**
 * 事务与并发控制实战 API
 * 
 * 覆盖操作：
 * - 交互式事务（Interactive Transaction）：有条件判断的复杂事务
 * - 批量事务（Sequential Transaction）：一组操作原子执行
 * - 乐观锁（Optimistic Locking）：版本号控制并发更新
 * - 软删除（Soft Delete）：逻辑删除 + 恢复
 * - 嵌套写入事务
 */

// POST /api/db-practice/transaction - 事务操作
export async function POST(request: NextRequest) {
  try {
    const { action, data } = await request.json()

    switch (action) {
      // ==========================================
      // 1. 交互式事务（Interactive Transaction）
      // 事务内可以有条件判断、循环等复杂逻辑
      // 这是最强大的事务方式
      // ==========================================
      case 'interactive': {
        const userId = data?.userId || 1
        const productId = data?.productId || 1
        const quantity = data?.quantity || 1

        const result = await prisma.$transaction(async (tx) => {
          // Step 1: 查询商品（在事务内查询，保证数据一致性）
          const product = await tx.product.findUnique({
            where: { id: productId },
          })

          if (!product) {
            throw new Error(`商品 ${productId} 不存在`)
          }
          if (product.deletedAt) {
            throw new Error(`商品 ${product.name} 已下架`)
          }
          if (product.stock < quantity) {
            throw new Error(`库存不足：需要 ${quantity}，剩余 ${product.stock}`)
          }

          // Step 2: 查询用户
          const user = await tx.user.findUnique({
            where: { id: userId },
          })
          if (!user) {
            throw new Error(`用户 ${userId} 不存在`)
          }

          // Step 3: 创建订单（嵌套创建订单项）
          const orderNo = `ORD${Date.now()}`
          const totalAmount = Number(product.price) * quantity

          const order = await tx.order.create({
            data: {
              orderNo,
              userId,
              totalAmount,
              address: '事务测试地址',
              items: {
                create: [{
                  productId,
                  quantity,
                  price: product.price,
                }],
              },
            },
            include: {
              items: { include: { product: { select: { name: true } } } },
            },
          })

          // Step 4: 扣减库存
          await tx.product.update({
            where: { id: productId },
            data: {
              stock: { decrement: quantity },
              salesCount: { increment: quantity },
            },
          })

          // Step 5: 记录操作日志
          await tx.operationLog.create({
            data: {
              userId,
              action: 'CREATE_ORDER',
              target: 'order',
              targetId: order.id.toString(),
              detail: `创建订单 ${orderNo}，商品: ${product.name} x${quantity}`,
            },
          })

          return order
        }, {
          maxWait: 5000,     // 最大等待获取事务连接的时间
          timeout: 10000,    // 事务执行超时时间
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, // 隔离级别
        })

        return NextResponse.json({
          operation: 'interactive',
          result,
          explanation: [
            '交互式事务要点：',
            '- 内部可以有 if/else、循环等任意逻辑',
            '- 抛出异常会自动回滚所有操作',
            '- 必须使用 tx（事务客户端）代替 prisma 来操作',
            '- 可配置 maxWait/timeout/isolationLevel',
            '隔离级别：ReadUncommitted < ReadCommitted < RepeatableRead < Serializable',
          ],
        })
      }

      // ==========================================
      // 2. 批量事务（Sequential Transaction）
      // 一组独立操作原子执行，简单场景用这个
      // ==========================================
      case 'sequential': {
        // 场景：批量初始化数据
        const results = await prisma.$transaction([
          // 操作1：创建标签
          prisma.tag.createMany({
            data: [
              { name: '测试标签A', color: '#aaa' },
              { name: '测试标签B', color: '#bbb' },
            ],
            skipDuplicates: true,
          }),
          // 操作2：更新所有库存为0的商品
          prisma.product.updateMany({
            where: { stock: 0, deletedAt: null },
            data: { status: 'OUT_OF_STOCK' },
          }),
          // 操作3：记录日志
          prisma.operationLog.create({
            data: {
              action: 'BATCH_INIT',
              target: 'system',
              detail: '批量初始化：创建标签 + 更新库存状态',
            },
          }),
        ])

        return NextResponse.json({
          operation: 'sequential',
          result: results,
          explanation: [
            '批量事务：传入一个 Prisma 操作数组，全部成功或全部回滚。',
            '优点：语法简单，适合不需要中间判断的场景。',
            '缺点：操作之间不能依赖彼此的结果（前一个的结果不能用到后一个里）。',
          ],
        })
      }

      // ==========================================
      // 3. 乐观锁（Optimistic Locking）
      // 用 version 字段控制并发更新，避免丢失更新
      // ==========================================
      case 'optimisticLock': {
        const productId2 = data?.productId || 1
        const newPrice = data?.newPrice || 199.99
        const currentVersion = data?.version // 客户端传入当前看到的版本号

        if (currentVersion === undefined) {
          // 第一步：先查询当前数据和版本号
          const product = await prisma.product.findUnique({
            where: { id: productId2 },
            select: { id: true, name: true, price: true, version: true },
          })
          return NextResponse.json({
            operation: 'optimisticLock',
            step: 'read',
            result: product,
            explanation: '第一步：读取数据和 version。修改时把 version 传回来。',
          })
        }

        // 第二步：更新时校验版本号
        try {
          const updated = await prisma.product.update({
            where: {
              id: productId2,
              version: currentVersion,  // 关键：只有版本号匹配才能更新
            },
            data: {
              price: newPrice,
              version: { increment: 1 }, // 更新成功后版本号+1
            },
          })

          return NextResponse.json({
            operation: 'optimisticLock',
            step: 'update',
            result: updated,
            explanation: '更新成功！version 已自增。如果其他人在你之前修改了，version 不匹配，更新会失败。',
          })
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            return NextResponse.json({
              operation: 'optimisticLock',
              step: 'conflict',
              error: '并发冲突！数据已被其他人修改，请重新获取最新数据再修改。',
              explanation: [
                '乐观锁原理：',
                '1. 读取时记录 version',
                '2. 更新时 WHERE id = ? AND version = ?',
                '3. 如果 version 不匹配，说明数据被其他人改过，返回冲突错误',
                '4. 客户端重新获取数据后再次尝试',
                '对比悲观锁（SELECT FOR UPDATE）：乐观锁不需要数据库锁，吞吐量更高',
              ],
            }, { status: 409 })
          }
          throw error
        }
      }

      // ==========================================
      // 4. 软删除（Soft Delete）
      // 不物理删除，设置 deletedAt 标记
      // ==========================================
      case 'softDelete': {
        const productId3 = data?.productId
        if (!productId3) {
          return NextResponse.json({ error: 'productId required' }, { status: 400 })
        }

        const deleted = await prisma.product.update({
          where: {
            id: productId3,
            deletedAt: null, // 确保没有被删除过
          },
          data: {
            deletedAt: new Date(),
            status: 'INACTIVE',
          },
        })

        return NextResponse.json({
          operation: 'softDelete',
          result: deleted,
          explanation: [
            '软删除要点：',
            '- 设置 deletedAt = now() 代替物理删除',
            '- 所有查询都要加 where: { deletedAt: null } 过滤',
            '- 可以通过清空 deletedAt 实现恢复',
            '- 生产项目通常用 Prisma 中间件自动注入 deletedAt 过滤',
          ],
        })
      }

      // ==========================================
      // 5. 软删除恢复
      // ==========================================
      case 'softRestore': {
        const productId4 = data?.productId
        if (!productId4) {
          return NextResponse.json({ error: 'productId required' }, { status: 400 })
        }

        const restored = await prisma.product.update({
          where: {
            id: productId4,
            deletedAt: { not: null }, // 确保是已删除的
          },
          data: {
            deletedAt: null,
            status: 'ACTIVE',
          },
        })

        return NextResponse.json({
          operation: 'softRestore',
          result: restored,
          explanation: '恢复软删除：把 deletedAt 设为 null。',
        })
      }

      // ==========================================
      // 6. 查询已软删除的数据
      // ==========================================
      case 'queryDeleted': {
        const [active, deleted, all] = await Promise.all([
          // 只查未删除的
          prisma.product.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true, status: true, deletedAt: true },
            take: 5,
          }),
          // 只查已删除的
          prisma.product.findMany({
            where: { deletedAt: { not: null } },
            select: { id: true, name: true, status: true, deletedAt: true },
            take: 5,
          }),
          // 查所有（包括已删除）
          prisma.product.findMany({
            select: { id: true, name: true, status: true, deletedAt: true },
            take: 5,
          }),
        ])

        return NextResponse.json({
          operation: 'queryDeleted',
          result: { active, deleted, all },
          explanation: '软删除数据管理：通过 where 条件区分正常数据、已删除数据、全部数据。',
        })
      }

      // ==========================================
      // 7. 嵌套写入事务（Nested Writes）
      // Prisma 的嵌套写入自动在事务中执行
      // ==========================================
      case 'nestedWrite': {
        // 场景：创建用户的同时创建他的第一篇文章
        const user = await prisma.user.create({
          data: {
            email: `test-${Date.now()}@example.com`,
            name: '事务测试用户',
            password: 'hashed_password',
            // 嵌套创建文章
            posts: {
              create: [
                { title: '我的第一篇文章', content: '这是通过嵌套写入创建的', published: true },
                { title: '草稿文章', content: '这是一篇草稿', published: false },
              ],
            },
          },
          include: {
            posts: true,
          },
        })

        return NextResponse.json({
          operation: 'nestedWrite',
          result: user,
          explanation: [
            '嵌套写入：Prisma 会自动把嵌套操作包在事务里。',
            '如果创建文章失败，用户的创建也会回滚。',
            '嵌套写入支持：create, createMany, connect, connectOrCreate, update, upsert, delete, deleteMany, disconnect, set',
          ],
        })
      }

      // ==========================================
      // 8. upsert - 存在即更新，不存在就创建
      // ==========================================
      case 'upsert': {
        const email = data?.email || 'upsert-test@example.com'
        const name = data?.name || '测试用户'

        const user = await prisma.user.upsert({
          where: { email },
          // 不存在 → 创建
          create: {
            email,
            name,
            password: 'hashed_default',
          },
          // 已存在 → 更新
          update: {
            name,
          },
        })

        return NextResponse.json({
          operation: 'upsert',
          result: user,
          explanation: [
            'upsert = UPDATE or INSERT：',
            '- where: 查找条件（必须是唯一字段）',
            '- create: 不存在时创建的数据',
            '- update: 存在时更新的数据',
            '对比 connectOrCreate：upsert 用于单记录操作，connectOrCreate 用于关联关系场景。',
          ],
        })
      }

      default:
        return NextResponse.json(
          {
            error: 'Unknown action',
            availableActions: [
              'interactive — 交互式事务（data.userId, data.productId, data.quantity）',
              'sequential — 批量事务',
              'optimisticLock — 乐观锁（data.productId, data.newPrice, data.version）',
              'softDelete — 软删除商品（data.productId）',
              'softRestore — 恢复软删除（data.productId）',
              'queryDeleted — 查询已删除数据',
              'nestedWrite — 嵌套写入事务',
              'upsert — 存在即更新',
            ],
          },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Transaction error:', error)
    return NextResponse.json({ error: 'Transaction failed', detail: String(error) }, { status: 500 })
  }
}
