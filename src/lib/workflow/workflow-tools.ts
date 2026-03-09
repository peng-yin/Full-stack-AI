/**
 * 工作流 Agent 工具注册
 *
 * 让 AI Agent 具备查询/操作工作流的能力：
 * - 查询订单工作流状态
 * - 人工审批（通过 Agent 对话触发）
 * - 启动工作流
 */

import { z } from 'zod'
import { getToolRegistry } from '../agent/mcp'
import { getOrderWorkflowEngine, startOrderWorkflow } from './order-workflow'
import { RedisInstanceStore } from './store'

export function registerWorkflowTools() {
  const registry = getToolRegistry()

  // 查询订单工作流状态
  registry.register({
    name: 'query_order_workflow',
    description: '查询订单的工作流状态，包括当前节点、执行日志、AI审核结果等',
    category: 'system',
    requiresConfirmation: false,
    parameters: z.object({
      orderId: z.string().describe('订单 ID'),
    }),
    execute: async ({ orderId }: { orderId: string }) => {
      const engine = getOrderWorkflowEngine()
      const instance = await engine.getInstanceByBiz('order', orderId)

      if (!instance) {
        return { success: false, message: `订单 ${orderId} 没有工作流实例` }
      }

      // 获取流程定义用于节点名称映射
      const definition = engine.getDefinition(instance.definitionId)
      const currentNode = definition?.nodes.find((n) => n.id === instance.currentNodeId)

      return {
        success: true,
        data: {
          instanceId: instance.id,
          status: instance.status,
          currentNode: {
            id: instance.currentNodeId,
            name: currentNode?.name || '未知',
            type: currentNode?.type || '未知',
          },
          aiReview: instance.context.data.aiReview || null,
          logs: instance.logs.slice(-10),
          createdAt: instance.createdAt,
          updatedAt: instance.updatedAt,
        },
      }
    },
  })

  // 人工审批
  registry.register({
    name: 'approve_order_workflow',
    description: '对处于人工复审阶段的订单进行审批（通过或拒绝）。只有当订单处于"人工复审"节点时才能操作。',
    category: 'system',
    requiresConfirmation: true,
    parameters: z.object({
      orderId: z.string().describe('订单 ID'),
      decision: z.enum(['approve', 'reject']).describe('审批决定：approve=通过, reject=拒绝'),
      reason: z.string().optional().describe('审批理由'),
    }),
    execute: async ({ orderId, decision, reason }: { orderId: string; decision: 'approve' | 'reject'; reason?: string }) => {
      const engine = getOrderWorkflowEngine()
      const instance = await engine.getInstanceByBiz('order', orderId)

      if (!instance) {
        return { success: false, message: `订单 ${orderId} 没有工作流实例` }
      }

      if (instance.currentNodeId !== 'human_review') {
        return {
          success: false,
          message: `订单当前在"${instance.currentNodeId}"节点，不在人工复审阶段`,
        }
      }

      try {
        const updated = await engine.sendEvent(instance.id, decision, {
          humanReview: { decision, reason, reviewedAt: new Date().toISOString() },
        })
        return {
          success: true,
          data: {
            decision,
            reason,
            newNodeId: updated.currentNodeId,
            status: updated.status,
          },
          message: `人工审批完成: ${decision === 'approve' ? '通过' : '拒绝'}`,
        }
      } catch (error: any) {
        return { success: false, message: error.message }
      }
    },
  })

  // 启动工作流
  registry.register({
    name: 'start_order_workflow',
    description: '为指定订单启动工作流程（包含支付校验、AI风控审核、发货等步骤）',
    category: 'system',
    requiresConfirmation: true,
    parameters: z.object({
      orderId: z.number().describe('订单 ID（数字）'),
    }),
    execute: async ({ orderId }: { orderId: number }) => {
      try {
        const instance = await startOrderWorkflow(orderId)
        return {
          success: true,
          data: {
            instanceId: instance.id,
            currentNode: instance.currentNodeId,
            status: instance.status,
          },
          message: `工作流已启动，实例ID: ${instance.id}`,
        }
      } catch (error: any) {
        return { success: false, message: error.message }
      }
    },
  })

  // 查询所有工作流实例
  registry.register({
    name: 'list_order_workflows',
    description: '列出所有订单工作流实例的状态概览',
    category: 'system',
    requiresConfirmation: false,
    parameters: z.object({
      status: z.enum(['running', 'completed', 'failed', 'suspended']).optional().describe('过滤状态'),
    }),
    execute: async ({ status }: { status?: string }) => {
      const store = new RedisInstanceStore()
      const instances = await store.list(status ? { status: status as any } : undefined)

      return {
        success: true,
        data: instances.map((inst) => ({
          instanceId: inst.id,
          orderId: inst.context.bizId,
          status: inst.status,
          currentNode: inst.currentNodeId,
          aiReview: inst.context.data.aiReview || null,
          createdAt: inst.createdAt,
        })),
        message: `共 ${instances.length} 个工作流实例`,
      }
    },
  })
}
