/**
 * MCP API 路由
 * 
 * 这个文件演示如何在 Next.js API 中集成 MCP 功能
 * 提供 RESTful API 来调用 MCP 工具
 */

import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';

// MCP Client 单例（生产环境应该使用连接池）
let mcpClient: Client | null = null;
let isConnecting = false;

async function getMcpClient(): Promise<Client> {
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
      args: ['tsx', path.join(process.cwd(), 'src/mcp/server.ts')],
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
 * GET /api/mcp - 获取可用工具列表
 */
export async function GET() {
  try {
    const client = await getMcpClient();
    const tools = await client.listTools();
    
    return NextResponse.json({
      success: true,
      tools: tools.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }))
    });
  } catch (error) {
    console.error('获取工具列表失败:', error);
    return NextResponse.json(
      { success: false, error: '获取工具列表失败' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/mcp - 调用 MCP 工具
 * 
 * 请求体:
 * {
 *   "tool": "工具名称",
 *   "arguments": { ... }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tool, arguments: args = {} } = body;

    if (!tool) {
      return NextResponse.json(
        { success: false, error: '缺少 tool 参数' },
        { status: 400 }
      );
    }

    const client = await getMcpClient();
    
    const result = await client.callTool({
      name: tool,
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

    return NextResponse.json({
      success: true,
      tool,
      result: parsedResult,
      isError: result.isError || false
    });

  } catch (error) {
    console.error('调用工具失败:', error);
    return NextResponse.json(
      { success: false, error: '调用工具失败' },
      { status: 500 }
    );
  }
}
