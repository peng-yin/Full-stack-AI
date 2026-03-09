import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * 批量操作实战 API
 * 
 * 覆盖操作：
 * - createMany：批量创建
 * - updateMany：批量更新
 * - deleteMany：批量删除（含条件删除）
 * - createManyAndReturn：批量创建并返回（Prisma 5.14.0+）
 */

// POST /api/db-practice/batch - 批量操作
export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json()

    switch (action) {
      // ==========================================
      // 1. createMany - 批量创建
      // 适用场景：导入数据、批量初始化、日志批量写入
      // 注意：createMany 不支持返回创建的记录（MySQL限制）
      // ==========================================
      case 'createMany': {
        const result = await prisma.operationLog.createMany({
          data: [
            { action: 'LOGIN', target: 'user', targetId: '1', detail: '用户登录', ip: '192.168.1.1' },
            { action: 'LOGIN', target: 'user', targetId: '2', detail: '用户登录', ip: '192.168.1.2' },
            { action: 'VIEW_PRODUCT', target: 'product', targetId: '10', detail: '浏览商品' },
            { action: 'ADD_CART', target: 'cart', targetId: '1', detail: '加入购物车' },
            { action: 'CREATE_ORDER', target: 'order', targetId: '100', detail: '创建订单' },
          ],
          skipDuplicates: true, // 跳过重复记录（如果有唯一约束冲突）
        })
        // result = { count: 5 }  只返回创建的数量，不返回记录本身
        return NextResponse.json({
          operation: 'createMany',
          result,
          explanation: 'createMany 批量插入，返回 {count: N}。skipDuplicates 跳过唯一约束冲突的记录。',
        })
      }

      // ==========================================
      // 2. createMany 批量创建标签
      // 演示 skipDuplicates 的实际用途
      // ==========================================
      case 'createManyTags': {
        const result = await prisma.tag.createMany({
          data: [
            { name: '热卖', color: '#ff4444' },
            { name: '新品', color: '#44ff44' },
            { name: '推荐', color: '#4444ff' },
            { name: '限时', color: '#ff8800' },
            { name: '清仓', color: '#888888' },
          ],
          skipDuplicates: true, // name 是 unique，已存在的标签不会报错
        })
        return NextResponse.json({
          operation: 'createManyTags',
          result,
          explanation: 'Tag.name 有唯一约束，skipDuplicates 让已存在的标签被静默跳过，不报错。',
        })
      }

      // ==========================================
      // 3. updateMany - 批量更新
      // 适用场景：批量上下架、批量修改状态、批量打标签
      // ==========================================
      case 'updateMany': {
        // 场景：把所有库存为0的商品状态改为 OUT_OF_STOCK
        const result = await prisma.product.updateMany({
          where: {
            stock: 0,
            status: 'ACTIVE',
            deletedAt: null, // 排除已软删除的
          },
          data: {
            status: 'OUT_OF_STOCK',
          },
        })
        // result = { count: N }  只返回更新的数量
        return NextResponse.json({
          operation: 'updateMany',
          result,
          explanation: 'updateMany 返回 {count: N}。适合不需要返回值的批量修改。',
        })
      }

      // ==========================================
      // 4. updateMany - 带复杂条件的批量更新
      // ==========================================
      case 'updateManyComplex': {
        // 场景：把30天前的待支付订单自动取消
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

        const result = await prisma.order.updateMany({
          where: {
            status: 'PENDING',
            createdAt: {
              lt: thirtyDaysAgo, // lt = less than
            },
          },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
          },
        })
        return NextResponse.json({
          operation: 'updateManyComplex',
          result,
          explanation: '复杂条件批量更新：lt(小于)、gt(大于)、lte(小于等于)、gte(大于等于)、in(在列表中)、notIn(不在列表中)',
        })
      }

      // ==========================================
      // 5. deleteMany - 批量删除
      // 适用场景：清理过期数据、批量删除
      // ==========================================
      case 'deleteMany': {
        // 场景：清理7天前的操作日志
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

        const result = await prisma.operationLog.deleteMany({
          where: {
            createdAt: {
              lt: sevenDaysAgo,
            },
          },
        })
        return NextResponse.json({
          operation: 'deleteMany',
          result,
          explanation: 'deleteMany 物理删除，返回 {count: N}。生产环境建议用软删除替代。',
        })
      }

      // ==========================================
      // 6. deleteMany 无条件 - 清空表
      // ==========================================
      case 'deleteManyAll': {
        // ⚠️ 慎用：清空操作日志表
        const result = await prisma.operationLog.deleteMany({})
        return NextResponse.json({
          operation: 'deleteManyAll',
          result,
          explanation: '⚠️ deleteMany({}) 不带 where 会清空整张表！生产环境千万要小心。',
        })
      }

      default:
        return NextResponse.json(
          {
            error: 'Unknown action',
            availableActions: [
              'createMany — 批量创建操作日志',
              'createManyTags — 批量创建标签（skipDuplicates）',
              'updateMany — 批量更新库存为0的商品状态',
              'updateManyComplex — 批量取消超时订单',
              'deleteMany — 清理过期日志',
              'deleteManyAll — 清空日志表',
            ],
          },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Batch operation error:', error)
    return NextResponse.json({ error: 'Batch operation failed', detail: String(error) }, { status: 500 })
  }
}
