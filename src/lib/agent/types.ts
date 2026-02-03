export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface CompletionMessage {
  role: Role
  content: string | null
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

export interface AgentInput {
  conversation_id?: string
  message: string
  top_k?: number
}

export interface RagChunk {
  id: string
  score: number
  title?: string
  content: string
  metadata?: Record<string, unknown>
}
