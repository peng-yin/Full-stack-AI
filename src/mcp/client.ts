/**
 * MCP Client 示例
 * 
 * 这个文件演示如何创建一个 MCP Client，连接到 MCP Server 并调用工具
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ESM 模块中获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 创建 MCP Client 实例
const client = new Client({
  name: 'demo-mcp-client',
  version: '1.0.0'
});

async function main() {
  console.log('🚀 MCP Client 启动中...\n');

  // 创建 Stdio 传输，启动 Server 进程
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', join(__dirname, 'server.ts')],
    env: {
      ...process.env,
      NODE_ENV: 'development'
    }
  });

  try {
    // 连接到 Server
    console.log('📡 正在连接到 MCP Server...');
    await client.connect(transport);
    console.log('✅ 已连接到 MCP Server\n');

    // 1. 列出所有可用工具
    console.log('📋 获取可用工具列表...');
    const tools = await client.listTools();
    console.log('可用工具:');
    tools.tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });
    console.log();

    // 2. 调用 get-current-time 工具
    console.log('⏰ 调用 get-current-time 工具...');
    const timeResult = await client.callTool({
      name: 'get-current-time',
      arguments: {}
    });
    console.log('结果:', JSON.parse((timeResult.content as any)[0].text));
    console.log();

    // 3. 调用 calculator 工具
    console.log('🔢 调用 calculator 工具 (100 + 200)...');
    const calcResult = await client.callTool({
      name: 'calculator',
      arguments: {
        operation: 'add',
        a: 100,
        b: 200
      }
    });
    console.log('结果:', JSON.parse((calcResult.content as any)[0].text));
    console.log();

    // 4. 调用 get-weather 工具
    console.log('🌤️ 调用 get-weather 工具 (北京)...');
    const weatherResult = await client.callTool({
      name: 'get-weather',
      arguments: {
        city: '北京'
      }
    });
    console.log('结果:', JSON.parse((weatherResult.content as any)[0].text));
    console.log();

    // 5. 调用 query-users 工具
    console.log('👥 调用 query-users 工具...');
    const usersResult = await client.callTool({
      name: 'query-users',
      arguments: {
        limit: 3,
        role: 'user'
      }
    });
    console.log('结果:', JSON.parse((usersResult.content as any)[0].text));
    console.log();

    console.log('🎉 所有工具调用测试通过！');

  } catch (error) {
    console.error('❌ 错误:', error);
  } finally {
    // 关闭连接
    console.log('\n👋 关闭连接...');
    await client.close();
    console.log('✅ 已断开连接');
  }
}

main();
