import { agentConfig } from './config'
import { AGUIEventType, MCP_CONFIRM_RESP_REGEX, formatMcpConfirmTag, createId, logger } from './utils'
import { appendAndMaybeSummarize, getMessages, getSummary } from './memory'
import { executeTool, listTools, requestToolCall, getPendingCall, clearPendingCall, getToolRegistry } from './mcp'
import { search as ragSearch } from './rag'
import { openaiClient } from './core'
import { buildSystemPrompt } from './prompt'
import { sendDone, sendEvent, startHeartbeat, SseController } from './sse'
import { AgentInput, CompletionMessage, ToolCall } from './types'

/**
 * 动态生成工具定义
 */
const getToolDefinitions = () => {
  const registry = getToolRegistry()
  return registry.toOpenAITools()
}

const parseToolArguments = (argsText?: string) => {
  if (!argsText) return {}
  try {
    return JSON.parse(argsText)
  } catch (error) {
    return {}
  }
}

const shouldForceToolChoice = (text: string) => /使用工具|调用工具|搜索|检索/.test(text)

/**
 * 获取工具选择配置
 * - 如果用户明确要求使用工具，强制选择第一个工具
 * - 否则让 LLM 自动判断
 */
const getToolChoice = (userMessage: string) => {
  if (shouldForceToolChoice(userMessage)) {
    const tools = getToolDefinitions()
    return tools.length > 0 ? { type: 'function', function: { name: tools[0].function.name } } : 'auto'
  }
  return 'auto'
}

const buildMessages = async ({ conversationId, userMessage, topK }: { conversationId: string; userMessage: string; topK?: number }) => {
  const summary = await getSummary(conversationId)
  const history = await getMessages(conversationId)
  const ragChunks = agentConfig.ragEnabled ? await ragSearch({ query: userMessage, topK }) : []

  const systemPrompt = buildSystemPrompt({ summary, ragChunks })
  const messages: CompletionMessage[] = [{ role: 'system', content: systemPrompt }]

  history.slice(-agentConfig.memoryMaxMessages).forEach((msg) => {
    messages.push(msg)
  })

  messages.push({ role: 'user', content: userMessage })
  return { messages, ragChunks }
}

const handleMcpConfirmMessage = async ({
  conversationId,
  userMessage,
  controller,
}: {
  conversationId: string
  userMessage: string
  controller: SseController
}) => {
  const match = userMessage.match(MCP_CONFIRM_RESP_REGEX)
  if (!match) return false

  const confirm = match[1] === 'true'
  const pending = await getPendingCall(conversationId)

  if (!pending) {
    sendEvent(controller, {
      type: AGUIEventType.TEXT_MESSAGE_CONTENT,
      delta: '没有待确认的工具调用。',
    })
    return true
  }

  if (!confirm) {
    await clearPendingCall(conversationId)
    sendEvent(controller, {
      type: AGUIEventType.TEXT_MESSAGE_CONTENT,
      delta: '已拒绝工具调用。',
    })
    return true
  }

  sendEvent(controller, { type: AGUIEventType.TOOL_CALL_START, toolCallName: pending.toolName })
  sendEvent(controller, {
    type: AGUIEventType.TOOL_CALL_ARGS,
    toolCallName: pending.toolName,
    delta: JSON.stringify(pending.args || {}),
  })

  const result = await executeTool({ toolName: pending.toolName, args: pending.args })
  await clearPendingCall(conversationId)

  sendEvent(controller, {
    type: AGUIEventType.TOOL_CALL_RESULT,
    toolCallName: pending.toolName,
    content: JSON.stringify(result),
  })

  const followUpMessage = `已执行工具 ${pending.toolName}，结果如下：${JSON.stringify(result)}`
  const { messages } = await buildMessages({ conversationId, userMessage: followUpMessage })
  await streamCompletion({ controller, messages, conversationId })
  return true
}

