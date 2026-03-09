'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ==================== 类型 ====================

interface WorkflowNode {
  id: string
  name: string
  type: string
  transitions: { target: string; event?: string }[]
  metadata?: { x?: number; y?: number }
}

interface WorkflowDefinition {
  id: string
  name: string
  version: string
  description?: string
  startNodeId: string
  nodes: WorkflowNode[]
}

interface ExecutionLog {
  nodeId: string
  nodeName: string
  nodeType: string
  status: string
  event?: string
  message?: string
  data?: Record<string, unknown>
  timestamp: string
}

interface WorkflowInstance {
  id: string
  definitionId: string
  currentNodeId: string
  status: string
  context: {
    bizId: string
    bizType: string
    data: Record<string, unknown>
  }
  logs: ExecutionLog[]
  createdAt: string
  updatedAt: string
}

// ==================== 流程图 SVG 组件 ====================

const NODE_W = 160
const NODE_H = 44
const NODE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  start: { bg: '#1e293b', border: '#475569', text: '#94a3b8' },
  end: { bg: '#1e293b', border: '#475569', text: '#94a3b8' },
  task: { bg: '#172554', border: '#3b82f6', text: '#93c5fd' },
  condition: { bg: '#422006', border: '#f59e0b', text: '#fcd34d' },
  ai: { bg: '#14532d', border: '#22c55e', text: '#86efac' },
  human: { bg: '#4c1d95', border: '#8b5cf6', text: '#c4b5fd' },
  wait: { bg: '#1e1b4b', border: '#6366f1', text: '#a5b4fc' },
}

