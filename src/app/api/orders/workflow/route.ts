/**
 * 订单工作流 API
 *
 * GET  /api/orders/workflow                — 获取流程定义 + 实例列表
 * POST /api/orders/workflow                — 启动工作流（传入 orderId）
 * GET  /api/orders/workflow?instanceId=xxx — 获取单个实例详情
 * GET  /api/orders/workflow?orderId=xxx    — 根据订单 ID 获取实例
 * PUT  /api/orders/workflow                — 发送事件（人工审批、签收等）
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getOrderWorkflowEngine,
  startOrderWorkflow,
  orderWorkflowDefinition,
} from '@/lib/workflow/order-workflow'

// ==================== GET ====================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const instanceId = searchParams.get('instanceId')
    const orderId = searchParams.get('orderId')
    const listAll = searchParams.get('list')

    const engine = getOrderWorkflowEngine()

    // 查询单个实例
    if (instanceId) {
      const instance = await engine.getInstance(instanceId)
      if (!instance) {
        return NextResponse.json({ success: false, message: '实例不存在' }, { status: 404 })
      }
      return NextResponse.json({ success: true, data: instance })
    }

    // 根据订单 ID 查实例
    if (orderId) {
      const instance = await engine.getInstanceByBiz('order', orderId)
      if (!instance) {
        return NextResponse.json({ success: false, message: '该订单没有工作流实例' }, { status: 404 })
      }
      return NextResponse.json({ success: true, data: instance })
    }

    // 列出所有实例
    if (listAll !== null) {
      const store = new (await import('@/lib/workflow/store')).RedisInstanceStore()
      const instances = await store.list()
      return NextResponse.json({ success: true, data: instances })
    }

    // 默认返回流程定义（序列化安全：去掉 function 字段）
    const definition = {
      ...orderWorkflowDefinition,
      nodes: orderWorkflowDefinition.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        type: node.type,
        transitions: node.transitions.map((t) => ({
          target: t.target,
          event: t.event,
          priority: t.priority,
        })),
        timeoutMs: node.timeoutMs,
        metadata: node.metadata,
      })),
    }

    return NextResponse.json({ success: true, data: definition })
  } catch (error: any) {
    console.error('Workflow GET error:', error)
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}

// ==================== POST（启动工作流）====================

const startSchema = z.object({
  orderId: z.number().int().positive(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = startSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: '参数错误', details: validation.error.errors },
        { status: 400 },
      )
    }

    const { orderId } = validation.data

    // 检查是否已有流程
    const engine = getOrderWorkflowEngine()
    const existing = await engine.getInstanceByBiz('order', String(orderId))
    if (existing) {
      return NextResponse.json({
        success: false,
        message: '该订单已有工作流实例',
        data: existing,
      }, { status: 409 })
    }

    const instance = await startOrderWorkflow(orderId)
    return NextResponse.json({ success: true, data: instance }, { status: 201 })
  } catch (error: any) {
    console.error('Workflow POST error:', error)
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}

// ==================== PUT（发送事件）====================

const eventSchema = z.object({
  instanceId: z.string().min(1),
  event: z.string().min(1),
  data: z.record(z.unknown()).optional(),
})

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = eventSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: '参数错误', details: validation.error.errors },
        { status: 400 },
      )
    }

    const { instanceId, event, data } = validation.data
    const engine = getOrderWorkflowEngine()

    const instance = await engine.sendEvent(instanceId, event, data)
    return NextResponse.json({ success: true, data: instance })
  } catch (error: any) {
    console.error('Workflow PUT error:', error)
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}
