'use client';

/**
 * MCP Demo 页面
 * 
 * 这个页面演示如何在前端调用 MCP 工具
 */

import { useState, useEffect } from 'react';

interface Tool {
  name: string;
  description: string;
  inputSchema?: any;
}

interface ToolResult {
  tool: string;
  result: any;
  isError: boolean;
  timestamp: string;
}

export default function McpDemoPage() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<ToolResult[]>([]);
  const [executing, setExecuting] = useState<string | null>(null);

  // 表单状态
  const [calcA, setCalcA] = useState('10');
  const [calcB, setCalcB] = useState('5');
  const [calcOp, setCalcOp] = useState('add');
  const [city, setCity] = useState('北京');
  const [userLimit, setUserLimit] = useState('5');
  const [userRole, setUserRole] = useState('');

  // 获取工具列表
  useEffect(() => {
    fetch('/api/mcp')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setTools(data.tools);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // 调用工具
  const callTool = async (tool: string, args: Record<string, any>) => {
    setExecuting(tool);
    try {
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, arguments: args })
      });
      const data = await res.json();
      
      setResults(prev => [{
        tool: data.tool,
        result: data.result,
        isError: data.isError,
        timestamp: new Date().toLocaleTimeString()
      }, ...prev].slice(0, 10));
    } catch (error) {
      console.error(error);
    } finally {
      setExecuting(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">MCP Demo</h1>
        <p className="text-gray-400 mb-8">
          Model Context Protocol 前后端集成示例
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 左侧：工具面板 */}
          <div className="space-y-6">
            <h2 className="text-xl font-semibold border-b border-gray-700 pb-2">
              可用工具 ({tools.length})
            </h2>

            {/* 获取时间 */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="font-medium text-blue-400">⏰ get-current-time</h3>
              <p className="text-sm text-gray-400 mt-1">获取当前服务器时间</p>
              <button
                onClick={() => callTool('get-current-time', {})}
                disabled={executing === 'get-current-time'}
                className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm disabled:opacity-50"
              >
                {executing === 'get-current-time' ? '执行中...' : '执行'}
              </button>
            </div>

            {/* 计算器 */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="font-medium text-green-400">🔢 calculator</h3>
              <p className="text-sm text-gray-400 mt-1">执行基本数学运算</p>
              <div className="mt-3 flex gap-2 items-center">
                <input
                  type="number"
                  value={calcA}
                  onChange={e => setCalcA(e.target.value)}
                  className="w-20 px-2 py-1 bg-gray-700 rounded text-sm"
                />
                <select
                  value={calcOp}
                  onChange={e => setCalcOp(e.target.value)}
                  className="px-2 py-1 bg-gray-700 rounded text-sm"
                >
                  <option value="add">+</option>
                  <option value="subtract">-</option>
                  <option value="multiply">×</option>
                  <option value="divide">÷</option>
                </select>
                <input
                  type="number"
                  value={calcB}
                  onChange={e => setCalcB(e.target.value)}
                  className="w-20 px-2 py-1 bg-gray-700 rounded text-sm"
                />
                <button
                  onClick={() => callTool('calculator', {
                    operation: calcOp,
                    a: parseFloat(calcA),
                    b: parseFloat(calcB)
                  })}
                  disabled={executing === 'calculator'}
                  className="px-4 py-1 bg-green-600 hover:bg-green-700 rounded text-sm disabled:opacity-50"
                >
                  {executing === 'calculator' ? '...' : '='}
                </button>
              </div>
            </div>

            {/* 天气查询 */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="font-medium text-yellow-400">🌤️ get-weather</h3>
              <p className="text-sm text-gray-400 mt-1">获取指定城市的天气信息</p>
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  placeholder="城市名称"
                  className="flex-1 px-3 py-2 bg-gray-700 rounded text-sm"
                />
                <button
                  onClick={() => callTool('get-weather', { city })}
                  disabled={executing === 'get-weather'}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded text-sm disabled:opacity-50"
                >
                  {executing === 'get-weather' ? '查询中...' : '查询'}
                </button>
              </div>
            </div>

            {/* 用户查询 */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="font-medium text-purple-400">👥 query-users</h3>
              <p className="text-sm text-gray-400 mt-1">查询用户列表</p>
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={userLimit}
                    onChange={e => setUserLimit(e.target.value)}
                    placeholder="数量"
                    className="w-20 px-3 py-2 bg-gray-700 rounded text-sm"
                  />
                  <select
                    value={userRole}
                    onChange={e => setUserRole(e.target.value)}
                    className="flex-1 px-3 py-2 bg-gray-700 rounded text-sm"
                  >
                    <option value="">所有角色</option>
                    <option value="admin">管理员</option>
                    <option value="user">用户</option>
                    <option value="guest">访客</option>
                  </select>
                  <button
                    onClick={() => callTool('query-users', {
                      limit: parseInt(userLimit),
                      ...(userRole && { role: userRole })
                    })}
                    disabled={executing === 'query-users'}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm disabled:opacity-50"
                  >
                    {executing === 'query-users' ? '查询中...' : '查询'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧：结果面板 */}
          <div>
            <h2 className="text-xl font-semibold border-b border-gray-700 pb-2 mb-4">
              执行结果
            </h2>
            
            {results.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                点击左侧工具按钮查看结果
              </div>
            ) : (
              <div className="space-y-4">
                {results.map((r, i) => (
                  <div
                    key={i}
                    className={`bg-gray-800 rounded-lg p-4 ${
                      r.isError ? 'border border-red-500' : ''
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-blue-400">{r.tool}</span>
                      <span className="text-xs text-gray-500">{r.timestamp}</span>
                    </div>
                    <pre className="text-sm bg-gray-900 p-3 rounded overflow-x-auto">
                      {typeof r.result === 'object'
                        ? JSON.stringify(r.result, null, 2)
                        : String(r.result)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 底部说明 */}
        <div className="mt-12 bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">MCP 架构说明</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div>
              <h3 className="font-medium text-blue-400 mb-2">📡 MCP Server</h3>
              <p className="text-gray-400">
                定义和暴露工具、资源、提示词。可以是本地进程或远程服务。
              </p>
              <code className="text-xs text-green-400 block mt-2">
                src/examples/mcp/server.ts
              </code>
            </div>
            <div>
              <h3 className="font-medium text-green-400 mb-2">🔌 MCP Client</h3>
              <p className="text-gray-400">
                连接到 Server，发现并调用工具。通常由 AI 应用使用。
              </p>
              <code className="text-xs text-green-400 block mt-2">
                src/examples/mcp/client.ts
              </code>
            </div>
            <div>
              <h3 className="font-medium text-purple-400 mb-2">🌐 Web API</h3>
              <p className="text-gray-400">
                通过 REST API 暴露 MCP 功能，供前端或其他服务调用。
              </p>
              <code className="text-xs text-green-400 block mt-2">
                src/app/api/mcp/route.ts
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
