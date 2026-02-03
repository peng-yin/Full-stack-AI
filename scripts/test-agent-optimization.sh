#!/bin/bash

# Agent 系统优化验证测试

echo "🧪 开始验证 Agent 系统优化..."
echo ""

BASE_URL="http://localhost:3008"

# 1. 测试配置加载
echo "1️⃣ 验证配置加载..."
curl -s "${BASE_URL}/api/ai/agent/tools" | jq -r '.tools[]' | head -5
echo ""

# 2. 测试 Function Calling
echo "2️⃣ 测试 Function Calling..."
curl -s -X POST "${BASE_URL}/api/ai/agent/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": "test-fc-001",
    "message": "帮我计算 123 * 456"
  }' | head -20
echo ""

# 3. 测试知识库上传
echo "3️⃣ 测试知识库上传..."
curl -s -X POST "${BASE_URL}/api/ai/kb/upsert" \
  -H "Content-Type: application/json" \
  -d '{
    "source_id": "test-doc-001",
    "title": "测试文档",
    "content": "这是一个关于 RAG 优化的测试文档。新增了 Embedding 缓存和内存缓存机制，性能提升60%。"
  }' | jq '.'
echo ""

# 4. 测试 RAG 检索（验证缓存）
echo "4️⃣ 测试 RAG 检索..."
curl -s -X POST "${BASE_URL}/api/ai/agent/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": "test-rag-001",
    "message": "搜索 RAG 优化相关的内容"
  }' | head -30
echo ""

# 5. 测试长对话摘要
echo "5️⃣ 测试记忆管理..."
for i in {1..15}; do
  curl -s -X POST "${BASE_URL}/api/ai/agent/chat" \
    -H "Content-Type: application/json" \
    -d "{
      \"conversation_id\": \"test-memory-001\",
      \"message\": \"这是第 $i 条测试消息\"
    }" > /dev/null
  echo "  - 发送消息 $i/15"
done
echo ""

echo "✅ 验证完成！请查看日志确认优化效果。"
