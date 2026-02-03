export {}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // OpenRouter
      OPENROUTER_API_KEY?: string
      OPENROUTER_BASE_URL?: string
      LLM_MODEL?: string
      EMBEDDING_MODEL?: string
      REQUEST_TIMEOUT_MS?: string
      
      // RAG
      RAG_ENABLED?: string
      RAG_TOP_K?: string
      RAG_SCORE_THRESHOLD?: string
      
      // Memory
      MEMORY_MAX_MESSAGES?: string
      MEMORY_SUMMARY_EVERY?: string
      
      // MCP
      MCP_CONFIRM_REQUIRED?: string
      
      // Other
      SSE_HEARTBEAT_MS?: string
      AGENT_REDIS_KEY_PREFIX?: string
      BASE_URL?: string
      NEXT_PUBLIC_BASE_URL?: string
    }
  }
}
