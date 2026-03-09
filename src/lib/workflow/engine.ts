/**
 * 流程引擎核心 —— 状态机 + 节点执行器
 *
 * 设计思路：
 * 1. WorkflowDefinition  — 流程定义（可配置的 JSON 数据）
 * 2. WorkflowInstance     — 流程实例（运行时状态，持久化到 Redis）
 * 3. WorkflowEngine       — 引擎：驱动实例按照定义执行
 *
 * 核心概念：
 * - Node（节点）：流程中的每一步，包含 action（执行函数）和转移规则
 * - Transition（转移）：从一个节点到另一个节点的条件规则
 * - Guard（守卫）：转移前的条件判断函数
 * - Action（动作）：节点进入时执行的业务逻辑
 */

import { logger } from '../agent/utils'

// ==================== 类型定义 ====================

/** 节点类型 */
export type NodeType =
  | 'start'       // 起始节点
  | 'end'         // 结束节点
  | 'task'        // 普通任务节点（自动执行）
  | 'human'       // 人工审批节点（需要人工操作）
  | 'ai'          // AI 审核节点（Agent 自动判断）
  | 'condition'   // 条件分支节点
  | 'wait'        // 等待节点（等待外部事件）

/** 转移条件 */
export interface Transition {
  /** 目标节点 ID */
  target: string
  /** 触发事件名称 */
  event?: string
  /** 守卫条件（返回 true 才允许转移） */
  guard?: (context: WorkflowContext) => boolean | Promise<boolean>
  /** 转移优先级（数字越大越优先，用于条件分支） */
  priority?: number
}

/** 节点定义 */
export interface NodeDefinition {
  id: string
  name: string
  type: NodeType
  /** 节点进入时执行的动作 */
  action?: (context: WorkflowContext) => Promise<ActionResult>
  /** 从该节点出发的转移规则 */
  transitions: Transition[]
  /** 节点超时时间（毫秒），超时自动触发 timeout 事件 */
  timeoutMs?: number
  /** 节点元数据（用于前端展示等） */
  metadata?: Record<string, unknown>
}

/** 动作执行结果 */
export interface ActionResult {
  success: boolean
  /** 事件名称，用于决定下一步走哪个转移 */
  event?: string
  /** 需要合并到 context 中的数据 */
  data?: Record<string, unknown>
  /** 结果说明 */
  message?: string
}

/** 流程上下文（贯穿整个流程的数据） */
export interface WorkflowContext {
  /** 业务 ID（如订单 ID） */
  bizId: string
  /** 业务类型 */
  bizType: string
  /** 自定义数据 */
  data: Record<string, unknown>
  /** 流程变量 */
  variables: Record<string, unknown>
}

/** 流程定义 */
export interface WorkflowDefinition {
  id: string
  name: string
  version: string
  description?: string
  /** 起始节点 ID */
  startNodeId: string
  /** 所有节点 */
  nodes: NodeDefinition[]
}

/** 流程实例状态 */
export type InstanceStatus = 'running' | 'completed' | 'failed' | 'suspended'

/** 流程执行日志 */
export interface ExecutionLog {
  nodeId: string
  nodeName: string
  nodeType: NodeType
  status: 'enter' | 'exit' | 'error' | 'timeout'
  event?: string
  message?: string
  data?: Record<string, unknown>
  timestamp: string
}

/** 流程实例 */
export interface WorkflowInstance {
  id: string
  definitionId: string
  /** 当前节点 ID */
  currentNodeId: string
  status: InstanceStatus
  context: WorkflowContext
  /** 执行日志 */
  logs: ExecutionLog[]
  createdAt: string
  updatedAt: string
}

// ==================== 持久化接口 ====================

/** 实例存储接口（可替换为数据库实现） */
export interface InstanceStore {
  save(instance: WorkflowInstance): Promise<void>
  get(instanceId: string): Promise<WorkflowInstance | null>
  getByBiz(bizType: string, bizId: string): Promise<WorkflowInstance | null>
  list(filter?: { status?: InstanceStatus; definitionId?: string }): Promise<WorkflowInstance[]>
}

