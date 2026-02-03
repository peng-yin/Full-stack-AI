/**
 * Agent 工具函数集合
 * 合并了 crypto.ts, logger.ts, constants.ts 的内容
 */
import { createHash, randomUUID } from 'crypto'

// ============== ID & Hash ==============
export const createId = (prefix = '') => {
  const id = randomUUID()
  return prefix ? `${prefix}_${id}` : id
}

export const hashText = (text: string) => createHash('sha256').update(text).digest('hex')

// ============== Logger ==============
const prefix = '[agent]'
type LogPayload = Record<string, unknown>

const format = (message: string, meta?: LogPayload) => {
  if (!meta || Object.keys(meta).length === 0) return `${prefix} ${message}`
  return `${prefix} ${message} ${JSON.stringify(meta)}`
}

export const logger = {
  info: (message: string, meta?: LogPayload) => console.log(format(message, meta)),
  warn: (message: string, meta?: LogPayload) => console.warn(format(message, meta)),
  error: (message: string, meta?: LogPayload) => console.error(format(message, meta)),
}

// ============== Constants ==============
export const AGUIEventType = {
  THINKING_TEXT_MESSAGE_START: 'THINKING_TEXT_MESSAGE_START',
  THINKING_TEXT_MESSAGE_CONTENT: 'THINKING_TEXT_MESSAGE_CONTENT',
  THINKING_TEXT_MESSAGE_END: 'THINKING_TEXT_MESSAGE_END',
  TEXT_MESSAGE_START: 'TEXT_MESSAGE_START',
  TEXT_MESSAGE_CONTENT: 'TEXT_MESSAGE_CONTENT',
  TEXT_MESSAGE_END: 'TEXT_MESSAGE_END',
  TOOL_CALL_START: 'TOOL_CALL_START',
  TOOL_CALL_ARGS: 'TOOL_CALL_ARGS',
  TOOL_CALL_END: 'TOOL_CALL_END',
  TOOL_CALL_RESULT: 'TOOL_CALL_RESULT',
  RUN_STARTED: 'RUN_STARTED',
  RUN_FINISHED: 'RUN_FINISHED',
  RUN_ERROR: 'RUN_ERROR',
} as const

export type AGUIEventType = (typeof AGUIEventType)[keyof typeof AGUIEventType]

export const formatMcpConfirmTag = ({ mcpName, mcpTools }: { mcpName: string; mcpTools: string[] }) =>
  `<mcp_call_confirm>${JSON.stringify({ mcpName, mcpTools })}</mcp_call_confirm>`

export const MCP_CONFIRM_RESP_REGEX = /<mcp_call_confirm_resp>(true|false)<\/mcp_call_confirm_resp>/i
