import { z } from 'zod'

const configSchema = z.object({
  env: z.string(),
  baseUrl: z.string(),
  redisKeyPrefix: z.string(),
  openrouterApiKey: z.string().default(''),
  openrouterBaseUrl: z.string(),
  llmModel: z.string(),
  embeddingModel: z.string(),
  requestTimeoutMs: z.number().int().positive(),
  ragEnabled: z.boolean(),
  ragTopK: z.number().int().positive(),
  ragScoreThreshold: z.number().min(0).max(1),
  ragCacheTtlMs: z.number().int().positive(), // RAG 缓存时长
  memoryMaxMessages: z.number().int().positive(),
  memorySummaryEvery: z.number().int().positive(),
  memorySummaryMaxTokens: z.number().int().positive(), // 触发摘要的 token 阈值
  memoryKeepRecentCount: z.number().int().positive(), // 摘要后保留的消息数
  mcpConfirmRequired: z.boolean(),
  sseHeartbeatMs: z.number().int().positive(),
})

export const agentConfig = configSchema.parse({
  env: process.env.NODE_ENV ?? 'development',
  baseUrl: process.env.BASE_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000',
  redisKeyPrefix: process.env.AGENT_REDIS_KEY_PREFIX ?? 'ai-agent',
  // OpenRouter 配置
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
  openrouterBaseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
  llmModel: process.env.LLM_MODEL ?? 'gpt-4o-mini',
  embeddingModel: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 30000),
  // RAG 配置
  ragEnabled: String(process.env.RAG_ENABLED ?? 'true') === 'true',
  ragTopK: Number(process.env.RAG_TOP_K ?? 4),
  ragScoreThreshold: Number(process.env.RAG_SCORE_THRESHOLD ?? 0.1),
  ragCacheTtlMs: Number(process.env.RAG_CACHE_TTL_MS ?? 60000),
  // Memory 配置
  memoryMaxMessages: Number(process.env.MEMORY_MAX_MESSAGES ?? 30),
  memorySummaryEvery: Number(process.env.MEMORY_SUMMARY_EVERY ?? 12),
  memorySummaryMaxTokens: Number(process.env.MEMORY_SUMMARY_MAX_TOKENS ?? 3000),
  memoryKeepRecentCount: Number(process.env.MEMORY_KEEP_RECENT_COUNT ?? 5),
  // MCP 配置
  mcpConfirmRequired: String(process.env.MCP_CONFIRM_REQUIRED ?? 'true') === 'true',
  sseHeartbeatMs: Number(process.env.SSE_HEARTBEAT_MS ?? 15000),
})

/**
 * 打印配置信息（开发环境）
 */
if (agentConfig.env === 'development') {
  console.log('[Agent Config]', {
    llmModel: agentConfig.llmModel,
    embeddingModel: agentConfig.embeddingModel,
    ragEnabled: agentConfig.ragEnabled,
    memoryMaxMessages: agentConfig.memoryMaxMessages,
    redisKeyPrefix: agentConfig.redisKeyPrefix,
  })
}
