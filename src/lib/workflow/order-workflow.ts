/**
 * 订单工作流定义
 *
 * 流程图：
 *
 *   [开始] → [创建订单] → [支付校验] → [AI风控审核] → 通过 → [发货准备] → [等待签收] → [完成] → [结束]
 *                                           ↓ 拒绝
 *                                      [人工复审] → 通过 → [发货准备]
 *                                           ↓ 拒绝
 *                                        [取消订单] → [结束]
 *
 * 核心演示：
 * 1. AI 节点（ai）：Agent 根据订单信息自动判断风险，决定通过/拒绝
 * 2. 人工节点（human）：AI 拒绝后进入人工复审，等待管理员操作
 * 3. 条件分支：根据订单金额走不同路径
 * 4. 自动任务（task）：库存扣减、状态更新等
 */

import { prisma } from '../prisma'
import { redisUtils } from '../redis'
import { WorkflowDefinition, WorkflowContext, ActionResult, WorkflowEngine } from './engine'
import { RedisInstanceStore } from './store'
import { createId, logger } from '../agent/utils'
import { openaiClient } from '../agent/core'
import { agentConfig } from '../agent/config'

// ==================== AI 风控审核逻辑 ====================

/**
 * AI Agent 风控审核
 * 把 Agent 当作流程中的一个"执行节点"
 */
async function aiRiskReview(context: WorkflowContext): Promise<ActionResult> {
  const { bizId, data } = context
  const totalAmount = Number(data.totalAmount || 0)
  const itemCount = Number(data.itemCount || 0)
  const userOrderCount = Number(data.userOrderCount || 0)
  const address = String(data.address || '')
  const userName = String(data.userName || '')

  const prompt = `你是一个电商订单风控审核 AI。请根据以下订单信息进行风险评估，输出 JSON 格式的审核结果。

订单信息：
- 订单号: ${bizId}
- 下单用户: ${userName}
- 订单金额: ¥${totalAmount}
- 商品数量: ${itemCount} 件
- 收货地址: ${address}
- 用户历史订单数: ${userOrderCount}

审核规则：
1. 金额 > 5000 且用户历史订单 < 3 → 高风险
2. 单次购买数量 > 10 → 中风险（可能黄牛）
3. 地址包含"测试"或为空 → 高风险
4. 其他情况 → 低风险，通过

请严格输出以下 JSON 格式（不要输出其他内容）：
{
  "decision": "approve" 或 "reject",
  "riskLevel": "low" / "medium" / "high",
  "reason": "审核理由说明"
}`

  try {
    const completion = await openaiClient.chat.send({
      model: agentConfig.llmModel,
      messages: [{ role: 'user', content: prompt }] as any,
      temperature: 0.1,
      stream: false,
    })

    const raw = (completion.choices?.[0]?.message?.content as string) || ''
    logger.info('AI 风控审核原始输出', { orderId: bizId, raw })

    // 解析 JSON（兼容 markdown code block）
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return {
        success: true,
        event: 'reject',
        data: { aiReview: { decision: 'reject', riskLevel: 'high', reason: 'AI 输出解析失败，转人工审核' } },
        message: 'AI 输出解析失败，转人工审核',
      }
    }

    const review = JSON.parse(jsonMatch[0])
    const decision = review.decision === 'approve' ? 'approve' : 'reject'

    return {
      success: true,
      event: decision,
      data: { aiReview: review },
      message: `AI 审核: ${decision} | 风险等级: ${review.riskLevel} | ${review.reason}`,
    }
  } catch (error: any) {
    logger.error('AI 风控审核异常', { error: error.message })
    // AI 异常时默认转人工
    return {
      success: true,
      event: 'reject',
      data: { aiReview: { decision: 'reject', riskLevel: 'unknown', reason: `AI 服务异常: ${error.message}` } },
      message: 'AI 服务异常，转人工审核',
    }
  }
}

// ==================== 流程节点动作 ====================

/** 创建订单节点 */
async function orderCreatedAction(context: WorkflowContext): Promise<ActionResult> {
  const orderId = parseInt(context.bizId)

  // 获取订单信息填充 context
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: true, items: { include: { product: true } } },
  })

  if (!order) {
    return { success: false, message: `订单 ${orderId} 不存在` }
  }

  // 获取用户历史订单数
  const userOrderCount = await prisma.order.count({ where: { userId: order.userId } })

  return {
    success: true,
    event: 'default',
    data: {
      orderId: order.id,
      orderNo: order.orderNo,
      totalAmount: Number(order.totalAmount),
      itemCount: order.items.reduce((sum, i) => sum + i.quantity, 0),
      address: order.address || '',
      userName: order.user.name || order.user.email,
      userId: order.userId,
      userOrderCount,
      status: order.status,
    },
    message: `订单 ${order.orderNo} 信息已加载`,
  }
}

/** 支付校验节点 */
async function paymentCheckAction(context: WorkflowContext): Promise<ActionResult> {
  const status = context.data.status as string

  if (status !== 'PAID') {
    return {
      success: true,
      event: 'unpaid',
      message: '订单未支付，等待支付',
    }
  }

  // 小额订单直接跳过 AI 审核
  const totalAmount = Number(context.data.totalAmount || 0)
  if (totalAmount <= 100) {
    return {
      success: true,
      event: 'skip_review',
      data: { aiReview: { decision: 'approve', riskLevel: 'low', reason: '小额订单自动通过' } },
      message: `小额订单 ¥${totalAmount}，跳过 AI 审核`,
    }
  }

  return {
    success: true,
    event: 'need_review',
    message: '订单已支付，进入风控审核',
  }
}

/** AI 风控审核节点 */
async function aiReviewAction(context: WorkflowContext): Promise<ActionResult> {
  return aiRiskReview(context)
}

