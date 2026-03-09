'use client'

import { useState } from 'react'

interface ApiAction {
  label: string
  action: string
  data?: Record<string, unknown>
  description: string
}

interface ApiGroup {
  title: string
  endpoint: string
  color: string
  actions: ApiAction[]
}

const API_GROUPS: ApiGroup[] = [
  {
    title: '批量操作',
    endpoint: '/api/db-practice/batch',
    color: 'bg-blue-500',
    actions: [
      { label: 'createMany 批量创建日志', action: 'createMany', description: '一次插入多条记录，返回 {count}' },
      { label: 'createMany 批量创建标签', action: 'createManyTags', description: 'skipDuplicates 跳过已存在的唯一记录' },
      { label: 'updateMany 批量更新状态', action: 'updateMany', description: '库存为0的商品自动标记 OUT_OF_STOCK' },
      { label: 'updateMany 超时订单取消', action: 'updateManyComplex', description: '30天前的待支付订单自动取消' },
      { label: 'deleteMany 清理过期日志', action: 'deleteMany', description: '删除7天前的操作日志' },
    ],
  },
  {
    title: '关联关系',
    endpoint: '/api/db-practice/relations',
    color: 'bg-green-500',
    actions: [
      { label: '嵌套创建 (Nested Create)', action: 'nestedCreate', description: '创建商品同时创建标签关联' },
      { label: 'connect 关联分类', action: 'connect', description: '自动确保分类存在，把分类关联到商品' },
      { label: 'disconnect 断开分类', action: 'disconnect', data: { productId: 1 }, description: '取消商品的分类关联' },
      { label: 'connectOrCreate 打标签', action: 'connectOrCreate', data: { productId: 1, tagName: '限量版' }, description: '标签存在就关联，不存在就创建' },
      { label: 'set 重置标签', action: 'setTags', data: { productId: 1, tagIds: [1, 2] }, description: '清空旧标签再设置新标签' },
      { label: 'include vs select 对比', action: 'queryStyles', description: '两种关联查询方式的区别' },
      { label: '深层嵌套查询 (4层)', action: 'deepNested', description: '分类→子分类→商品→标签' },
      { label: '_count 关联计数', action: 'relationCount', description: '统计每个分类下的商品数量' },
    ],
  },
  {
    title: '高级查询',
    endpoint: '/api/db-practice/advanced-query',
    color: 'bg-orange-500',
    actions: [
      { label: 'Cursor 游标分页', action: 'cursorPagination', data: { pageSize: 5 }, description: '大数据量分页，性能恒定' },
      { label: 'distinct 去重查询', action: 'distinct', description: '获取不重复的字段值' },
      { label: '复杂 WHERE 条件', action: 'complexWhere', description: 'AND/OR/NOT/in/contains 组合' },
      { label: '$queryRaw 原始SQL', action: 'rawQuery', data: { minPrice: 50 }, description: '窗口函数、复杂JOIN、月度统计' },
      { label: '$executeRaw 执行SQL', action: 'rawExecute', description: '批量更新浏览量（返回影响行数）' },
      { label: 'aggregate 聚合查询', action: 'aggregate', description: 'count/sum/avg/min/max' },
      { label: 'groupBy 分组 + having', action: 'groupBy', description: '按状态/用户/月份分组统计' },
      { label: '关联过滤 some/every/none', action: 'relationFilter', description: '根据关联表条件查主表' },
    ],
  },
  {
    title: '事务与并发',
    endpoint: '/api/db-practice/transaction',
    color: 'bg-red-500',
    actions: [
      { label: '交互式事务', action: 'interactive', data: { userId: 1, productId: 1, quantity: 1 }, description: '事务内有条件判断的复杂业务' },
      { label: '批量事务', action: 'sequential', description: '多个操作原子执行' },
      { label: '乐观锁 - 读取', action: 'optimisticLock', data: { productId: 1 }, description: '第一步：获取数据和版本号' },
      { label: '乐观锁 - 更新', action: 'optimisticLock', data: { productId: 1, newPrice: 299.99, version: 1 }, description: '第二步：带版本号更新（模拟冲突改 version 值）' },
      { label: '软删除', action: 'softDelete', data: { productId: 1 }, description: '标记 deletedAt 代替物理删除' },
      { label: '恢复软删除', action: 'softRestore', data: { productId: 1 }, description: '清空 deletedAt 恢复数据' },
      { label: '查询已删除数据', action: 'queryDeleted', description: '对比：正常/已删除/全部' },
      { label: '嵌套写入事务', action: 'nestedWrite', description: '创建用户同时创建文章（自动事务）' },
      { label: 'upsert 存在即更新', action: 'upsert', data: { email: 'test@test.com', name: '测试' }, description: '存在就更新，不存在就创建' },
    ],
  },
]

