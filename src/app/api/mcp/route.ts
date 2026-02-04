/**
 * MCP API 路由
 * 
 * 提供 RESTful API 来调用 MCP 工具
 */

import { NextRequest, NextResponse } from 'next/server';
import { listTools, callTool } from '@/lib/mcp/client';

/**
 * GET /api/mcp - 获取可用工具列表
 */
export async function GET() {
  try {
    const tools = await listTools();
    
    return NextResponse.json({
      success: true,
      tools
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

    const { result, isError } = await callTool(tool, args);

    return NextResponse.json({
      success: true,
      tool,
      result,
      isError
    });

  } catch (error) {
    console.error('调用工具失败:', error);
    return NextResponse.json(
      { success: false, error: '调用工具失败' },
      { status: 500 }
    );
  }
}
