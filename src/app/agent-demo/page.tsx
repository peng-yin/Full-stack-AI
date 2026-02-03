'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

interface StreamEvent {
  type?: string
  delta?: string
  rawEvent?: Record<string, unknown>
  toolCallName?: string
}

const parseConversationId = () => `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const parseEventChunks = (text: string) => {
  const events: string[] = []
  const parts = text.split('\n\n')
  for (const part of parts) {
    const line = part.trim()
    if (!line.startsWith('data:')) continue
    events.push(line.slice('data:'.length).trim())
  }
  return events
}

const tryParseJson = (s: string) => {
  try {
    return JSON.parse(s)
  } catch (e) {
    return null
  }
}

export default function AgentDemoPage() {
  const [input, setInput] = useState('你有哪些工具？请调用 ping 工具测试一下')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [output, setOutput] = useState('')
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  const [ragSourceId, setRagSourceId] = useState('doc-1')
  const [ragTitle, setRagTitle] = useState('示例文档')
  const [ragContent, setRagContent] = useState('本公司请假需提前3天申请')
  const [ragQuery, setRagQuery] = useState('请假需要提前多久')
  const [ragResults, setRagResults] = useState<Array<{ id: string; score: number; title?: string; content: string }>>([])
  const [ragStatus, setRagStatus] = useState('')

  const [mcpTools, setMcpTools] = useState<string[]>([])
  const [mcpStatus, setMcpStatus] = useState('')

  const addLog = (line: string) => setLogs((prev) => [line, ...prev].slice(0, 200))

  const reset = () => {
    setOutput('')
    setLogs([])
    setPendingConfirm(null)
  }

  useEffect(() => {
    if (!conversationId) {
      setConversationId(parseConversationId())
    }
    return () => {
      controllerRef.current?.abort()
    }
  }, [conversationId])

  useEffect(() => {
    const loadMcpTools = async () => {
      try {
        const res = await fetch('/api/ai/agent')
        const data = await res.json()
        if (data?.success) {
          const tools = Array.isArray(data.data) ? data.data : []
          setMcpTools(tools)
          setMcpStatus(`已加载 ${tools.length} 个工具`)
        } else {
          setMcpStatus(data?.message || '工具加载失败')
        }
      } catch (error) {
        setMcpStatus('工具加载失败')
      }
    }

    loadMcpTools()
  }, [])

  const upsertRag = async () => {
    setRagStatus('')
    try {
      const res = await fetch('/api/ai/kb/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: ragSourceId, title: ragTitle, content: ragContent }),
      })
      const data = await res.json()
      if (data?.success) {
        setRagStatus(`写入成功，chunks: ${data.data?.chunkCount ?? 0}`)
      } else {
        setRagStatus(data?.message || '写入失败')
      }
    } catch (error) {
      setRagStatus('写入失败')
    }
  }

  const searchRag = async () => {
    setRagStatus('')
    try {
      const res = await fetch('/api/ai/kb/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ragQuery, topK: 4 }),
      })
      const data = await res.json()
      if (data?.success) {
        const list = Array.isArray(data.data) ? data.data : []
        setRagResults(list)
        setRagStatus(`检索完成，命中 ${list.length} 条`)
      } else {
        setRagStatus(data?.message || '检索失败')
      }
    } catch (error) {
      setRagStatus('检索失败')
    }
  }

  const consumeStream = async (resp: Response) => {
    const reader = resp.body?.getReader()
    if (!reader) return
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = parseEventChunks(buffer)

      // 保留未完成的尾部
      const lastDoubleNewline = buffer.lastIndexOf('\n\n')
      if (lastDoubleNewline >= 0) {
        buffer = buffer.slice(lastDoubleNewline + 2)
      }

      for (const evt of events) {
        if (evt === '[DONE]') {
          addLog('🏁 [DONE]')
          setStreaming(false)
          controllerRef.current = null
          return
        }

        const json = tryParseJson(evt)
        if (!json) {
          addLog(`raw: ${evt}`)
          continue
        }

        const event = json as StreamEvent
        switch (event.type) {
          case 'RUN_STARTED':
            addLog('🚀 会话开始')
            break
          case 'RUN_FINISHED':
            addLog('✅ 会话结束')
            break
          case 'RUN_ERROR':
            addLog(`❌ 错误: ${event.delta ?? ''}`)
            break
          case 'TEXT_MESSAGE_CONTENT': {
            const delta = event.delta ?? ''
            setOutput((prev) => prev + delta)
            addLog(`💬 ${delta}`)
            if (delta.includes('<mcp_call_confirm>')) {
              setPendingConfirm(delta)
              addLog('⚠️ MCP 调用等待确认')
            }
            break
          }
          case 'TOOL_CALL_START':
            addLog(`🛠️ 工具开始: ${event.toolCallName}`)
            break
          case 'TOOL_CALL_ARGS':
            addLog(`➡️ 入参(${event.toolCallName}): ${event.delta ?? ''}`)
            break
          case 'TOOL_CALL_RESULT':
            addLog(`⬅️ 结果(${event.toolCallName}): ${event.delta ?? ''}`)
            break
          default:
            addLog(`raw: ${evt}`)
        }
      }
    }
  }

  const sendMessage = async (message: string) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setStreaming(true)
    setPendingConfirm(null)
    setOutput('')

    const currentConversationId = conversationId ?? parseConversationId()
    if (!conversationId) {
      setConversationId(currentConversationId)
    }

    const resp = await fetch('/api/ai/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { message, conversation_id: currentConversationId } }),
      signal: controller.signal,
    })

    if (!resp.ok || !resp.body) {
      setStreaming(false)
      addLog(`❌ 请求失败: ${resp.status}`)
      return
    }

    addLog('📡 流式连接已建立')
    await consumeStream(resp)
  }

  const confirmMcp = async (accepted: boolean) => {
    const confirmText = `<mcp_call_confirm_resp>${accepted}</mcp_call_confirm_resp>`
    setPendingConfirm(null)
    await sendMessage(confirmText)
  }

  const newConversation = () => {
    controllerRef.current?.abort()
    setConversationId(parseConversationId())
    reset()
  }

  const disableSend = !input.trim() || streaming || !conversationId

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Agent Demo</h1>
            <p className="text-sm text-slate-400">SSE 流式对话 + MCP 确认示例</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <span
              className="px-2 py-1 bg-slate-800 rounded border border-slate-700"
              suppressHydrationWarning
            >
              {conversationId ?? '生成中...'}
            </span>
            <button
              onClick={newConversation}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs"
            >
              新会话
            </button>
          </div>
        </header>

        <section className="grid lg:grid-cols-3 gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="text-sm text-slate-400">RAG 写入</div>
            <div className="space-y-2">
              <input
                value={ragSourceId}
                onChange={(e) => setRagSourceId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm"
                placeholder="sourceId"
              />
              <input
                value={ragTitle}
                onChange={(e) => setRagTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm"
                placeholder="title"
              />
              <textarea
                value={ragContent}
                onChange={(e) => setRagContent(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm min-h-[96px]"
                placeholder="content"
              />
              <button
                onClick={upsertRag}
                className="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm"
              >
                写入文档
              </button>
              {ragStatus && <div className="text-xs text-slate-300">{ragStatus}</div>}
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="text-sm text-slate-400">RAG 检索</div>
            <div className="space-y-2">
              <input
                value={ragQuery}
                onChange={(e) => setRagQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm"
                placeholder="query"
              />
              <button
                onClick={searchRag}
                className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-sm"
              >
                开始检索
              </button>
              <div className="text-xs text-slate-300">{ragResults.length ? `结果 ${ragResults.length} 条` : '暂无结果'}</div>
              <div className="space-y-2 max-h-[180px] overflow-auto">
                {ragResults.map((item) => (
                  <div key={item.id} className="text-xs bg-slate-950 border border-slate-800 rounded p-2">
                    <div className="text-slate-300">{item.title || '未命名'}</div>
                    <div className="text-slate-500">score: {item.score?.toFixed?.(4) ?? item.score}</div>
                    <div className="text-slate-200 mt-1 whitespace-pre-wrap">{item.content}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="text-sm text-slate-400">MCP 工具</div>
            <div className="text-xs text-slate-300">{mcpStatus || '加载中...'}</div>
            <div className="flex flex-wrap gap-2">
              {mcpTools.length === 0 && <span className="text-xs text-slate-500">暂无工具</span>}
              {mcpTools.map((tool) => (
                <span key={tool} className="text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded">
                  {tool}
                </span>
              ))}
            </div>
            <div className="text-xs text-slate-400">提示：可输入"调用ping工具"、"现在几点"、"计算 123*456"、"搜索知识库中的请假规定"等触发工具调用。</div>
          </div>
        </section>

        <section className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入你的问题或指令"
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 min-h-[80px]"
            />
            <div className="flex flex-col gap-2">
              <button
                onClick={() => sendMessage(input)}
                disabled={disableSend}
                className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm"
              >
                {streaming ? '流中...' : '发送'}
              </button>
              <button
                onClick={() => controllerRef.current?.abort()}
                disabled={!streaming}
                className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-sm border border-slate-700"
              >
                停止
              </button>
            </div>
          </div>

          {pendingConfirm && (
            <div className="p-3 rounded border border-amber-500/60 bg-amber-500/10 text-sm flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-amber-200">检测到 MCP 调用需要确认</div>
                <div className="text-amber-100/80 break-all text-xs mt-1">{pendingConfirm}</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => confirmMcp(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs"
                >
                  拒绝
                </button>
                <button
                  onClick={() => confirmMcp(true)}
                  className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 text-xs"
                >
                  同意执行
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="grid md:grid-cols-2 gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-sm text-slate-400">
              <span>对话输出</span>
              {streaming && <span className="text-emerald-400">● streaming</span>}
            </div>
            <div className="min-h-[200px] whitespace-pre-wrap text-sm bg-slate-950 border border-slate-800 rounded p-3">
              {output || '等待响应...'}
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-sm text-slate-400">
              <span>事件日志</span>
              <button
                onClick={() => setLogs([])}
                className="text-xs text-slate-300 hover:text-white"
              >
                清空
              </button>
            </div>
            <div className="min-h-[200px] max-h-[320px] overflow-auto text-xs space-y-1 font-mono leading-relaxed">
              {logs.length === 0 && <div className="text-slate-600">等待事件...</div>}
              {logs.map((l, idx) => (
                <div key={idx} className="text-slate-200">
                  {l}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
