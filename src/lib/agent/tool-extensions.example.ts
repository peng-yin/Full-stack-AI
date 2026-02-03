/**
 * 工具扩展示例
 * 
 * 展示如何动态注册自定义工具
 */

import { z } from 'zod'
import { getToolRegistry } from './mcp'

/**
 * 示例：注册天气查询工具
 */
export function registerWeatherTool() {
  const registry = getToolRegistry()

  registry.register({
    name: 'get_weather',
    description: '查询指定城市的天气信息',
    category: 'external',
    requiresConfirmation: false,
    parameters: z.object({
      city: z.string().describe('城市名称，例如: 北京'),
      unit: z.enum(['celsius', 'fahrenheit']).optional().describe('温度单位，默认摄氏度'),
    }),
    execute: async ({ city, unit = 'celsius' }) => {
      // 实际应用中应调用天气 API
      return {
        success: true,
        data: {
          city,
          temperature: 25,
          unit,
          condition: '晴朗',
          humidity: '60%',
        },
      }
    },
  })
}

/**
 * 示例：注册数据库查询工具
 */
export function registerDatabaseTools() {
  const registry = getToolRegistry()

  registry.register({
    name: 'query_database',
    description: '执行 SQL 查询语句（只读操作）',
    category: 'external',
    requiresConfirmation: true, // 数据库操作需要确认
    parameters: z.object({
      sql: z.string().describe('SQL 查询语句'),
      limit: z.number().int().positive().max(1000).optional().describe('返回结果数量限制'),
    }),
    execute: async ({ sql, limit = 100 }) => {
      // 实际应用中应连接数据库
      return {
        success: true,
        data: {
          rows: [],
          count: 0,
          sql,
          limit,
        },
      }
    },
  })
}

/**
 * 示例：注册第三方 MCP Server 工具
 */
export function registerExternalMCPTools() {
  const registry = getToolRegistry()

  // 假设从 MCP Server 获取工具列表
  const mcpTools = [
    {
      name: 'brave_search',
      description: '使用 Brave 搜索引擎进行网页搜索',
      parameters: z.object({
        query: z.string().describe('搜索查询'),
        count: z.number().int().positive().max(20).optional(),
      }),
    },
  ]

  mcpTools.forEach((tool) => {
    registry.register({
      name: tool.name,
      description: tool.description,
      category: 'external',
      requiresConfirmation: false,
      parameters: tool.parameters,
      execute: async (_args) => {
        // 转发到 MCP Server
        return {
          success: true,
          data: { message: '示例：调用外部 MCP Server' },
        }
      },
    })
  })
}
