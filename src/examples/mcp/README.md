# MCP (Model Context Protocol) 示例

这个目录包含 MCP 的示例代码和测试文件，用于演示如何使用 MCP SDK。

## 📁 文件说明

- **`server.ts`** - MCP Server 基础示例
  - 演示如何创建 MCP Server
  - 实现基础工具（计算器、天气查询、用户查询等）

- **`client.ts`** - MCP Client 基础示例
  - 演示如何创建 MCP Client
  - 连接到 Server 并调用工具

- **`http-server.ts`** - HTTP MCP Server
  - 使用 SSE (Server-Sent Events) 的 HTTP 版本
  - 适合 Web 集成场景

- **`advanced-demo.ts`** - 高级示例
  - 演示更复杂的 MCP 使用场景

- **`test.ts`** - 测试文件
  - 用于测试 MCP 功能

## 🚀 运行示例

### 1. 运行 Server
```bash
npx tsx src/examples/mcp/server.ts
```

### 2. 运行 Client（需要先启动 Server）
```bash
npx tsx src/examples/mcp/client.ts
```

### 3. 运行 HTTP Server
```bash
npx tsx src/examples/mcp/http-server.ts
```

## 🔗 相关代码

实际生产环境中的 MCP 集成代码位于：
- `src/lib/agent/mcp.ts` - Agent 系统中的 MCP 工具集成
- `src/lib/agent/tool-registry.ts` - 工具注册系统

## 📚 更多信息

- [MCP 官方文档](https://modelcontextprotocol.io/)
- [项目 Agent 指南](../../../AGENT_GUIDE.md)
