/**
 * MCP 高级特性演示
 * 展示 MCP 相比普通 API 的独特优势
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'advanced-mcp-demo',
  version: '1.0.0',
  capabilities: {
    tools: {},
    resources: {},
    prompts: {},  // MCP 独有：提示词模板
    logging: {}   // MCP 独有：日志记录
  }
});

// ============ MCP 独有特性 1: 动态工具发现 ============
// AI 可以自动发现和理解工具的用途，无需硬编码

server.tool(
  'analyze-sentiment',
  '分析文本情感倾向，返回正面/负面/中性评分',
  {
    text: z.string().describe('要分析的文本内容'),
    language: z.enum(['zh', 'en']).default('zh').describe('文本语言')
  },
  async ({ text, language }) => {
    // 模拟情感分析
    const sentiment = Math.random() > 0.5 ? 'positive' : 'negative';
    const score = Math.random();
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          text,
          language,
          sentiment,
          score,
          confidence: 0.85,
          keywords: text.split(' ').slice(0, 3)
        }, null, 2)
      }]
    };
  }
);

// ============ MCP 独有特性 2: 资源流 ============
// 可以提供实时更新的数据流，而不是一次性响应

server.resource(
  'stream://system-metrics',
  'real-time-metrics',
  async () => {
    const metrics = {
      timestamp: new Date().toISOString(),
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      disk: Math.random() * 100,
      network: {
        in: Math.floor(Math.random() * 1000),
        out: Math.floor(Math.random() * 1000)
      }
    };

    return {
      contents: [{
        uri: 'stream://system-metrics',
        mimeType: 'application/json',
        text: JSON.stringify(metrics, null, 2)
      }]
    };
  }
);

// ============ MCP 独有特性 3: 提示词模板 ============
// AI 可以获取和使用预定义的提示词模板

server.prompt(
  'code-review',
  '代码审查提示词模板',
  [
    {
      name: 'code',
      description: '要审查的代码',
      required: true
    },
    {
      name: 'language',
      description: '编程语言',
      required: false
    }
  ],
  async (args) => {
    const { code, language = 'javascript' } = args;
    
    return {
      messages: [
        {
          role: 'system',
          content: {
            type: 'text',
            text: `你是一个专业的代码审查员。请审查以下 ${language} 代码，关注：
1. 代码质量和最佳实践
2. 潜在的 bug 和安全问题
3. 性能优化建议
4. 代码可读性和维护性

请提供具体的改进建议。`
          }
        },
        {
          role: 'user',
          content: {
            type: 'text',
            text: `请审查这段代码：\n\`\`\`${language}\n${code}\n\`\`\``
          }
        }
      ]
    };
  }
);

// ============ MCP 独有特性 4: 工具链组合 ============
// 一个工具可以调用其他工具，形成复杂的工作流

server.tool(
  'smart-analysis',
  '智能分析：结合多个工具进行综合分析',
  {
    content: z.string().describe('要分析的内容'),
    analysisType: z.enum(['full', 'quick', 'deep']).describe('分析深度')
  },
  async ({ content, analysisType }) => {
    const results = {
      content,
      analysisType,
      timestamp: new Date().toISOString(),
      steps: []
    };

    // 步骤1: 情感分析
    results.steps.push({
      step: 'sentiment-analysis',
      result: { sentiment: 'positive', score: 0.8 }
    });

    // 步骤2: 关键词提取
    results.steps.push({
      step: 'keyword-extraction',
      result: { keywords: content.split(' ').slice(0, 5) }
    });

    // 步骤3: 复杂度评估
    if (analysisType === 'deep') {
      results.steps.push({
        step: 'complexity-analysis',
        result: { complexity: 'medium', readability: 0.7 }
      });
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(results, null, 2)
      }]
    };
  }
);

// ============ MCP 独有特性 5: 上下文感知 ============
// 工具可以访问会话上下文和历史

let conversationHistory: Array<{timestamp: string, tool: string, args: any}> = [];

server.tool(
  'context-aware-response',
  '基于上下文历史的智能响应',
  {
    query: z.string().describe('用户查询')
  },
  async ({ query }) => {
    // 记录当前调用
    conversationHistory.push({
      timestamp: new Date().toISOString(),
      tool: 'context-aware-response',
      args: { query }
    });

    // 保持最近10次历史
    if (conversationHistory.length > 10) {
      conversationHistory = conversationHistory.slice(-10);
    }

    const response = {
      query,
      contextualResponse: `基于你之前的 ${conversationHistory.length - 1} 次交互，我理解你想要...`,
      history: conversationHistory.map(h => ({
        time: h.timestamp,
        action: h.tool
      })),
      suggestions: [
        '基于历史模式，你可能还想要...',
        '根据上下文，建议尝试...'
      ]
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }]
    };
  }
);

// ============ 启动服务器 ============
async function main() {
  const transport = new StdioServerTransport();
  
  console.error('[高级 MCP Server] 启动中...');
  console.error('[高级 MCP Server] 特性: 动态发现、资源流、提示词模板、工具链、上下文感知');
  
  await server.connect(transport);
  
  console.error('[高级 MCP Server] 已启动，展示 MCP 独有优势...');
}

main().catch(console.error);