import { z } from 'zod'
import { agentConfig } from './config'
import { createId } from './utils'
import { redis, withPrefix } from './core'
import { search as ragSearch } from './rag'
import { toolRegistry } from './tool-registry'

const pendingKey = (conversationId: string) => withPrefix(`mcp:${conversationId}:pending`)

/**
 * 注册内置工具
 */
function registerBuiltinTools() {
  // ping - 测试连接
  toolRegistry.register({
    name: 'ping',
    description: '测试工具连接，返回 pong 和当前时间戳',
    category: 'system',
    requiresConfirmation: false,
    execute: async () => ({
      success: true,
      message: 'pong',
      timestamp: new Date().toISOString(),
    }),
  })

  // get_current_time - 获取当前时间
  toolRegistry.register({
    name: 'get_current_time',
    description: '获取当前系统时间，包含 ISO 时间戳、日期和时间',
    category: 'system',
    requiresConfirmation: false,
    execute: async () => {
      const now = new Date()
      return {
        success: true,
        data: {
          timestamp: now.toISOString(),
          date: now.toLocaleDateString('zh-CN'),
          time: now.toLocaleTimeString('zh-CN'),
        },
      }
    },
  })

  // search_docs - 搜索知识库
  toolRegistry.register({
    name: 'search_docs',
    description: '在知识库中进行语义检索，返回最相关的文档片段',
    category: 'knowledge',
    requiresConfirmation: false,
    parameters: z.object({
      query: z.string().describe('搜索查询文本'),
      topK: z.number().int().positive().optional().describe('返回结果数量，默认为系统配置值'),
    }),
    execute: async ({ query, topK }: { query: string; topK?: number }) => {
      const results = await ragSearch({ query, topK })
      return {
        success: true,
        data: results.map((item) => ({
          id: item.id,
          score: item.score,
          title: (item as any).title,
          content: item.content,
          metadata: (item as any).metadata,
        })),
      }
    },
  })

  // calculate - 数学计算
  toolRegistry.register({
    name: 'calculate',
    description: '执行数学表达式计算，支持基本运算符 (+, -, *, /, 括号)',
    category: 'system',
    requiresConfirmation: false,
    parameters: z.object({
      expression: z.string().describe('数学表达式，例如: "123 * 456"'),
    }),
    execute: async ({ expression }: { expression: string }) => {
      try {
        const sanitized = expression.replace(/[^0-9+\-*/().]/g, '')
        if (!sanitized) {
          return { success: false, message: '无效的表达式' }
        }
        // eslint-disable-next-line no-eval
        const result = eval(sanitized)
        return {
          success: true,
          data: {
            expression: sanitized,
            result,
          },
        }
      } catch (error: any) {
        return {
          success: false,
          message: `计算错误: ${error.message}`,
        }
      }
    },
  })

  // delete_file - 删除文件（示例危险操作）
  toolRegistry.register({
    name: 'delete_file',
    description: '删除指定路径的文件（危险操作，需要用户确认）',
    category: 'dangerous',
    requiresConfirmation: true,
    parameters: z.object({
      path: z.string().describe('文件路径'),
    }),
    execute: async ({ path }: { path: string }) => {
      // 这里只是示例，实际不会真的删除文件
      return {
        success: true,
        message: `文件 ${path} 已删除（示例）`,
      }
    },
  })
}

// 初始化内置工具
registerBuiltinTools()

export const listTools = () => toolRegistry.listToolNames()

const createPendingCall = async ({ conversationId, toolName, args }: { conversationId: string; toolName: string; args: any }) => {
  const payload = {
    id: createId('mcp'),
    toolName,
    args,
    createdAt: new Date().toISOString(),
  }
  await redis.set(pendingKey(conversationId), JSON.stringify(payload))
  return payload
}

export const getPendingCall = async (conversationId: string) => {
  const raw = await redis.get(pendingKey(conversationId))
  return raw ? JSON.parse(raw) : null
}

export const clearPendingCall = async (conversationId: string) => {
  await redis.del(pendingKey(conversationId))
}

export const executeTool = async ({ toolName, args }: { toolName: string; args: any }) => {
  try {
    return await toolRegistry.execute(toolName, args || {})
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

export const requestToolCall = async ({
  conversationId,
  toolName,
  args,
}: {
  conversationId: string
  toolName: string
  args: any
}) => {
  const tool = toolRegistry.getTool(toolName)

  if (!tool) {
    return {
      confirmRequired: false,
      result: { success: false, message: `未知工具: ${toolName}` },
    }
  }

  // 判断是否需要确认
  const needsConfirmation = toolRegistry.requiresConfirmation(toolName) && agentConfig.mcpConfirmRequired

  if (!needsConfirmation) {
    // 直接执行，不需要确认
    const result = await executeTool({ toolName, args })
    return { confirmRequired: false, result }
  }

  // 需要确认，创建待确认调用
  const pending = await createPendingCall({ conversationId, toolName, args })
  return { confirmRequired: true, pending }
}

/**
 * 获取工具注册表（用于动态扩展）
 */
export const getToolRegistry = () => toolRegistry
