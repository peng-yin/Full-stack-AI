import { agentConfig } from './config'
import { redis, withPrefix, openaiClient } from './core'
import { createId, hashText, logger } from './utils'
import { RagChunk } from './types'

const KB_ALL_CHUNKS_KEY = withPrefix('kb:chunks')
const KB_SOURCE_PREFIX = withPrefix('kb:source')
const KB_EMBEDDING_CACHE_PREFIX = withPrefix('kb:emb-cache')

// 内存缓存：避免频繁 Redis 读取
let chunksCache: Array<RagChunk & { embedding: number[] }> | null = null
let chunksCacheTimestamp = 0
const getCacheTTL = () => agentConfig.ragCacheTtlMs

const chunkText = (content: string, chunkSize = 800, overlap = 120) => {
  const chunks: string[] = []
  let index = 0
  while (index < content.length) {
    const slice = content.slice(index, index + chunkSize)
    chunks.push(slice)
    index += chunkSize - overlap
  }
  return chunks
}

const cosineSimilarity = (a: number[], b: number[]) => {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8)
}

const embedText = async (text: string) => {
  // 检查缓存
  const cacheKey = `${KB_EMBEDDING_CACHE_PREFIX}:${hashText(text)}`
  const cached = await redis.get(cacheKey)
  if (cached) {
    return JSON.parse(cached)
  }

  // 生成新 embedding
  const resp = await openaiClient.embeddings.generate({
    model: agentConfig.embeddingModel,
    input: text,
  })

  const payload = typeof resp === 'string' ? JSON.parse(resp) : resp
  const embedding = payload?.data?.[0]?.embedding || []

  // 缓存 1 小时
  await redis.setex(cacheKey, 3600, JSON.stringify(embedding))
  return embedding
}

export const upsertDocument = async ({
  sourceId,
  title,
  content,
  metadata = {},
}: {
  sourceId: string
  title?: string
  content: string
  metadata?: Record<string, unknown>
}) => {
  const chunks = chunkText(content || '')
  const sourceKey = `${KB_SOURCE_PREFIX}:${sourceId}`
  const chunkIds: string[] = []

  for (const chunk of chunks) {
    const embedding = await embedText(chunk)
    const chunkId = createId('kb')
    const payload: RagChunk = {
      id: chunkId,
      score: 0,
      sourceId,
      title,
      content: chunk,
      metadata,
      embedding,
      checksum: hashText(chunk),
      createdAt: new Date().toISOString(),
    } as RagChunk & { embedding: number[]; checksum: string; createdAt: string }
    chunkIds.push(chunkId)
    await redis.rpush(KB_ALL_CHUNKS_KEY, JSON.stringify(payload))
    await redis.rpush(sourceKey, chunkId)
  }

  // 清除缓存
  clearCache()

  return { chunkCount: chunks.length, chunkIds }
}

export const listChunks = async (): Promise<Array<RagChunk & { embedding: number[] }>> => {
  // 使用内存缓存
  const now = Date.now()
  if (chunksCache && now - chunksCacheTimestamp < getCacheTTL()) {
    return chunksCache
  }

  const raw = await redis.lrange(KB_ALL_CHUNKS_KEY, 0, -1)
  chunksCache = raw.map((item) => JSON.parse(item))
  chunksCacheTimestamp = now
  return chunksCache
}

/**
 * 清除缓存（在文档更新时调用）
 */
export const clearCache = () => {
  chunksCache = null
  chunksCacheTimestamp = 0
}

export const search = async ({
  query,
  topK = agentConfig.ragTopK,
  scoreThreshold = agentConfig.ragScoreThreshold,
}: {
  query: string
  topK?: number
  scoreThreshold?: number
}): Promise<RagChunk[]> => {
  if (!query) return []

  const queryEmbedding = await embedText(query)
  const chunks = await listChunks()

  // 性能优化：提前过滤和排序
  const scored = chunks
    .map((chunk) => {
      const score = cosineSimilarity(queryEmbedding, chunk.embedding || [])
      // 提前过滤，减少后续排序量
      if (score < scoreThreshold) return null
      return { ...chunk, score } as RagChunk
    })
    .filter((item): item is RagChunk => item !== null)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, topK)

  logger.info('RAG 检索完成', {
    query: query.slice(0, 50),
    totalChunks: chunks.length,
    matchedCount: scored.length,
    topScore: scored[0]?.score,
  })

  return scored
}

export const removeBySource = async (sourceId: string) => {
  const sourceKey = `${KB_SOURCE_PREFIX}:${sourceId}`
  const chunkIds = await redis.lrange(sourceKey, 0, -1)
  if (chunkIds.length === 0) return { removed: 0 }

  const allChunks = await listChunks()
  const remained = allChunks.filter((chunk) => !chunkIds.includes(chunk.id))
  await redis.del(KB_ALL_CHUNKS_KEY)
  if (remained.length) {
    await redis.rpush(KB_ALL_CHUNKS_KEY, ...remained.map((chunk) => JSON.stringify(chunk)))
  }
  await redis.del(sourceKey)

  // 清除缓存
  clearCache()

  logger.info('知识库文档已删除', { sourceId, removed: chunkIds.length })
  return { removed: chunkIds.length }
}
