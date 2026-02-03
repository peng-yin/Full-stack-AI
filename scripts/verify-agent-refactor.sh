#!/bin/bash

# Agent 模块优化验证脚本

echo "=== Agent 模块优化验证 ==="
echo ""

echo "1. 检查文件结构..."
echo "现有文件:"
ls -1 src/lib/agent/*.ts | grep -v ".example.ts" | wc -l
echo "个核心文件（应为 12 个）"

echo ""
echo "2. 检查已删除的文件..."
DELETED_FILES=(
  "src/lib/agent/crypto.ts"
  "src/lib/agent/logger.ts"
  "src/lib/agent/constants.ts"
  "src/lib/agent/openai.ts"
  "src/lib/agent/redis.ts"
  "src/lib/agent/schema.ts"
)

for file in "${DELETED_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "✅ $file 已删除"
  else
    echo "❌ $file 仍存在"
  fi
done

echo ""
echo "3. 检查新增文件..."
NEW_FILES=(
  "src/lib/agent/utils.ts"
  "src/lib/agent/core.ts"
)

for file in "${NEW_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ $file 已创建"
  else
    echo "❌ $file 不存在"
  fi
done

echo ""
echo "4. 验证导出..."
if grep -q "export \* from './utils'" src/lib/agent/index.ts; then
  echo "✅ index.ts 已更新 (utils)"
fi

if grep -q "export \* from './core'" src/lib/agent/index.ts; then
  echo "✅ index.ts 已更新 (core)"
fi

echo ""
echo "5. 检查类型错误..."
npx tsc --noEmit --skipLibCheck src/lib/agent/*.ts 2>&1 | grep -E "error TS" | wc -l
echo "个类型错误（应为 0）"

echo ""
echo "=== 验证完成 ==="
