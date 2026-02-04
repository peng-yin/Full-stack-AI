/**
 * MCP Client 工具函数
 * 
 * 提供 MCP Client 的创建和管理功能
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';

// MCP Client 单例（生产环境应该使用连接池）
let mcpClient: Client | null = null;
let isConnecting = false;

/**
 * 获取或创建 MCP Client
 */
export async function getMcpClient(): Promise<Client> {
  if (mcpClient) {
    return mcpClient;
  }

  if (isConnecting) {
    // 等待连接完成
    await new Promise(resolve => setTimeout(resolve, 100));
    return getMcpClient();
  }

  isConnecting = true;

  try {
    const client = new Client({
      name: 'nextjs-mcp-client',
      version: '1.0.0'
    });

    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', path.join(process.cwd(), 'src/lib/mcp/server.ts')],
      env: {
        ...process.env,
        NODE_ENV: 'development'
      }
    });

    await client.connect(transport);
    mcpClient = client;
    return client;
  } finally {
    isConnecting = false;
  }
}

/**
 * 关闭 MCP Client 连接
 */
export async function closeMcpClient() {
  if (mcpClient) {
    await mcpClient.close();
    mcpClient = null;
  }
}

/**
 * 列出所有可用工具
 */
export async function listTools() {
  const client = await getMcpClient();
  const tools = await client.listTools();
  return tools.tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }));
}

/**
 * 调用 MCP 工具
 */
export async function callTool(toolName: string, args: Record<string, any> = {}) {
  const client = await getMcpClient();
  const result = await client.callTool({
    name: toolName,
    arguments: args
  });

  // 解析结果
  const content = result.content as Array<{ type: string; text?: string }>;
  let parsedResult: any = content;

  // 尝试解析 JSON
  if (content.length > 0 && content[0].type === 'text' && content[0].text) {
    try {
      parsedResult = JSON.parse(content[0].text);
    } catch {
      parsedResult = content[0].text;
    }
  }

  return {
    result: parsedResult,
    isError: result.isError || false
  };
}