function FlowGraph({
  definition,
  currentNodeId,
  instanceStatus,
  logs,
}: {
  definition: WorkflowDefinition
  currentNodeId?: string
  instanceStatus?: string
  logs?: ExecutionLog[]
}) {
  const nodeMap = new Map(definition.nodes.map((n) => [n.id, n]))

  // 用 metadata.x / metadata.y 确定节点位置
  const getPos = (node: WorkflowNode) => ({
    x: (node.metadata?.x as number) ?? 400,
    y: (node.metadata?.y as number) ?? 0,
  })

  // 计算 SVG 视图大小
  let maxX = 0, maxY = 0
  definition.nodes.forEach((n) => {
    const p = getPos(n)
    if (p.x + NODE_W > maxX) maxX = p.x + NODE_W
    if (p.y + NODE_H > maxY) maxY = p.y + NODE_H
  })
  const svgW = maxX + 40
  const svgH = maxY + 40

  // 已访问节点集合
  const visitedNodes = new Set(logs?.map((l) => l.nodeId) || [])

  // 连线
  const edges: { from: WorkflowNode; to: WorkflowNode; label?: string }[] = []
  definition.nodes.forEach((node) => {
    node.transitions.forEach((t) => {
      const target = nodeMap.get(t.target)
      if (target) edges.push({ from: node, to: target, label: t.event })
    })
  })

  return (
    <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} className="block">
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#475569" />
        </marker>
        <marker id="arrowhead-active" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#3b82f6" />
        </marker>
      </defs>

      {/* 连线 */}
      {edges.map((edge, idx) => {
        const f = getPos(edge.from)
        const t = getPos(edge.to)
        const x1 = f.x + NODE_W / 2
        const y1 = f.y + NODE_H
        const x2 = t.x + NODE_W / 2
        const y2 = t.y

        const isActive = visitedNodes.has(edge.from.id) && visitedNodes.has(edge.to.id)

        // 简单贝塞尔曲线
        const midY = (y1 + y2) / 2
        const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`

        return (
          <g key={idx}>
            <path
              d={path}
              fill="none"
              stroke={isActive ? '#3b82f6' : '#334155'}
              strokeWidth={isActive ? 2 : 1}
              markerEnd={isActive ? 'url(#arrowhead-active)' : 'url(#arrowhead)'}
            />
            {edge.label && (
              <text
                x={(x1 + x2) / 2 + 8}
                y={midY - 4}
                fill="#64748b"
                fontSize="11"
                textAnchor="start"
              >
                {edge.label}
              </text>
            )}
          </g>
        )
      })}

      {/* 节点 */}
      {definition.nodes.map((node) => {
        const pos = getPos(node)
        const colors = NODE_COLORS[node.type] || NODE_COLORS.task
        const isCurrent = node.id === currentNodeId
        const isVisited = visitedNodes.has(node.id)

        const rx = node.type === 'condition' ? 20 : node.type === 'start' || node.type === 'end' ? 22 : 8

        return (
          <g key={node.id}>
            {/* 当前节点光晕 */}
            {isCurrent && instanceStatus === 'running' && (
              <rect
                x={pos.x - 4}
                y={pos.y - 4}
                width={NODE_W + 8}
                height={NODE_H + 8}
                rx={rx + 4}
                fill="none"
                stroke={colors.border}
                strokeWidth="2"
                opacity="0.5"
              >
                <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2s" repeatCount="indefinite" />
              </rect>
            )}

            <rect
              x={pos.x}
              y={pos.y}
              width={NODE_W}
              height={NODE_H}
              rx={rx}
              fill={isCurrent ? colors.bg : isVisited ? '#0f172a' : '#0f172a'}
              stroke={isCurrent ? colors.border : isVisited ? '#475569' : '#1e293b'}
              strokeWidth={isCurrent ? 2 : 1}
              opacity={isVisited || isCurrent ? 1 : 0.5}
            />

            {/* 节点类型标签 */}
            <text
              x={pos.x + 10}
              y={pos.y + 17}
              fill={isCurrent ? colors.text : isVisited ? '#64748b' : '#334155'}
              fontSize="10"
              fontFamily="monospace"
            >
              {node.type}
            </text>

            {/* 节点名称 */}
            <text
              x={pos.x + 10}
              y={pos.y + 34}
              fill={isCurrent ? '#f1f5f9' : isVisited ? '#94a3b8' : '#475569'}
              fontSize="13"
              fontWeight={isCurrent ? 'bold' : 'normal'}
            >
              {node.name}
            </text>

            {/* 当前节点指示器 */}
            {isCurrent && (
              <circle cx={pos.x + NODE_W - 14} cy={pos.y + NODE_H / 2} r="5" fill={colors.border}>
                <animate attributeName="r" values="4;6;4" dur="1.5s" repeatCount="indefinite" />
              </circle>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ==================== AI 审核结果卡片 ====================

function AiReviewCard({ review }: { review: any }) {
  if (!review) return null

  const riskColors: Record<string, string> = {
    low: 'text-green-400 bg-green-500/10 border-green-500/30',
    medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    high: 'text-red-400 bg-red-500/10 border-red-500/30',
    unknown: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
  }

  const decisionColors: Record<string, string> = {
    approve: 'text-green-300',
    reject: 'text-red-300',
  }

  return (
    <div className="bg-slate-900/80 border border-slate-700 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-emerald-400">
        <span>🤖</span>
        <span>AI 风控审核结果</span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-slate-500 text-xs mb-1">决定</div>
          <div className={`font-medium ${decisionColors[review.decision] || 'text-slate-300'}`}>
            {review.decision === 'approve' ? '✅ 通过' : '❌ 拒绝'}
          </div>
        </div>
        <div>
          <div className="text-slate-500 text-xs mb-1">风险等级</div>
          <span className={`text-xs px-2 py-0.5 rounded border ${riskColors[review.riskLevel] || riskColors.unknown}`}>
            {review.riskLevel}
          </span>
        </div>
        <div>
          <div className="text-slate-500 text-xs mb-1">审核理由</div>
          <div className="text-slate-300">{review.reason}</div>
        </div>
      </div>
    </div>
  )
}

// ==================== 主页面 ====================

export default function WorkflowPage() {
  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null)
  const [instances, setInstances] = useState<WorkflowInstance[]>([])
  const [selectedInstance, setSelectedInstance] = useState<WorkflowInstance | null>(null)
  const [orderId, setOrderId] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const showMsg = (msg: string, isError = false) => {
    if (isError) {
      setError(msg)
      setMessage('')
    } else {
      setMessage(msg)
      setError('')
    }
    setTimeout(() => { setMessage(''); setError('') }, 4000)
  }

  // 加载流程定义
  const loadDefinition = useCallback(async () => {
    try {
      const res = await fetch('/api/orders/workflow')
      const data = await res.json()
      if (data.success) setDefinition(data.data)
    } catch { /* ignore */ }
  }, [])

  // 加载实例列表
  const loadInstances = useCallback(async () => {
    try {
      const res = await fetch('/api/orders/workflow?list')
      const data = await res.json()
      if (data.success) setInstances(data.data || [])
    } catch { /* ignore */ }
  }, [])

  // 加载单个实例
  const loadInstance = useCallback(async (instanceId: string) => {
    try {
      const res = await fetch(`/api/orders/workflow?instanceId=${instanceId}`)
      const data = await res.json()
      if (data.success) {
        setSelectedInstance(data.data)
        // 更新列表中对应项
        setInstances((prev) =>
          prev.map((i) => (i.id === instanceId ? data.data : i)),
        )
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    loadDefinition()
    loadInstances()
  }, [loadDefinition, loadInstances])

  // 选中实例后轮询刷新
  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    if (selectedInstance && selectedInstance.status === 'running') {
      pollingRef.current = setInterval(() => {
        loadInstance(selectedInstance.id)
      }, 3000)
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [selectedInstance?.id, selectedInstance?.status, loadInstance])

  // 启动工作流
  const startWorkflow = async () => {
    const id = parseInt(orderId)
    if (isNaN(id) || id <= 0) {
      showMsg('请输入有效的订单 ID', true)
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/orders/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: id }),
      })
      const data = await res.json()
      if (data.success) {
        showMsg(`工作流已启动: ${data.data.id}`)
        setSelectedInstance(data.data)
        await loadInstances()
      } else {
        showMsg(data.message || '启动失败', true)
        if (data.data) setSelectedInstance(data.data)
      }
    } catch (e: any) {
      showMsg(e.message, true)
    } finally {
      setLoading(false)
    }
  }

  // 发送事件
  const sendEvent = async (instanceId: string, event: string, extraData?: Record<string, unknown>) => {
    setLoading(true)
    try {
      const res = await fetch('/api/orders/workflow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId, event, data: extraData }),
      })
      const data = await res.json()
      if (data.success) {
        showMsg(`事件 "${event}" 已发送`)
        setSelectedInstance(data.data)
        await loadInstances()
      } else {
        showMsg(data.message || '发送失败', true)
      }
    } catch (e: any) {
      showMsg(e.message, true)
    } finally {
      setLoading(false)
    }
  }

  // 当前节点的可用操作
  const getAvailableActions = (instance: WorkflowInstance) => {
    if (instance.status !== 'running') return []
    const nodeId = instance.currentNodeId

    switch (nodeId) {
      case 'wait_payment':
        return [
          { label: '模拟支付完成', event: 'paid', color: 'bg-blue-600 hover:bg-blue-500' },
          { label: '超时取消', event: 'timeout', color: 'bg-slate-600 hover:bg-slate-500' },
        ]
      case 'human_review':
        return [
          { label: '人工通过', event: 'approve', color: 'bg-green-600 hover:bg-green-500' },
          { label: '人工拒绝', event: 'reject', color: 'bg-red-600 hover:bg-red-500' },
        ]
      case 'wait_receipt':
        return [
          { label: '确认签收', event: 'received', color: 'bg-green-600 hover:bg-green-500' },
        ]
      default:
        return []
    }
  }

  const statusColors: Record<string, string> = {
    running: 'text-blue-400 bg-blue-500/10',
    completed: 'text-green-400 bg-green-500/10',
    failed: 'text-red-400 bg-red-500/10',
    suspended: 'text-yellow-400 bg-yellow-500/10',
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* 头部 */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">订单工作流引擎</h1>
            <p className="text-sm text-slate-400 mt-1">
              状态机流程引擎 + AI Agent 风控审核 演示
            </p>
          </div>
          <a href="/" className="text-sm text-slate-400 hover:text-slate-200 px-3 py-1.5 border border-slate-700 rounded">
            ← 返回首页
          </a>
        </header>

        {/* 消息提示 */}
        {message && <div className="p-3 rounded bg-green-500/10 border border-green-500/30 text-green-300 text-sm">{message}</div>}
        {error && <div className="p-3 rounded bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>}

        <div className="grid lg:grid-cols-5 gap-6">
          {/* 左侧：操作面板 + 实例列表 */}
          <div className="lg:col-span-2 space-y-4">
            {/* 启动工作流 */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="text-sm font-medium text-slate-300">启动工作流</div>
              <div className="flex gap-2">
                <input
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="输入订单 ID（数字）"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  onKeyDown={(e) => e.key === 'Enter' && startWorkflow()}
                />
                <button
                  onClick={startWorkflow}
                  disabled={loading || !orderId}
                  className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm whitespace-nowrap"
                >
                  {loading ? '处理中...' : '启动'}
                </button>
              </div>
              <div className="text-xs text-slate-500">
                提示：先通过 POST /api/orders 创建订单，再用订单 ID 启动工作流
              </div>
            </div>

            {/* 实例列表 */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-slate-300">工作流实例</div>
                <button
                  onClick={loadInstances}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  刷新
                </button>
              </div>

              {instances.length === 0 ? (
                <div className="text-sm text-slate-500 py-4 text-center">暂无实例</div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-auto">
                  {instances.map((inst) => (
                    <button
                      key={inst.id}
                      onClick={() => {
                        setSelectedInstance(inst)
                        loadInstance(inst.id)
                      }}
                      className={`w-full text-left p-3 rounded border text-sm transition-colors ${
                        selectedInstance?.id === inst.id
                          ? 'border-blue-500/50 bg-blue-500/5'
                          : 'border-slate-800 hover:border-slate-700 bg-slate-950'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300 font-mono text-xs">
                          订单 #{inst.context.bizId}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded ${statusColors[inst.status] || ''}`}>
                          {inst.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        当前: {inst.currentNodeId} | {new Date(inst.updatedAt).toLocaleString('zh-CN')}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 右侧：流程图 + 详情 */}
          <div className="lg:col-span-3 space-y-4">
            {/* 流程图 */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4">
              <div className="text-sm font-medium text-slate-300 mb-3">
                {definition?.name || '流程图'} {definition?.version ? `v${definition.version}` : ''}
              </div>
              {definition ? (
                <FlowGraph
                  definition={definition}
                  currentNodeId={selectedInstance?.currentNodeId}
                  instanceStatus={selectedInstance?.status}
                  logs={selectedInstance?.logs}
                />
              ) : (
                <div className="text-slate-500 text-sm py-8 text-center">加载中...</div>
              )}
            </div>

            {/* 当前实例详情 */}
            {selectedInstance && (
              <>
                {/* 操作按钮 */}
                {(() => {
                  const actions = getAvailableActions(selectedInstance)
                  if (actions.length === 0) return null
                  return (
                    <div className="bg-slate-900/80 border border-amber-500/30 rounded-lg p-4 space-y-3">
                      <div className="text-sm font-medium text-amber-300">
                        ⏳ 等待操作 — 当前节点:「{selectedInstance.currentNodeId}」
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {actions.map((action) => (
                          <button
                            key={action.event}
                            onClick={() => sendEvent(selectedInstance.id, action.event)}
                            disabled={loading}
                            className={`px-4 py-2 rounded text-sm disabled:opacity-50 ${action.color}`}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {/* AI 审核结果 */}
                {selectedInstance.context.data.aiReview && (
                  <AiReviewCard review={selectedInstance.context.data.aiReview} />
                )}

                {/* 执行日志 */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 space-y-3">
                  <div className="text-sm font-medium text-slate-300">执行日志</div>
                  <div className="space-y-2 max-h-[400px] overflow-auto">
                    {selectedInstance.logs.length === 0 && (
                      <div className="text-slate-500 text-sm text-center py-4">暂无日志</div>
                    )}
                    {selectedInstance.logs.map((log, idx) => {
                      const statusIcons: Record<string, string> = {
                        enter: '→',
                        exit: '←',
                        error: '✗',
                        timeout: '⏰',
                      }
                      const statusTextColors: Record<string, string> = {
                        enter: 'text-blue-400',
                        exit: 'text-green-400',
                        error: 'text-red-400',
                        timeout: 'text-yellow-400',
                      }

                      return (
                        <div
                          key={idx}
                          className="flex items-start gap-3 text-xs py-2 border-b border-slate-800/50 last:border-0"
                        >
                          <span className="text-slate-600 font-mono whitespace-nowrap mt-0.5">
                            {new Date(log.timestamp).toLocaleTimeString('zh-CN')}
                          </span>
                          <span className={`${statusTextColors[log.status] || 'text-slate-400'} font-mono w-4 text-center`}>
                            {statusIcons[log.status] || '•'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 font-mono">[{log.nodeType}]</span>
                              <span className="text-slate-200">{log.nodeName}</span>
                            </div>
                            {log.message && (
                              <div className="text-slate-400 mt-0.5 break-all">{log.message}</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 上下文数据 */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 space-y-3">
                  <div className="text-sm font-medium text-slate-300">上下文数据</div>
                  <pre className="text-xs text-slate-400 bg-slate-950 border border-slate-800 rounded p-3 overflow-auto max-h-[300px]">
                    {JSON.stringify(selectedInstance.context.data, null, 2)}
                  </pre>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