export default function DbPracticePage() {
  const [results, setResults] = useState<Array<{
    id: number
    group: string
    action: string
    status: 'loading' | 'success' | 'error'
    data?: unknown
    time?: number
  }>>([])
  const [editData, setEditData] = useState<Record<string, string>>({})

  const runAction = async (group: ApiGroup, act: ApiAction) => {
    const id = Date.now()
    const key = `${group.title}-${act.action}`
    const customData = editData[key]
    let body: Record<string, unknown> = { action: act.action }

    if (customData) {
      try {
        body = { action: act.action, data: JSON.parse(customData) }
      } catch {
        body = { action: act.action, data: act.data }
      }
    } else if (act.data) {
      body = { action: act.action, data: act.data }
    }

    setResults(prev => [{ id, group: group.title, action: act.label, status: 'loading' }, ...prev])

    const start = performance.now()
    try {
      const res = await fetch(group.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      const time = Math.round(performance.now() - start)
      setResults(prev => prev.map(r => r.id === id ? { ...r, status: res.ok ? 'success' : 'error', data, time } : r))
    } catch (err) {
      const time = Math.round(performance.now() - start)
      setResults(prev => prev.map(r => r.id === id ? { ...r, status: 'error', data: { error: String(err) }, time } : r))
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">数据库操作实战控制台</h1>
            <p className="text-gray-500 text-sm mt-1">覆盖 Prisma 日常所有数据库操作，每个按钮都可以直接执行</p>
          </div>
          <a href="/" className="text-blue-500 hover:underline text-sm">← 返回首页</a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左侧：操作面板 */}
          <div className="space-y-4">
            {API_GROUPS.map(group => (
              <div key={group.title} className="bg-white rounded-lg shadow-sm border">
                <div className={`${group.color} text-white px-4 py-2 rounded-t-lg text-sm font-semibold`}>
                  {group.title}
                </div>
                <div className="p-4 space-y-2">
                  {group.actions.map(act => {
                    const key = `${group.title}-${act.action}`
                    return (
                      <div key={act.action} className="flex items-start gap-2">
                        <button
                          onClick={() => runAction(group, act)}
                          className="shrink-0 px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs font-mono transition-colors border"
                        >
                          {act.label}
                        </button>
                        <span className="text-xs text-gray-400 pt-1 flex-1">{act.description}</span>
                        {act.data && (
                          <input
                            className="shrink-0 w-40 text-xs border rounded px-2 py-1 font-mono bg-gray-50"
                            placeholder="自定义 data (JSON)"
                            value={editData[key] || ''}
                            onChange={e => setEditData(prev => ({ ...prev, [key]: e.target.value }))}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* 右侧：结果面板 */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold text-sm">执行结果</h2>
              <button onClick={() => setResults([])} className="text-xs text-gray-400 hover:text-gray-600">清空</button>
            </div>
            {results.length === 0 && (
              <div className="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-400 text-sm">
                点击左侧按钮执行操作，结果会显示在这里
              </div>
            )}
            {results.map(r => (
              <div key={r.id} className={`bg-white rounded-lg shadow-sm border-l-4 ${
                r.status === 'loading' ? 'border-yellow-400' :
                r.status === 'success' ? 'border-green-400' : 'border-red-400'
              }`}>
                <div className="px-4 py-2 flex justify-between items-center border-b bg-gray-50">
                  <div className="text-xs">
                    <span className="font-semibold">[{r.group}]</span>
                    <span className="ml-2">{r.action}</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {r.status === 'loading' ? '执行中...' : `${r.time}ms`}
                  </div>
                </div>
                {r.data && (
                  <pre className="p-3 text-xs overflow-auto max-h-80 font-mono whitespace-pre-wrap text-gray-700">
                    {JSON.stringify(r.data, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 操作速查表 */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border p-6">
          <h2 className="font-bold text-lg mb-4">Prisma 数据库操作全量速查表</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div>
              <h3 className="font-semibold text-blue-600 mb-2">读操作</h3>
              <ul className="space-y-1 text-gray-600">
                <li><code className="bg-gray-100 px-1 rounded">findMany</code> — 查多条</li>
                <li><code className="bg-gray-100 px-1 rounded">findUnique</code> — 按唯一字段查单条</li>
                <li><code className="bg-gray-100 px-1 rounded">findFirst</code> — 按任意条件查单条</li>
                <li><code className="bg-gray-100 px-1 rounded">findUniqueOrThrow</code> — 查不到就报错</li>
                <li><code className="bg-gray-100 px-1 rounded">count</code> — 计数</li>
                <li><code className="bg-gray-100 px-1 rounded">aggregate</code> — 聚合(sum/avg/min/max)</li>
                <li><code className="bg-gray-100 px-1 rounded">groupBy</code> — 分组统计</li>
                <li><code className="bg-gray-100 px-1 rounded">$queryRaw</code> — 原始 SQL 查询</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-green-600 mb-2">写操作</h3>
              <ul className="space-y-1 text-gray-600">
                <li><code className="bg-gray-100 px-1 rounded">create</code> — 创建单条</li>
                <li><code className="bg-gray-100 px-1 rounded">createMany</code> — 批量创建</li>
                <li><code className="bg-gray-100 px-1 rounded">update</code> — 更新单条</li>
                <li><code className="bg-gray-100 px-1 rounded">updateMany</code> — 批量更新</li>
                <li><code className="bg-gray-100 px-1 rounded">upsert</code> — 存在即更新</li>
                <li><code className="bg-gray-100 px-1 rounded">delete</code> — 删除单条</li>
                <li><code className="bg-gray-100 px-1 rounded">deleteMany</code> — 批量删除</li>
                <li><code className="bg-gray-100 px-1 rounded">$executeRaw</code> — 原始 SQL 执行</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-purple-600 mb-2">关联 & 事务</h3>
              <ul className="space-y-1 text-gray-600">
                <li><code className="bg-gray-100 px-1 rounded">include</code> — 包含关联（全字段）</li>
                <li><code className="bg-gray-100 px-1 rounded">select</code> — 精确选择字段</li>
                <li><code className="bg-gray-100 px-1 rounded">connect</code> — 关联已有记录</li>
                <li><code className="bg-gray-100 px-1 rounded">connectOrCreate</code> — 有则联无则建</li>
                <li><code className="bg-gray-100 px-1 rounded">disconnect</code> — 断开关联</li>
                <li><code className="bg-gray-100 px-1 rounded">some/every/none</code> — 关联过滤</li>
                <li><code className="bg-gray-100 px-1 rounded">$transaction</code> — 事务</li>
                <li><code className="bg-gray-100 px-1 rounded">nested writes</code> — 嵌套写入</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