/** 发货准备节点 */
async function prepareShipmentAction(context: WorkflowContext): Promise<ActionResult> {
  const orderId = parseInt(context.bizId)

  // 更新订单状态为 SHIPPED
  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'SHIPPED', shippedAt: new Date() },
  })

  // 清除缓存
  await Promise.all([
    redisUtils.del(`order:${orderId}`),
    redisUtils.delPattern('orders:list:*'),
  ])

  return {
    success: true,
    event: 'default',
    data: { shippedAt: new Date().toISOString() },
    message: '订单已发货',
  }
}

/** 取消订单节点 */
async function cancelOrderAction(context: WorkflowContext): Promise<ActionResult> {
  const orderId = parseInt(context.bizId)

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  })

  if (!order) {
    return { success: false, message: '订单不存在' }
  }

  // 事务：取消订单 + 回滚库存
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    })

    for (const item of order.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: {
          stock: { increment: item.quantity },
          salesCount: { decrement: item.quantity },
        },
      })
    }
  })

  // 清除缓存
  await Promise.all([
    redisUtils.del(`order:${orderId}`),
    redisUtils.delPattern('orders:list:*'),
  ])

  return {
    success: true,
    event: 'default',
    data: { cancelledAt: new Date().toISOString(), cancelReason: context.data.aiReview },
    message: '订单已取消，库存已回滚',
  }
}

// ==================== 流程定义 ====================

export const orderWorkflowDefinition: WorkflowDefinition = {
  id: 'order-workflow',
  name: '订单处理流程',
  version: '1.0.0',
  description: '包含 AI 风控审核的订单处理流程',
  startNodeId: 'start',
  nodes: [
    // 起始节点
    {
      id: 'start',
      name: '开始',
      type: 'start',
      transitions: [{ target: 'load_order', event: 'default' }],
      metadata: { x: 400, y: 50 },
    },

    // 加载订单信息
    {
      id: 'load_order',
      name: '加载订单',
      type: 'task',
      action: orderCreatedAction,
      transitions: [{ target: 'payment_check', event: 'default' }],
      metadata: { x: 400, y: 140 },
    },

    // 支付校验
    {
      id: 'payment_check',
      name: '支付校验',
      type: 'condition',
      action: paymentCheckAction,
      transitions: [
        { target: 'wait_payment', event: 'unpaid' },
        { target: 'ai_review', event: 'need_review' },
        { target: 'prepare_shipment', event: 'skip_review' },
      ],
      metadata: { x: 400, y: 230 },
    },

    // 等待支付
    {
      id: 'wait_payment',
      name: '等待支付',
      type: 'wait',
      transitions: [
        { target: 'payment_check', event: 'paid' },
        { target: 'cancel_order', event: 'timeout' },
      ],
      timeoutMs: 30 * 60 * 1000,
      metadata: { x: 150, y: 230 },
    },

    // AI 风控审核
    {
      id: 'ai_review',
      name: 'AI 风控审核',
      type: 'ai',
      action: aiReviewAction,
      transitions: [
        { target: 'prepare_shipment', event: 'approve' },
        { target: 'human_review', event: 'reject' },
      ],
      metadata: { x: 400, y: 340 },
    },

    // 人工复审
    {
      id: 'human_review',
      name: '人工复审',
      type: 'human',
      transitions: [
        { target: 'prepare_shipment', event: 'approve' },
        { target: 'cancel_order', event: 'reject' },
      ],
      metadata: { x: 650, y: 340 },
    },

    // 发货准备
    {
      id: 'prepare_shipment',
      name: '发货准备',
      type: 'task',
      action: prepareShipmentAction,
      transitions: [{ target: 'wait_receipt', event: 'default' }],
      metadata: { x: 400, y: 450 },
    },

    // 等待签收
    {
      id: 'wait_receipt',
      name: '等待签收',
      type: 'wait',
      transitions: [
        { target: 'completed', event: 'received' },
      ],
      metadata: { x: 400, y: 540 },
    },

    // 已完成
    {
      id: 'completed',
      name: '订单完成',
      type: 'task',
      action: async (context) => {
        const orderId = parseInt(context.bizId)
        await prisma.order.update({
          where: { id: orderId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        })
        await Promise.all([
          redisUtils.del(`order:${orderId}`),
          redisUtils.delPattern('orders:list:*'),
        ])
        return { success: true, event: 'default', message: '订单已完成' }
      },
      transitions: [{ target: 'end', event: 'default' }],
      metadata: { x: 400, y: 630 },
    },

    // 取消订单
    {
      id: 'cancel_order',
      name: '取消订单',
      type: 'task',
      action: cancelOrderAction,
      transitions: [{ target: 'end', event: 'default' }],
      metadata: { x: 650, y: 450 },
    },

    // 结束
    {
      id: 'end',
      name: '结束',
      type: 'end',
      transitions: [],
      metadata: { x: 400, y: 720 },
    },
  ],
}

// ==================== 引擎单例 ====================

let _engine: WorkflowEngine | null = null

export function getOrderWorkflowEngine(): WorkflowEngine {
  if (!_engine) {
    const store = new RedisInstanceStore()
    _engine = new WorkflowEngine(store)
    _engine.registerDefinition(orderWorkflowDefinition)
    logger.info('订单工作流引擎已初始化')
  }
  return _engine
}

/** 启动订单工作流 */
export async function startOrderWorkflow(orderId: number) {
  const engine = getOrderWorkflowEngine()
  const instanceId = createId('wf')

  return engine.startInstance({
    definitionId: 'order-workflow',
    instanceId,
    context: {
      bizId: String(orderId),
      bizType: 'order',
      data: {},
      variables: {},
    },
  })
}