const streamCompletion = async ({
  controller,
  messages,
  conversationId,
  userMessage,
}: {
  controller: SseController
  messages: CompletionMessage[]
  conversationId: string
  userMessage?: string
}) => {
  let loopCount = 0
  const maxLoops = 5

  while (loopCount < maxLoops) {
    loopCount += 1
    const isLastLoop = loopCount >= maxLoops

    // 转换消息格式为 OpenRouter SDK 兼容格式
    const sdkMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content || '',
      ...(msg.tool_call_id && { toolCallId: msg.tool_call_id }),
      ...(msg.tool_calls && { toolCalls: msg.tool_calls }),
    }))

    const toolChoice = userMessage ? getToolChoice(userMessage) : 'auto'
    const toolDefinitions = getToolDefinitions()

    const stream = await openaiClient.chat.send({
      model: agentConfig.llmModel,
      messages: sdkMessages as any,
      tools: toolDefinitions as any,
      toolChoice,
      temperature: 0.6,
      stream: true,
    })

    let assistantContent = ''
    const toolCalls = new Map<number, ToolCall>()

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta
      if (!delta) continue

      if (delta.content) {
        assistantContent += delta.content
        sendEvent(controller, {
          type: AGUIEventType.TEXT_MESSAGE_CONTENT,
          delta: delta.content,
        })
      }

      // OpenRouter SDK 使用 toolCalls (驼峰) 而不是 tool_calls
      const streamToolCalls = (delta as any).toolCalls || (delta as any).tool_calls
      if (streamToolCalls) {
        streamToolCalls.forEach((toolCall: any) => {
          const index = toolCall.index
          const existing = toolCalls.get(index) || {
            id: toolCall.id || '',
            type: 'function' as const,
            function: { name: toolCall.function?.name || '', arguments: '' },
          }

          if (toolCall.function?.name && !existing.function.name) {
            existing.function.name = toolCall.function.name
          }

          if (toolCall.function?.arguments) {
            existing.function.arguments += toolCall.function.arguments
            sendEvent(controller, {
              type: AGUIEventType.TOOL_CALL_ARGS,
              toolCallName: existing.function.name,
              delta: toolCall.function.arguments,
            })
          }

          if (!toolCalls.has(index)) {
            sendEvent(controller, {
              type: AGUIEventType.TOOL_CALL_START,
              toolCallName: existing.function.name,
            })
          }

          toolCalls.set(index, existing)
        })
      }
    }

    // 无工具调用，直接返回
    if (toolCalls.size === 0) {
      if (assistantContent) {
        await appendAndMaybeSummarize(conversationId, { role: 'assistant', content: assistantContent })
      }
      return
    }

    const toolCallArray = Array.from(toolCalls.values())
    messages.push({
      role: 'assistant',
      content: assistantContent || null,
      tool_calls: toolCallArray,
    })

    // 处理工具调用
    let needsContinue = false
    for (const call of toolCallArray) {
      const toolName = call.function?.name
      const args = parseToolArguments(call.function?.arguments)

      logger.info('工具调用', { toolName, args })

      const toolResult = await requestToolCall({
        conversationId,
        toolName: toolName || '',
        args,
      })

      if (toolResult.confirmRequired) {
        const confirmTag = formatMcpConfirmTag({
          mcpName: '内置工具',
          mcpTools: [toolName || ''],
        })
        sendEvent(controller, { type: AGUIEventType.TEXT_MESSAGE_CONTENT, delta: confirmTag })
        await appendAndMaybeSummarize(conversationId, {
          role: 'assistant',
          content: `${assistantContent}${confirmTag}`,
        })
        return
      }

      sendEvent(controller, {
        type: AGUIEventType.TOOL_CALL_RESULT,
        toolCallName: toolName,
        content: JSON.stringify(toolResult.result),
      })

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(toolResult.result),
      })
      needsContinue = true
    }

    // 如果已达最大循环次数，终止
    if (isLastLoop && needsContinue) {
      logger.warn('达到最大循环次数，强制终止', { loopCount })
      sendEvent(controller, {
        type: AGUIEventType.TEXT_MESSAGE_CONTENT,
        delta: '\n\n[系统提示: 达到最大工具调用次数，请简化问题]',
      })
      return
    }

    // 不需要继续，退出循环
    if (!needsContinue) {
      return
    }
  }
}

export const streamAgentResponse = async (input: AgentInput) => {
  const conversationId = input.conversation_id || createId('conv')
  const userMessage = input.message || ''
  const topK = input.top_k

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const stopHeartbeat = startHeartbeat(controller, agentConfig.sseHeartbeatMs)

      sendEvent(controller, {
        type: AGUIEventType.RUN_STARTED,
        rawEvent: { conversation_id: conversationId },
      })

      try {
        await appendAndMaybeSummarize(conversationId, { role: 'user', content: userMessage })

        const handledConfirm = await handleMcpConfirmMessage({ conversationId, userMessage, controller })
        if (!handledConfirm) {
          const { messages } = await buildMessages({ conversationId, userMessage, topK })
          await streamCompletion({ controller, messages, conversationId, userMessage })
        }

        sendEvent(controller, { type: AGUIEventType.RUN_FINISHED, rawEvent: { conversation_id: conversationId } })
      } catch (error: any) {
        logger.error('Agent stream failed', { error })
        console.error('[Agent] 详细错误:', error?.message || error, error?.stack)
        sendEvent(controller, {
          type: AGUIEventType.RUN_ERROR,
          rawEvent: { conversation_id: conversationId },
          delta: `服务异常，请稍后重试。错误: ${error?.message || '未知错误'}`,
        })
      } finally {
        sendDone(controller)
        stopHeartbeat()
        controller.close()
      }
    },
  })

  return stream
}

export const getMcpTools = () => listTools()
