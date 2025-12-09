# Backend AI

MySQL + Redis 学习项目，基于 Next.js + Prisma + ioredis。

## 快速开始

```bash
# 1. 启动 Docker 服务
pnpm docker:up

# 2. 同步数据库表
pnpm db:push

# 3. 启动开发服务
pnpm dev
```

访问 http://localhost:3000/test 进行测试。

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm docker:up` | 启动 MySQL + Redis |
| `pnpm docker:down` | 停止服务 |
| `pnpm db:push` | 同步 Prisma schema 到数据库 |
| `pnpm db:studio` | 打开 Prisma 数据库管理界面 |
| `pnpm db:sync-init` | 同步初始化 SQL 脚本 |

## 数据库连接

**MySQL**
- Host: `127.0.0.1:3306`
- User: `root`
- Password: `root123456`
- Database: `backend_ai`

**Redis**
- Host: `127.0.0.1:6379`
- 管理界面: http://localhost:5540 (RedisInsight)

## 项目结构

```
src/
├── app/
│   ├── api/           # API 路由
│   │   ├── users/     # 用户 CRUD
│   │   ├── posts/     # 文章（Redis List）
│   │   ├── products/  # 商品（缓存策略）
│   │   ├── orders/    # 订单（事务+分布式锁）
│   │   ├── cart/      # 购物车（Redis Hash）
│   │   ├── categories/# 分类（树形缓存）
│   │   └── stats/     # 统计（Sorted Set）
│   └── test/          # 测试页面
├── lib/
│   ├── prisma.ts      # Prisma 客户端
│   └── redis.ts       # Redis 工具类
└── middleware.ts      # 限流中间件
```

## Redis 使用场景

- **缓存**: 查询结果缓存、防穿透、防击穿、防雪崩
- **分布式锁**: 订单防超卖
- **List**: 最新文章列表
- **Hash**: 购物车
- **Sorted Set**: 排行榜
- **限流**: 固定窗口、滑动窗口、令牌桶

## 重建数据库

```bash
# 重建容器（保留数据）
pnpm docker:down && pnpm docker:up

# 完全重建（清空数据）
docker-compose down -v && pnpm docker:up && pnpm db:push
```

## 修改 Schema 后

```bash
# 1. 同步到数据库
pnpm db:push

# 2. 更新初始化脚本
pnpm db:sync-init
```
