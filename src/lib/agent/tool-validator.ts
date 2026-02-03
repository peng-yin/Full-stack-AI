import { z } from 'zod'

/**
 * 工具调用错误类型
 */
export class ToolExecutionError extends Error {
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'ToolExecutionError'
  }
}

export class ToolNotFoundError extends ToolExecutionError {
  constructor(toolName: string) {
    super(`工具 ${toolName} 不存在`, toolName)
    this.name = 'ToolNotFoundError'
  }
}

export class ToolValidationError extends ToolExecutionError {
  constructor(toolName: string, message: string, cause?: Error) {
    super(`工具 ${toolName} 参数验证失败: ${message}`, toolName, cause)
    this.name = 'ToolValidationError'
  }
}

/**
 * 验证工具参数
 */
export function validateToolArgs(toolName: string, schema: z.ZodTypeAny | undefined, args: any): void {
  if (!schema) return

  try {
    schema.parse(args)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join(', ')
      throw new ToolValidationError(toolName, messages, error)
    }
    throw new ToolValidationError(toolName, '参数格式错误', error as Error)
  }
}

/**
 * 包装工具执行，统一错误处理
 */
export async function safeExecuteTool(
  toolName: string,
  execute: (args: any) => Promise<any>,
  args: any
): Promise<{ success: boolean; data?: any; message?: string }> {
  try {
    const result = await execute(args)
    return result
  } catch (error) {
    if (error instanceof ToolExecutionError) {
      return {
        success: false,
        message: error.message,
      }
    }
    return {
      success: false,
      message: `工具 ${toolName} 执行失败: ${(error as Error).message}`,
    }
  }
}
