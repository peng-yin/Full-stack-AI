/**
 * Agent 核心模块
 * 合并了 openai.ts, redis.ts, schema.ts 的内容
 */
import { OpenRouter } from '@openrouter/sdk'
import Redis from 'ioredis'
import { agentConfig } from './config'
import { z } from 'zod'

// ============== OpenAI Client ==============
if (!agentConfig.openrouterApiKey) {
  console.warn('[agent] OPENROUTER_API_KEY 未配置，相关功能可能无法工作')
}

export const openaiClient = new OpenRouter({
  apiKey: agentConfig.openrouterApiKey,
  serverURL: agentConfig.openrouterBaseUrl,
  timeoutMs: agentConfig.requestTimeoutMs,
})

// ============== Redis ==============
const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined
}

export const redis = globalForRedis.redis ?? new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis

// ============== Redis Helpers ==============
export const withPrefix = (key: string) => `${agentConfig.redisKeyPrefix}:${key}`

// ============== Schema ==============
export const agentInputSchema = z.object({
  conversation_id: z.string().optional(),
  message: z.string().default(''),
  top_k: z.number().int().positive().optional(),
})

export type AgentInputDto = z.infer<typeof agentInputSchema>
