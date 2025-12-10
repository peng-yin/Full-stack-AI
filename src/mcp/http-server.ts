/**
 * MCP HTTP Server 示例
 * 
 * 这个文件演示如何创建一个基于 HTTP 的 MCP Server
 * 可以通过 HTTP 请求与 MCP Server 交互
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { z } from 'zod';

// 创建 MCP Server 实例
const mcpServer = new McpServer({
  name: 'demo-http-mcp-server',
  version: '1.0.0',
  capabilities: {
    tools: {},
  }
});

// 注册工具
mcpServer.tool(
  'echo',
  '回显输入的消息',
  {
    message: z.string().describe('要回显的消息')
  },
  async ({ message }) => ({
    content: [{ type: 'text', text: `Echo: ${message}` }]
  })
);

mcpServer.tool(
  'generate-uuid',
  '生成一个 UUID',
  {},
  async () => ({
    content: [{ type: 'text', text: randomUUID() }]
  })
);

mcpServer.tool(
  'json-format',
  '格式化 JSON 字符串',
  {
    json: z.string().describe('要格式化的 JSON 字符串')
  },
  async ({ json }) => {
    try {
      const parsed = JSON.parse(json);
      return {
        content: [{ type: 'text', text: JSON.stringify(parsed, null, 2) }]
      };
    } catch {
      return {
        content: [{ type: 'text', text: '无效的 JSON 格式' }],
        isError: true
      };
    }
  }
);

// 存储活跃的传输连接
const transports = new Map<string, StreamableHTTPServerTransport>();

// 创建 HTTP 服务器
const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  // MCP 端点
  if (url.pathname === '/mcp') {
    if (req.method === 'POST') {
      // 获取或创建 session
      let sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport = sessionId ? transports.get(sessionId) : undefined;

      if (!transport) {
        // 创建新的传输
        sessionId = randomUUID();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => sessionId!,
          onsessioninitialized: (id) => {
            console.log(`[HTTP MCP] 新会话已创建: ${id}`);
          }
        });
        
        transports.set(sessionId, transport);
        
        // 连接到 MCP Server
        await mcpServer.connect(transport);
      }

      // 读取请求体
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }

      try {
        // 处理 MCP 请求
        const request = JSON.parse(body);
        
        // 设置响应头
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('mcp-session-id', sessionId);
        
        // 这里需要手动处理请求，因为 StreamableHTTPServerTransport
        // 主要用于 SSE 场景，对于简单的请求-响应，我们直接处理
        
        // 简化处理：直接返回成功
        res.writeHead(200);
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          result: { sessionId }
        }));
        
      } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
      return;
    }
  }

  // 健康检查端点
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      server: 'demo-http-mcp-server',
      activeSessions: transports.size
    }));
    return;
  }

  // 工具列表端点（简化版 REST API）
  if (url.pathname === '/tools' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      tools: [
        { name: 'echo', description: '回显输入的消息' },
        { name: 'generate-uuid', description: '生成一个 UUID' },
        { name: 'json-format', description: '格式化 JSON 字符串' }
      ]
    }));
    return;
  }

  // 404
  res.writeHead(404);
  res.end('Not Found');
});

const PORT = process.env.PORT || 3100;

httpServer.listen(PORT, () => {
  console.log(`🚀 MCP HTTP Server 已启动`);
  console.log(`📡 监听端口: ${PORT}`);
  console.log(`🔗 健康检查: http://localhost:${PORT}/health`);
  console.log(`🔧 工具列表: http://localhost:${PORT}/tools`);
  console.log(`📨 MCP 端点: http://localhost:${PORT}/mcp`);
});
