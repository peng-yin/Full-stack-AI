'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  id: number
  email: string
  name: string | null
  role: string
}

export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        setUser(data?.user || null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' })
      if (res.ok) {
        setUser(null)
        router.push('/login')
      }
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-4xl w-full">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold">Backend AI</h1>
            <p className="text-gray-600">
              Enterprise-grade Next.js backend with MySQL and Redis
            </p>
          </div>
          <div className="flex items-center gap-4">
            {loading ? (
              <span className="text-gray-400">加载中...</span>
            ) : user ? (
              <>
                <span className="text-gray-700">欢迎, {user.name || user.email}</span>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                  退出登录
                </button>
              </>
            ) : (
              <a
                href="/login"
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                登录
              </a>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 用户管理 */}
          <div className="bg-gray-100 p-6 rounded-lg">
            <h2 className="font-semibold mb-4 text-lg">👤 用户管理</h2>
            <div className="space-y-2 text-sm">
              <p><code className="bg-gray-200 px-2 py-1 rounded">GET /api/users</code> - 用户列表</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">POST /api/users</code> - 创建用户</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">GET /api/users/:id</code> - 用户详情</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">PUT /api/users/:id</code> - 更新用户</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">DELETE /api/users/:id</code> - 删除用户</p>
            </div>
          </div>

          {/* 商品管理 */}
          <div className="bg-gray-100 p-6 rounded-lg">
            <h2 className="font-semibold mb-4 text-lg">📦 商品管理</h2>
            <div className="space-y-2 text-sm">
              <p><code className="bg-gray-200 px-2 py-1 rounded">GET /api/products</code> - 商品列表</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">GET /api/products/hot</code> - 热门商品</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">POST /api/products</code> - 创建商品</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">GET /api/products/:id</code> - 商品详情</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">PUT /api/products/:id</code> - 更新商品</p>
            </div>
          </div>

          {/* 订单管理 */}
          <div className="bg-gray-100 p-6 rounded-lg">
            <h2 className="font-semibold mb-4 text-lg">🛒 订单管理</h2>
            <div className="space-y-2 text-sm">
              <p><code className="bg-gray-200 px-2 py-1 rounded">GET /api/orders</code> - 订单列表</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">POST /api/orders</code> - 创建订单</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">GET /api/orders/:id</code> - 订单详情</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">PUT /api/orders/:id</code> - 更新状态</p>
            </div>
          </div>

          {/* 购物车 */}
          <div className="bg-gray-100 p-6 rounded-lg">
            <h2 className="font-semibold mb-4 text-lg">🛍️ 购物车</h2>
            <div className="space-y-2 text-sm">
              <p><code className="bg-gray-200 px-2 py-1 rounded">GET /api/cart</code> - 获取购物车</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">POST /api/cart</code> - 添加商品</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">DELETE /api/cart</code> - 清空/删除</p>
            </div>
          </div>

          {/* 分类管理 */}
          <div className="bg-gray-100 p-6 rounded-lg">
            <h2 className="font-semibold mb-4 text-lg">📂 分类管理</h2>
            <div className="space-y-2 text-sm">
              <p><code className="bg-gray-200 px-2 py-1 rounded">GET /api/categories</code> - 分类列表</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">GET /api/categories?tree=true</code> - 分类树</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">POST /api/categories</code> - 创建分类</p>
            </div>
          </div>

          {/* 文章管理 */}
          <div className="bg-gray-100 p-6 rounded-lg">
            <h2 className="font-semibold mb-4 text-lg">📝 文章管理</h2>
            <div className="space-y-2 text-sm">
              <p><code className="bg-gray-200 px-2 py-1 rounded">GET /api/posts</code> - 文章列表</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">GET /api/posts?latest=true</code> - 最新文章</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">POST /api/posts</code> - 创建文章</p>
            </div>
          </div>

          {/* 统计与排行 */}
          <div className="bg-gray-100 p-6 rounded-lg">
            <h2 className="font-semibold mb-4 text-lg">📊 统计与排行</h2>
            <div className="space-y-2 text-sm">
              <p><code className="bg-gray-200 px-2 py-1 rounded">GET /api/stats</code> - 概览统计</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">GET /api/stats?type=daily</code> - 日统计</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">GET /api/stats?type=realtime</code> - 实时</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">GET /api/stats/ranking</code> - 排行榜</p>
            </div>
          </div>

          {/* 工作流引擎 */}
          <div className="bg-gray-100 p-6 rounded-lg">
            <h2 className="font-semibold mb-4 text-lg">🔄 工作流引擎</h2>
            <div className="space-y-2 text-sm">
              <p><code className="bg-gray-200 px-2 py-1 rounded">GET /api/orders/workflow</code> - 流程定义</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">POST /api/orders/workflow</code> - 启动工作流</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">PUT /api/orders/workflow</code> - 发送事件</p>
              <p className="mt-3">
                <a href="/workflow" className="inline-block px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">
                  打开工作流控制台 →
                </a>
              </p>
            </div>
          </div>

          {/* 数据库操作实战 */}
          <div className="bg-gray-100 p-6 rounded-lg">
            <h2 className="font-semibold mb-4 text-lg">🗄️ 数据库操作实战</h2>
            <div className="space-y-2 text-sm">
              <p><code className="bg-gray-200 px-2 py-1 rounded">POST /api/db-practice/batch</code> - 批量操作</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">POST /api/db-practice/relations</code> - 关联关系</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">POST /api/db-practice/advanced-query</code> - 高级查询</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">POST /api/db-practice/transaction</code> - 事务并发</p>
              <p className="mt-3">
                <a href="/db-practice" className="inline-block px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors">
                  打开数据库实战控制台 →
                </a>
              </p>
            </div>
          </div>

          {/* 系统 */}
          <div className="bg-gray-100 p-6 rounded-lg">
            <h2 className="font-semibold mb-4 text-lg">⚙️ 系统</h2>
            <div className="space-y-2 text-sm">
              <p><code className="bg-gray-200 px-2 py-1 rounded">GET /api/health</code> - 健康检查</p>
              <p><code className="bg-gray-200 px-2 py-1 rounded">POST /api/auth/login</code> - 登录</p>
            </div>
          </div>
        </div>

        <div className="mt-8 p-6 bg-blue-50 rounded-lg">
          <h2 className="font-semibold mb-4 text-lg">🎯 Redis 使用场景演示</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>• <strong>缓存穿透防护</strong>: 商品详情 API 缓存空值</li>
            <li>• <strong>缓存击穿防护</strong>: 热门商品使用分布式锁重建缓存</li>
            <li>• <strong>缓存雪崩防护</strong>: 商品列表使用随机过期时间</li>
            <li>• <strong>分布式锁</strong>: 订单创建时锁定库存防止超卖</li>
            <li>• <strong>排行榜</strong>: 使用 Sorted Set 实现销量/浏览排行</li>
            <li>• <strong>计数器</strong>: 浏览量异步累积后批量写入数据库</li>
            <li>• <strong>限流</strong>: 中间件实现固定窗口限流</li>
            <li>• <strong>购物车</strong>: 使用 Hash 存储购物车数据</li>
            <li>• <strong>最新列表</strong>: 使用 List 维护最新文章</li>
            <li>• <strong>日期统计</strong>: 按日期 key 统计订单数量</li>
          </ul>
        </div>
      </div>
    </main>
  )
}
