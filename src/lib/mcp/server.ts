/**
 * MCP Server 实现
 * 
 * 提供工具给 AI 调用
 * MCP (Model Context Protocol) 是一个标准化协议，让 AI 应用能够连接各种数据源和工具
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// 创建 MCP Server 实例
const server = new McpServer({
  name: 'demo-mcp-server',
  version: '1.0.0',
  capabilities: {
    tools: {},      // 启用工具功能
    resources: {},  // 启用资源功能
  }
});

// ============ 工具定义 ============

/**
 * 工具 1: 获取当前时间
 */
server.tool(
  'get-current-time',
  '获取当前服务器时间',
  {},
  async () => {
    const now = new Date();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            timestamp: now.toISOString(),
            formatted: now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
            timezone: 'Asia/Shanghai'
          }, null, 2)
        }
      ]
    };
  }
);

/**
 * 工具 2: 计算器
 */
server.tool(
  'calculator',
  '执行基本数学运算',
  {
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']).describe('运算类型'),
    a: z.number().describe('第一个数字'),
    b: z.number().describe('第二个数字')
  },
  async ({ operation, a, b }) => {
    let result: number;
    
    switch (operation) {
      case 'add':
        result = a + b;
        break;
      case 'subtract':
        result = a - b;
        break;
      case 'multiply':
        result = a * b;
        break;
      case 'divide':
        if (b === 0) {
          return {
            content: [{ type: 'text', text: '错误: 除数不能为零' }],
            isError: true
          };
        }
        result = a / b;
        break;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            expression: `${a} ${operation} ${b}`,
            result
          }, null, 2)
        }
      ]
    };
  }
);

/**
 * 工具 3: 天气查询（模拟）
 */
server.tool(
  'get-weather',
  '获取指定城市的天气信息（模拟数据）',
  {
    city: z.string().describe('城市名称')
  },
  async ({ city }) => {
    // 模拟天气数据
    const weatherData = {
      city,
      temperature: Math.floor(Math.random() * 30) + 5,
      humidity: Math.floor(Math.random() * 60) + 40,
      condition: ['晴天', '多云', '阴天', '小雨'][Math.floor(Math.random() * 4)],
      wind: `${['东', '南', '西', '北'][Math.floor(Math.random() * 4)]}风 ${Math.floor(Math.random() * 5) + 1}级`,
      updatedAt: new Date().toISOString()
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(weatherData, null, 2)
        }
      ]
    };
  }
);

/**
 * 工具 4: 数据库查询（模拟）
 */
server.tool(
  'query-users',
  '查询用户列表（模拟数据库查询）',
  {
    limit: z.number().min(1).max(100).default(10).describe('返回数量限制'),
    role: z.enum(['admin', 'user', 'guest']).optional().describe('按角色筛选')
  },
  async ({ limit, role }) => {
    // 模拟用户数据
    const allUsers = [
      { id: 1, name: '张三', email: 'zhangsan@example.com', role: 'admin' },
      { id: 2, name: '李四', email: 'lisi@example.com', role: 'user' },
      { id: 3, name: '王五', email: 'wangwu@example.com', role: 'user' },
      { id: 4, name: '赵六', email: 'zhaoliu@example.com', role: 'guest' },
      { id: 5, name: '钱七', email: 'qianqi@example.com', role: 'user' },
    ];

    let users = allUsers;
    if (role) {
      users = users.filter(u => u.role === role);
    }
    users = users.slice(0, limit);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            total: users.length,
            users
          }, null, 2)
        }
      ]
    };
  }
);

// ============ 资源定义 ============

/**
 * 资源: 系统配置
 * 资源是只读的数据，AI 可以读取但不能修改
 */
server.resource(
  'config://system',
  'system-config',
  async () => ({
    contents: [
      {
        uri: 'config://system',
        mimeType: 'application/json',
        text: JSON.stringify({
          appName: 'Demo MCP Server',
          version: '1.0.0',
          environment: process.env.NODE_ENV || 'development',
          features: ['tools', 'resources', 'prompts']
        }, null, 2)
      }
    ]
  })
);

// ============ 启动服务器 ============

async function main() {
  // 使用 Stdio 传输（适合本地进程间通信）
  const transport = new StdioServerTransport();
  
  console.error('[MCP Server] 正在启动...');
  
  await server.connect(transport);
  
  console.error('[MCP Server] 已启动，等待客户端连接...');
  console.error('[MCP Server] 可用工具: get-current-time, calculator, get-weather, query-users');
}

main().catch((error) => {
  console.error('[MCP Server] 启动失败:', error);
  process.exit(1);
});
