#!/bin/bash
# 从 Prisma schema 自动生成 MySQL 初始化脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_FILE="$PROJECT_DIR/docker/mysql/init/02-create-tables.sql"

echo "🔄 从 Prisma schema 生成 SQL..."

cat > "$OUTPUT_FILE" << 'EOF'
-- ============================================
-- 自动生成的初始化脚本
-- 由 scripts/sync-init-sql.sh 生成
-- 请勿手动修改，修改 schema.prisma 后重新生成
-- ============================================

USE backend_ai;

EOF

# 使用 prisma migrate diff 生成 SQL
cd "$PROJECT_DIR"
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script >> "$OUTPUT_FILE" 2>/dev/null

echo "✅ 已生成: $OUTPUT_FILE"
