'use client';

/**
 * MCP vs REST API 对比演示
 */

import { useState } from 'react';

export default function ComparisonPage() {
  const [restResult, setRestResult] = useState<any>(null);
  const [mcpResult, setMcpResult] = useState<any>(null);
  const [loading, setLoading] = useState<{rest: boolean, mcp: boolean}>({rest: false, mcp: false});

  // 传统 REST API 调用
  const callRestAPI = async () => {
    setLoading(prev => ({...prev, rest: true}));
    try {
      // 需要知道具体的端点和参数格式
      const response = await fetch('/api/weather', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({city: '北京'})
      });
      const data = await response.json();
      setRestResult(data);
    } catch (error) {
      setRestResult({error: 'REST API 调用失败'});
    } finally {
      setLoading(prev => ({...prev, rest: false}));
    }
  };

  // MCP 工具调用
  const callMCP = async () => {
    setLoading(prev => ({...prev, mcp: true}));
    try {
      // 标准化的 MCP 调用
      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          tool: 'get-weather',
          arguments: {city: '北京'}
        })
      });
      const data = await response.json();
      setMcpResult(data);
    } catch (error) {
      setMcpResult({error: 'MCP 调用失败'});
    } finally {
      setLoading(prev => ({...prev, mcp: false}));
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">MCP vs REST API</h1>
        <p className="text-gray-400 mb-8">对比传统 API 和 MCP 的区别</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* REST API 部分 */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-red-400">🔴 传统 REST API</h2>
            
            <div className="space-y-4">
              <div className="bg-gray-900 p-4 rounded">
                <h3 className="font-medium mb-2">特点：</h3>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li>• 需要硬编码端点 URL</li>
                  <li>• 手动处理参数格式</li>
                  <li>• 需要文档说明用法</li>
                  <li>• 每个接口都不同</li>
                  <li>• AI 无法自动理解</li>
                </ul>
              </div>

              <div className="bg-gray-900 p-4 rounded">
                <h3 className="font-medium mb-2">代码示例：</h3>
                <pre className="text-xs text-green-400 overflow-x-auto">
{`// 需要知道具体接口
fetch('/api/weather', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({city: '北京'})
})`}
                </pre>
              </div>

              <button
                onClick={callRestAPI}
                disabled={loading.rest}
                className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded disabled:opacity-50"
              >
                {loading.rest ? '调用中...' : '调用 REST API'}
              </button>

              {restResult && (
                <div className="bg-gray-900 p-4 rounded">
                  <h3 className="font-medium mb-2">结果：</h3>
                  <pre className="text-xs text-gray-300 overflow-x-auto">
                    {JSON.stringify(restResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* MCP 部分 */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-green-400">🟢 MCP 协议</h2>
            
            <div className="space-y-4">
              <div className="bg-gray-900 p-4 rounded">
                <h3 className="font-medium mb-2">特点：</h3>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li>• 标准化调用方式</li>
                  <li>• 自描述工具和参数</li>
                  <li>• AI 可以自动发现</li>
                  <li>• 统一的协议格式</li>
                  <li>• 支持工具链组合</li>
                </ul>
              </div>

              <div className="bg-gray-900 p-4 rounded">
                <h3 className="font-medium mb-2">代码示例：</h3>
                <pre className="text-xs text-green-400 overflow-x-auto">
{`// 标准化 MCP 调用
fetch('/api/mcp', {
  method: 'POST',
  body: JSON.stringify({
    tool: 'get-weather',
    arguments: {city: '北京'}
  })
})`}
                </pre>
              </div>

              <button
                onClick={callMCP}
                disabled={loading.mcp}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded disabled:opacity-50"
              >
                {loading.mcp ? '调用中...' : '调用 MCP 工具'}
              </button>

              {mcpResult && (
                <div className="bg-gray-900 p-4 rounded">
                  <h3 className="font-medium mb-2">结果：</h3>
                  <pre className="text-xs text-gray-300 overflow-x-auto">
                    {JSON.stringify(mcpResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 对比表格 */}
        <div className="mt-12 bg-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-6">📊 详细对比</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4">特性</th>
                  <th className="text-left py-3 px-4 text-red-400">REST API</th>
                  <th className="text-left py-3 px-4 text-green-400">MCP</th>
                </tr>
              </thead>
              <tbody className="space-y-2">
                <tr className="border-b border-gray-700">
                  <td className="py-3 px-4 font-medium">调用方式</td>
                  <td className="py-3 px-4">每个接口不同</td>
                  <td className="py-3 px-4">统一标准化</td>
                </tr>
                <tr className="border-b border-gray-700">
                  <td className="py-3 px-4 font-medium">参数验证</td>
                  <td className="py-3 px-4">手动验证</td>
                  <td className="py-3 px-4">自动 Schema 验证</td>
                </tr>
                <tr className="border-b border-gray-700">
                  <td className="py-3 px-4 font-medium">工具发现</td>
                  <td className="py-3 px-4">需要文档</td>
                  <td className="py-3 px-4">动态发现</td>
                </tr>
                <tr className="border-b border-gray-700">
                  <td className="py-3 px-4 font-medium">AI 集成</td>
                  <td className="py-3 px-4">需要硬编码</td>
                  <td className="py-3 px-4">原生支持</td>
                </tr>
                <tr className="border-b border-gray-700">
                  <td className="py-3 px-4 font-medium">工具链</td>
                  <td className="py-3 px-4">手动编排</td>
                  <td className="py-3 px-4">自动组合</td>
                </tr>
                <tr className="border-b border-gray-700">
                  <td className="py-3 px-4 font-medium">上下文</td>
                  <td className="py-3 px-4">无状态</td>
                  <td className="py-3 px-4">上下文感知</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 使用场景 */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-xl font-semibold mb-4 text-blue-400">🎯 MCP 适用场景</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>• AI Agent 工具集成</li>
              <li>• 动态工作流编排</li>
              <li>• 插件化系统</li>
              <li>• 多工具协作</li>
              <li>• 智能助手开发</li>
            </ul>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-xl font-semibold mb-4 text-purple-400">🔧 REST API 适用场景</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>• 传统 Web 应用</li>
              <li>• 移动应用后端</li>
              <li>• 微服务架构</li>
              <li>• 第三方集成</li>
              <li>• 数据 CRUD 操作</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 bg-gradient-to-r from-blue-900 to-purple-900 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-2">💡 总结</h3>
          <p className="text-gray-300">
            MCP 不是要替代 REST API，而是为 AI 时代设计的新协议。
            就像 HTTP 标准化了 Web，MCP 正在标准化 AI 工具生态！
          </p>
        </div>
      </div>
    </div>
  );
}