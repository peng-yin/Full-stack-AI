import { z } from 'zod'
import { validateToolArgs, safeExecuteTool, ToolNotFoundError } from './tool-validator'

/**
 * 工具元数据定义
 */
export interface ToolMetadata {
  /** 工具名称（唯一标识） */
  name: string
  /** 工具描述 */
  description: string
  /** 参数 Schema（Zod Schema） */
  parameters?: z.ZodTypeAny
  /** 是否需要用户确认 */
  requiresConfirmation?: boolean
  /** 工具类别（用于分组和过滤） */
  category?: 'system' | 'knowledge' | 'external' | 'dangerous'
  /** 执行函数 */
  execute: (args: any) => Promise<any>
}

/**
 * OpenAI Function Calling 工具定义
 */
export interface OpenAIToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, any>
      required?: string[]
    }
  }
}

/**
 * 工具注册表
 */
class ToolRegistry {
  private tools = new Map<string, ToolMetadata>()

  /**
   * 注册工具
   */
  register(tool: ToolMetadata): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`工具 ${tool.name} 已存在`)
    }
    this.tools.set(tool.name, tool)
  }

  /**
   * 批量注册工具
   */
  registerBatch(tools: ToolMetadata[]): void {
    tools.forEach((tool) => this.register(tool))
  }

  /**
   * 获取工具元数据
   */
  getTool(name: string): ToolMetadata | undefined {
    return this.tools.get(name)
  }

  /**
   * 列出所有工具名称
   */
  listToolNames(): string[] {
    return Array.from(this.tools.keys())
  }

  /**
   * 按类别过滤工具
   */
  getToolsByCategory(category: string): ToolMetadata[] {
    return Array.from(this.tools.values()).filter((tool) => tool.category === category)
  }

  /**
   * 转换为 OpenAI Function Calling 格式
   */
  toOpenAITools(): OpenAIToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters ? zodToJsonSchema(tool.parameters) : { type: 'object', properties: {} },
      },
    }))
  }

  /**
   * 执行工具调用（带验证和错误处理）
   */
  async execute(name: string, args: any): Promise<any> {
    const tool = this.tools.get(name)
    if (!tool) {
      throw new ToolNotFoundError(name)
    }

    // 参数验证
    validateToolArgs(name, tool.parameters, args)

    // 安全执行
    return safeExecuteTool(name, tool.execute, args)
  }

  /**
   * 检查工具是否需要确认
   */
  requiresConfirmation(name: string): boolean {
    const tool = this.tools.get(name)
    return tool?.requiresConfirmation ?? false
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear()
  }
}

/**
 * 将 Zod Schema 转换为 JSON Schema
 */
function zodToJsonSchema(schema: z.ZodTypeAny): any {
  const schemaType = schema._def.typeName

  switch (schemaType) {
    case 'ZodObject': {
      const shape = (schema as z.ZodObject<any>).shape
      const properties: Record<string, any> = {}
      const required: string[] = []

      Object.entries(shape).forEach(([key, value]) => {
        properties[key] = zodToJsonSchema(value as z.ZodTypeAny)
        if (!(value as any).isOptional()) {
          required.push(key)
        }
      })

      return {
        type: 'object',
        properties,
        ...(required.length > 0 && { required }),
      }
    }

    case 'ZodString':
      return { type: 'string', description: (schema as any)._def.description }

    case 'ZodNumber':
      return { type: 'number', description: (schema as any)._def.description }

    case 'ZodBoolean':
      return { type: 'boolean', description: (schema as any)._def.description }

    case 'ZodArray':
      return {
        type: 'array',
        items: zodToJsonSchema((schema as z.ZodArray<any>).element),
      }

    case 'ZodOptional':
      return zodToJsonSchema((schema as z.ZodOptional<any>).unwrap())

    case 'ZodEnum':
      return {
        type: 'string',
        enum: (schema as z.ZodEnum<any>).options,
      }

    default:
      return { type: 'string' }
  }
}

/**
 * 全局工具注册表实例
 */
export const toolRegistry = new ToolRegistry()
