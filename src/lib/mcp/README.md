# MCP (Model Context Protocol) 集成

这个目录包含项目的 MCP 实现，用于为 AI Agent 提供工具调用能力。

## 📁 文件说明

- **`server.ts`** - MCP Server 实现
  - 定义和暴露工具给 AI 调用
  - 实现基础工具（计算器、天气查询、用户查询等）

- **`client.ts`** - MCP Client 工具函数
  - 提供 Client 创建和管理
  - 工具调用的封装函数

## 🚀 使用方式

### 在 API Route 中使用

```typescript
import { listTools, callTool } from '@/lib/mcp/client';

// 获取工具列表
const tools = await listTools();

// 调用工具
const { result, isError } = await callTool('calculator', {
  operation: 'add',
  a: 10,
  b: 20
});
```

### 在 Agent 系统中使用

MCP 工具已集成到 Agent 系统中：
- `src/lib/agent/mcp.ts` - Agent 中的 MCP 工具注册
- `src/lib/agent/tool-registry.ts` - 工具注册系统

## 🔧 可用工具

| 工具名 | 功能 | 参数 |
|--------|------|------|
| `get-current-time` | 获取当前时间 | 无 |
| `calculator` | 数学运算 | operation, a, b |
| `get-weather` | 查询天气（模拟） | city |
| `query-users` | 查询用户列表（模拟） | limit, role |

## 📚 相关资源

- [MCP 官方文档](https://modelcontextprotocol.io/)
- [项目 Agent 指南](../../../AGENT_GUIDE.md)
- 前端演示页面: `/mcp`
- API 端点: `/api/mcp`

## 🔄 与旧代码的关系

此目录整合了原 `src/examples/mcp` 中的代码，提供了更好的组织结构：
- 将 Server 和 Client 分离为独立模块
- 提供了可复用的工具函数
- 更易于在项目中集成和维护