// ==================== 流程引擎 ====================

export class WorkflowEngine {
  private definitions = new Map<string, WorkflowDefinition>()
  private store: InstanceStore

  constructor(store: InstanceStore) {
    this.store = store
  }

  /** 注册流程定义 */
  registerDefinition(definition: WorkflowDefinition): void {
    // 校验起始节点存在
    const startNode = definition.nodes.find((n) => n.id === definition.startNodeId)
    if (!startNode) {
      throw new Error(`起始节点 ${definition.startNodeId} 不存在`)
    }
    // 校验至少有一个结束节点
    const endNodes = definition.nodes.filter((n) => n.type === 'end')
    if (endNodes.length === 0) {
      throw new Error('流程定义必须包含至少一个结束节点')
    }
    this.definitions.set(definition.id, definition)
    logger.info('流程定义已注册', { id: definition.id, name: definition.name })
  }

  /** 获取流程定义 */
  getDefinition(id: string): WorkflowDefinition | undefined {
    return this.definitions.get(id)
  }

  /** 列出所有流程定义 */
  listDefinitions(): WorkflowDefinition[] {
    return Array.from(this.definitions.values())
  }

  /** 启动流程实例 */
  async startInstance(params: {
    definitionId: string
    instanceId: string
    context: WorkflowContext
  }): Promise<WorkflowInstance> {
    const definition = this.definitions.get(params.definitionId)
    if (!definition) {
      throw new Error(`流程定义 ${params.definitionId} 不存在`)
    }

    const instance: WorkflowInstance = {
      id: params.instanceId,
      definitionId: params.definitionId,
      currentNodeId: definition.startNodeId,
      status: 'running',
      context: params.context,
      logs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await this.store.save(instance)
    logger.info('流程实例已启动', { instanceId: instance.id, definitionId: params.definitionId })

    // 自动执行起始节点
    return this.executeCurrentNode(instance, definition)
  }

  /** 发送事件驱动流程（用于 human/wait 节点的外部触发） */
  async sendEvent(instanceId: string, event: string, data?: Record<string, unknown>): Promise<WorkflowInstance> {
    const instance = await this.store.get(instanceId)
    if (!instance) {
      throw new Error(`流程实例 ${instanceId} 不存在`)
    }
    if (instance.status !== 'running') {
      throw new Error(`流程实例 ${instanceId} 状态为 ${instance.status}，无法接收事件`)
    }

    const definition = this.definitions.get(instance.definitionId)
    if (!definition) {
      throw new Error(`流程定义 ${instance.definitionId} 不存在`)
    }

    // 合并数据到 context
    if (data) {
      instance.context.data = { ...instance.context.data, ...data }
    }

    // 找到当前节点
    const currentNode = definition.nodes.find((n) => n.id === instance.currentNodeId)
    if (!currentNode) {
      throw new Error(`节点 ${instance.currentNodeId} 不存在`)
    }

    // 查找匹配事件的转移
    const transition = this.findTransition(currentNode, event, instance.context)
    if (!transition) {
      throw new Error(`节点 ${currentNode.id} 没有匹配事件 ${event} 的转移`)
    }

    // 记录退出日志
    instance.logs.push({
      nodeId: currentNode.id,
      nodeName: currentNode.name,
      nodeType: currentNode.type,
      status: 'exit',
      event,
      message: `通过事件 "${event}" 离开`,
      timestamp: new Date().toISOString(),
    })

    // 转移到下一节点
    instance.currentNodeId = transition.target
    instance.updatedAt = new Date().toISOString()
    await this.store.save(instance)

    // 自动执行新节点
    return this.executeCurrentNode(instance, definition)
  }

  /** 根据业务信息获取流程实例 */
  async getInstanceByBiz(bizType: string, bizId: string): Promise<WorkflowInstance | null> {
    return this.store.getByBiz(bizType, bizId)
  }

  /** 获取流程实例 */
  async getInstance(instanceId: string): Promise<WorkflowInstance | null> {
    return this.store.get(instanceId)
  }

  // ==================== 私有方法 ====================

  /** 执行当前节点 */
  private async executeCurrentNode(
    instance: WorkflowInstance,
    definition: WorkflowDefinition,
  ): Promise<WorkflowInstance> {
    const node = definition.nodes.find((n) => n.id === instance.currentNodeId)
    if (!node) {
      instance.status = 'failed'
      await this.store.save(instance)
      throw new Error(`节点 ${instance.currentNodeId} 不存在`)
    }

    // 记录进入日志
    instance.logs.push({
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      status: 'enter',
      message: `进入节点 "${node.name}"`,
      timestamp: new Date().toISOString(),
    })

    // 结束节点：标记流程完成
    if (node.type === 'end') {
      instance.status = 'completed'
      instance.updatedAt = new Date().toISOString()
      await this.store.save(instance)
      logger.info('流程实例已完成', { instanceId: instance.id })
      return instance
    }

    // human / wait 节点：暂停等待外部事件
    if (node.type === 'human' || node.type === 'wait') {
      await this.store.save(instance)
      logger.info('流程等待外部事件', { instanceId: instance.id, nodeId: node.id, nodeType: node.type })
      return instance
    }

    // task / ai / condition / start 节点：自动执行 action
    if (node.action) {
      try {
        const result = await node.action(instance.context)

        // 合并返回数据
        if (result.data) {
          instance.context.data = { ...instance.context.data, ...result.data }
        }

        // 记录执行结果
        instance.logs.push({
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          status: 'exit',
          event: result.event,
          message: result.message || (result.success ? '执行成功' : '执行失败'),
          data: result.data,
          timestamp: new Date().toISOString(),
        })

        if (!result.success) {
          instance.status = 'failed'
          instance.updatedAt = new Date().toISOString()
          await this.store.save(instance)
          return instance
        }

        // 根据事件寻找转移
        const event = result.event || 'default'
        const transition = this.findTransition(node, event, instance.context)

        if (!transition) {
          // 没有匹配的转移，可能是 AI 节点需要人工介入
          logger.warn('没有匹配的转移', { nodeId: node.id, event })
          await this.store.save(instance)
          return instance
        }

        // 转移到下一节点
        instance.currentNodeId = transition.target
        instance.updatedAt = new Date().toISOString()
        await this.store.save(instance)

        // 递归执行下一节点
        return this.executeCurrentNode(instance, definition)
      } catch (error: any) {
        instance.logs.push({
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          status: 'error',
          message: error.message,
          timestamp: new Date().toISOString(),
        })
        instance.status = 'failed'
        instance.updatedAt = new Date().toISOString()
        await this.store.save(instance)
        logger.error('节点执行失败', { nodeId: node.id, error: error.message })
        return instance
      }
    }

    // 没有 action 的节点，尝试 default 转移
    const transition = this.findTransition(node, 'default', instance.context)
    if (transition) {
      instance.currentNodeId = transition.target
      instance.updatedAt = new Date().toISOString()
      await this.store.save(instance)
      return this.executeCurrentNode(instance, definition)
    }

    await this.store.save(instance)
    return instance
  }

  /** 查找匹配的转移 */
  private findTransition(
    node: NodeDefinition,
    event: string,
    context: WorkflowContext,
  ): Transition | undefined {
    // 按优先级排序
    const sorted = [...node.transitions].sort((a, b) => (b.priority || 0) - (a.priority || 0))

    for (const t of sorted) {
      // 事件匹配（空事件 = 默认转移）
      const eventMatch = !t.event || t.event === event || t.event === '*'
      if (!eventMatch) continue

      // 守卫条件
      if (t.guard) {
        const guardResult = t.guard(context)
        // 同步/异步兼容（这里简化为同步，因为在循环中）
        if (guardResult instanceof Promise) {
          // 对于异步 guard，跳过（实际生产中需要更好的处理）
          continue
        }
        if (!guardResult) continue
      }

      return t
    }

    return undefined
  }
}
