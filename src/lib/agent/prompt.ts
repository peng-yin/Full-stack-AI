import { agentConfig } from './config'
import { RagChunk } from './types'
import { getToolRegistry } from './mcp'

export const buildSystemPrompt = ({ summary, ragChunks }: { summary?: string; ragChunks?: RagChunk[] }) => {
  const parts: string[] = []
  parts.push('你是企业级AI助手，输出内容必须使用中文。')
  parts.push('你需要在必要时调用工具，不要编造事实。')

  // 动态生成工具列表
  const registry = getToolRegistry()
  const tools = registry.toOpenAITools()

  if (tools.length > 0) {
    parts.push('当前可用的工具包括:')
    tools.forEach((tool) => {
      const { name, description, parameters } = tool.function
      const requiredParams = parameters.required || []
      const paramsList = Object.entries(parameters.properties || {})
        .map(([key, value]: [string, any]) => {
          const required = requiredParams.includes(key) ? '必填' : '可选'
          return `  - ${key} (${required}): ${value.description || value.type}`
        })
        .join('\n')

      parts.push(`\n【${name}】\n${description}${paramsList ? `\n参数:\n${paramsList}` : '\n无需参数'}`)
    })
  }

  if (summary) {
    parts.push(`\n会话记忆：\n${summary}`)
  }

  if (agentConfig.ragEnabled && ragChunks?.length) {
    const formatted = ragChunks
      .map((chunk, idx) => `【${idx + 1}】相关度: ${chunk.score?.toFixed(3)} | ${chunk.title || '未命名'}\n${chunk.content}`)
      .join('\n\n')
    parts.push(`\n知识库检索结果（按相关度排序）：\n${formatted}`)
  }

  return parts.join('\n')
}
