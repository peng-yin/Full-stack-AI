import { agentConfig } from './config'
import { logger } from './utils'
import { openaiClient, redis, withPrefix } from './core'
import { CompletionMessage } from './types'

const memoryKey = (conversationId: string) => withPrefix(`memory:${conversationId}:messages`)
const summaryKey = (conversationId: string) => withPrefix(`memory:${conversationId}:summary`)
const summaryHistoryKey = (conversationId: string) => withPrefix(`memory:${conversationId}:summary-history`)

/**
 * 估算消息的 token 数量（粗略估算）
 */
const estimateTokens = (message: CompletionMessage): number => {
  const content = message.content || ''
  // 中文字符约 1.5 tokens，英文单词约 1.3 tokens
  const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length
  const englishWords = content.split(/\s+/).length
  return Math.ceil(chineseChars * 1.5 + englishWords * 1.3)
}

/**
 * 计算消息列表的总 token 数
 */
const getTotalTokens = (messages: CompletionMessage[]): number => {
  return messages.reduce((sum, msg) => sum + estimateTokens(msg), 0)
}

export const getMessages = async (conversationId: string): Promise<CompletionMessage[]> => {
  const raw = await redis.lrange(memoryKey(conversationId), 0, -1)
  return raw.map((item) => JSON.parse(item))
}

const addMessage = async (conversationId: string, message: CompletionMessage) => {
  const key = memoryKey(conversationId)
  await redis.rpush(key, JSON.stringify(message))
  // 保留最近消息
  await redis.ltrim(key, -agentConfig.memoryMaxMessages, -1)
}

/**
 * 判断是否需要摘要（基于消息数量和 token 限制）
 */
const shouldSummarize = (messages: CompletionMessage[]) => {
  if (messages.length < agentConfig.memorySummaryEvery) return false

  // 检查 token 数量（防止超过上下文窗口）
  const totalTokens = getTotalTokens(messages)
  return totalTokens > agentConfig.memorySummaryMaxTokens
}

/**
 * 获取会话摘要（合并历史摘要）
 */
export const getSummary = async (conversationId: string): Promise<string> => {
  const currentSummary = await redis.get(summaryKey(conversationId))
  if (!currentSummary) return ''

  // 获取历史摘要
  const history = await redis.lrange(summaryHistoryKey(conversationId), 0, -1)
  if (history.length === 0) return currentSummary

  // 合并历史摘要
  return `【历史摘要】\n${history.join('\n\n')}\n\n【最近摘要】\n${currentSummary}`
}

const summarizeMessages = async (conversationId: string, messages: CompletionMessage[]) => {
  if (!messages.length) return ''

  // 获取旧摘要
  const oldSummary = await redis.get(summaryKey(conversationId))

  const prompt = oldSummary
    ? `已有摘要：${oldSummary}\n\n请结合以下新对话，用中文生成更新后的摘要（限制200字）：\n${messages
        .map((msg) => `${msg.role}: ${msg.content || ''}`)
        .join('\n')}`
    : `请用中文总结以下对话（限制200字），保留关键决策、约束和上下文：\n${messages
        .map((msg) => `${msg.role}: ${msg.content || ''}`)
        .join('\n')}`

  const completion = await openaiClient.chat.send({
    model: agentConfig.llmModel,
    messages: [{ role: 'user', content: prompt }] as any,
    temperature: 0.2,
    stream: false,
  })

  const summary = (completion.choices?.[0]?.message?.content as string) || ''

  // 保存旧摘要到历史
  if (oldSummary) {
    await redis.rpush(summaryHistoryKey(conversationId), oldSummary)
    await redis.ltrim(summaryHistoryKey(conversationId), -3, -1) // 只保留最近 3 个历史摘要
  }

  // 更新当前摘要
  await redis.set(summaryKey(conversationId), summary)

  // 不删除消息，改为保留最近 N 条
  const key = memoryKey(conversationId)
  await redis.ltrim(key, -agentConfig.memoryKeepRecentCount, -1)

  logger.info('会话已摘要', {
    conversationId,
    messageCount: messages.length,
    totalTokens: getTotalTokens(messages),
  })
  return summary
}

export const appendAndMaybeSummarize = async (conversationId: string, message: CompletionMessage) => {
  await addMessage(conversationId, message)
  const messages = await getMessages(conversationId)
  if (shouldSummarize(messages)) {
    await summarizeMessages(conversationId, messages)
  }
  return messages
}
