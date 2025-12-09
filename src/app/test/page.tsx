'use client'

import { useState } from 'react'

interface ApiResult {
  status: number
  data: unknown
  time: number
  source?: string
}

export default function TestPage() {
  const [results, setResults] = useState<Record<string, ApiResult>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [customBody, setCustomBody] = useState<Record<string, string>>({})

  const callApi = async (key: string, method: string, url: string, body?: unknown) => {
    setLoading(prev => ({ ...prev, [key]: true }))
    const start = Date.now()
    
    try {
      const options: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json' },
      }
      if (body) {
        options.body = JSON.stringify(body)
      }
      
      const res = await fetch(url, options)
      const data = await res.json()
      
      setResults(prev => ({
        ...prev,
        [key]: {
          status: res.status,
          data,
          time: Date.now() - start,
          source: data.source,
        },
      }))
    } catch (error) {
      setResults(prev => ({
        ...prev,
        [key]: {
          status: 0,
          data: { error: String(error) },
          time: Date.now() - start,
        },
      }))
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }))
    }
  }

  const ResultDisplay = ({ resultKey }: { resultKey: string }) => {
    const result = results[resultKey]
    if (!result) return null
    
    const statusColor = result.status >= 200 && result.status < 300 
      ? 'text-green-600' 
      : result.status >= 400 
        ? 'text-red-600' 
        : 'text-yellow-600'
    
    return (
      <div className="mt-2 p-3 bg-gray-900 rounded text-sm overflow-auto max-h-48">
        <div className="flex gap-4 mb-2 text-xs">
          <span className={statusColor}>Status: {result.status}</span>
          <span className="text-gray-400">Time: {result.time}ms</span>
          {result.source && (
            <span className={result.source === 'cache' ? 'text-green-400' : 'text-blue-400'}>
              Source: {result.source}
            </span>
          )}
        </div>
        <pre className="text-gray-300 text-xs whitespace-pre-wrap">
          {JSON.stringify(result.data, null, 2)}
        </pre>
      </div>
    )
  }

  const ApiButton = ({ 
    label, 
    onClick, 
    loading: isLoading,
    variant = 'primary' 
  }: { 
    label: string
    onClick: () => void
    loading?: boolean
    variant?: 'primary' | 'success' | 'danger' | 'warning'
  }) => {
    const colors = {
      primary: 'bg-blue-500 hover:bg-blue-600',
      success: 'bg-green-500 hover:bg-green-600',
      danger: 'bg-red-500 hover:bg-red-600',
      warning: 'bg-yellow-500 hover:bg-yellow-600',
    }
    
    return (
      <button
        onClick={onClick}
        disabled={isLoading}
        className={`px-3 py-1.5 text-white text-sm rounded ${colors[variant]} disabled:opacity-50 transition`}
      >
        {isLoading ? '...' : label}
      </button>
    )
  }

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">🧪 API 测试面板</h1>
        <p className="text-gray-600 mb-6">点击按钮测试各个 API，观察缓存效果</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* 健康检查 */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">⚙️ 健康检查</h2>
            <div className="flex gap-2">
              <ApiButton 
                label="GET /api/health" 
                onClick={() => callApi('health', 'GET', '/api/health')}
                loading={loading.health}
              />
            </div>
            <ResultDisplay resultKey="health" />
          </div>

          {/* 用户管理 */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">👤 用户管理</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              <ApiButton 
                label="获取列表" 
                onClick={() => callApi('users', 'GET', '/api/users')}
                loading={loading.users}
              />
              <ApiButton 
                label="搜索 test" 
                onClick={() => callApi('users-search', 'GET', '/api/users?search=test')}
                loading={loading['users-search']}
                variant="warning"
              />
              <ApiButton 
                label="获取用户1" 
                onClick={() => callApi('user-1', 'GET', '/api/users/1')}
                loading={loading['user-1']}
              />
            </div>
            <div className="mb-3">
              <textarea
                className="w-full p-2 border rounded text-sm font-mono"
                rows={3}
                placeholder='{"email":"test@example.com","name":"Test","password":"123456"}'
                value={customBody.createUser || '{"email":"test@example.com","name":"Test User","password":"123456"}'}
                onChange={(e) => setCustomBody(prev => ({ ...prev, createUser: e.target.value }))}
              />
              <ApiButton 
                label="创建用户" 
                onClick={() => {
                  try {
                    const body = JSON.parse(customBody.createUser || '{"email":"test@example.com","name":"Test User","password":"123456"}')
                    callApi('create-user', 'POST', '/api/users', body)
                  } catch {
                    alert('JSON 格式错误')
                  }
                }}
                loading={loading['create-user']}
                variant="success"
              />
            </div>
            <ResultDisplay resultKey="users" />
            <ResultDisplay resultKey="users-search" />
            <ResultDisplay resultKey="user-1" />
            <ResultDisplay resultKey="create-user" />
          </div>

          {/* 分类管理 */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">📂 分类管理</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              <ApiButton 
                label="分类列表" 
                onClick={() => callApi('categories', 'GET', '/api/categories')}
                loading={loading.categories}
              />
              <ApiButton 
                label="分类树" 
                onClick={() => callApi('categories-tree', 'GET', '/api/categories?tree=true')}
                loading={loading['categories-tree']}
                variant="warning"
              />
            </div>
            <div className="mb-3">
              <textarea
                className="w-full p-2 border rounded text-sm font-mono"
                rows={2}
                value={customBody.createCategory || '{"name":"电子产品","description":"电子数码产品"}'}
                onChange={(e) => setCustomBody(prev => ({ ...prev, createCategory: e.target.value }))}
              />
              <ApiButton 
                label="创建分类" 
                onClick={() => {
                  try {
                    const body = JSON.parse(customBody.createCategory || '{"name":"电子产品"}')
                    callApi('create-category', 'POST', '/api/categories', body)
                  } catch {
                    alert('JSON 格式错误')
                  }
                }}
                loading={loading['create-category']}
                variant="success"
              />
            </div>
            <ResultDisplay resultKey="categories" />
            <ResultDisplay resultKey="categories-tree" />
            <ResultDisplay resultKey="create-category" />
          </div>

          {/* 商品管理 */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">📦 商品管理</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              <ApiButton 
                label="商品列表" 
                onClick={() => callApi('products', 'GET', '/api/products')}
                loading={loading.products}
              />
              <ApiButton 
                label="热门商品" 
                onClick={() => callApi('products-hot', 'GET', '/api/products/hot')}
                loading={loading['products-hot']}
                variant="warning"
              />
              <ApiButton 
                label="商品1详情" 
                onClick={() => callApi('product-1', 'GET', '/api/products/1')}
                loading={loading['product-1']}
              />
              <ApiButton 
                label="不存在商品" 
                onClick={() => callApi('product-999', 'GET', '/api/products/99999')}
                loading={loading['product-999']}
                variant="danger"
              />
            </div>
            <div className="mb-3">
              <textarea
                className="w-full p-2 border rounded text-sm font-mono"
                rows={2}
                value={customBody.createProduct || '{"name":"iPhone 15","price":7999,"stock":100}'}
                onChange={(e) => setCustomBody(prev => ({ ...prev, createProduct: e.target.value }))}
              />
              <ApiButton 
                label="创建商品" 
                onClick={() => {
                  try {
                    const body = JSON.parse(customBody.createProduct || '{"name":"iPhone 15","price":7999,"stock":100}')
                    callApi('create-product', 'POST', '/api/products', body)
                  } catch {
                    alert('JSON 格式错误')
                  }
                }}
                loading={loading['create-product']}
                variant="success"
              />
            </div>
            <ResultDisplay resultKey="products" />
            <ResultDisplay resultKey="products-hot" />
            <ResultDisplay resultKey="product-1" />
            <ResultDisplay resultKey="product-999" />
            <ResultDisplay resultKey="create-product" />
          </div>

          {/* 购物车 */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">🛒 购物车</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              <ApiButton 
                label="查看购物车(用户1)" 
                onClick={() => callApi('cart', 'GET', '/api/cart?userId=1')}
                loading={loading.cart}
              />
              <ApiButton 
                label="清空购物车" 
                onClick={() => callApi('cart-clear', 'DELETE', '/api/cart?userId=1')}
                loading={loading['cart-clear']}
                variant="danger"
              />
            </div>
            <div className="mb-3">
              <textarea
                className="w-full p-2 border rounded text-sm font-mono"
                rows={2}
                value={customBody.addCart || '{"userId":1,"productId":1,"quantity":2}'}
                onChange={(e) => setCustomBody(prev => ({ ...prev, addCart: e.target.value }))}
              />
              <ApiButton 
                label="添加到购物车" 
                onClick={() => {
                  try {
                    const body = JSON.parse(customBody.addCart || '{"userId":1,"productId":1,"quantity":2}')
                    callApi('add-cart', 'POST', '/api/cart', body)
                  } catch {
                    alert('JSON 格式错误')
                  }
                }}
                loading={loading['add-cart']}
                variant="success"
              />
            </div>
            <ResultDisplay resultKey="cart" />
            <ResultDisplay resultKey="add-cart" />
            <ResultDisplay resultKey="cart-clear" />
          </div>

          {/* 订单管理 */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">🧾 订单管理</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              <ApiButton 
                label="订单列表" 
                onClick={() => callApi('orders', 'GET', '/api/orders')}
                loading={loading.orders}
              />
              <ApiButton 
                label="用户1的订单" 
                onClick={() => callApi('orders-user1', 'GET', '/api/orders?userId=1')}
                loading={loading['orders-user1']}
              />
              <ApiButton 
                label="订单1详情" 
                onClick={() => callApi('order-1', 'GET', '/api/orders/1')}
                loading={loading['order-1']}
              />
            </div>
            <div className="mb-3">
              <textarea
                className="w-full p-2 border rounded text-sm font-mono"
                rows={3}
                value={customBody.createOrder || '{"userId":1,"items":[{"productId":1,"quantity":1}],"address":"北京市朝阳区xxx"}'}
                onChange={(e) => setCustomBody(prev => ({ ...prev, createOrder: e.target.value }))}
              />
              <ApiButton 
                label="创建订单(演示分布式锁)" 
                onClick={() => {
                  try {
                    const body = JSON.parse(customBody.createOrder || '{"userId":1,"items":[{"productId":1,"quantity":1}],"address":"北京市"}')
                    callApi('create-order', 'POST', '/api/orders', body)
                  } catch {
                    alert('JSON 格式错误')
                  }
                }}
                loading={loading['create-order']}
                variant="success"
              />
            </div>
            <div className="mb-3">
              <div className="flex gap-2">
                <input
                  type="number"
                  className="w-20 p-2 border rounded text-sm"
                  placeholder="订单ID"
                  value={customBody.orderId || '1'}
                  onChange={(e) => setCustomBody(prev => ({ ...prev, orderId: e.target.value }))}
                />
                <select
                  className="p-2 border rounded text-sm"
                  value={customBody.orderStatus || 'PAID'}
                  onChange={(e) => setCustomBody(prev => ({ ...prev, orderStatus: e.target.value }))}
                >
                  <option value="PAID">已支付</option>
                  <option value="SHIPPED">已发货</option>
                  <option value="COMPLETED">已完成</option>
                  <option value="CANCELLED">取消</option>
                </select>
                <ApiButton 
                  label="更新状态" 
                  onClick={() => {
                    const orderId = customBody.orderId || '1'
                    const status = customBody.orderStatus || 'PAID'
                    callApi('update-order', 'PUT', `/api/orders/${orderId}`, { status })
                  }}
                  loading={loading['update-order']}
                  variant="warning"
                />
              </div>
            </div>
            <ResultDisplay resultKey="orders" />
            <ResultDisplay resultKey="orders-user1" />
            <ResultDisplay resultKey="order-1" />
            <ResultDisplay resultKey="create-order" />
            <ResultDisplay resultKey="update-order" />
          </div>

          {/* 文章管理 */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">📝 文章管理</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              <ApiButton 
                label="文章列表" 
                onClick={() => callApi('posts', 'GET', '/api/posts')}
                loading={loading.posts}
              />
              <ApiButton 
                label="最新文章(List)" 
                onClick={() => callApi('posts-latest', 'GET', '/api/posts?latest=true')}
                loading={loading['posts-latest']}
                variant="warning"
              />
            </div>
            <div className="mb-3">
              <textarea
                className="w-full p-2 border rounded text-sm font-mono"
                rows={2}
                value={customBody.createPost || '{"title":"测试文章","content":"这是内容","authorId":1,"published":true}'}
                onChange={(e) => setCustomBody(prev => ({ ...prev, createPost: e.target.value }))}
              />
              <ApiButton 
                label="创建文章" 
                onClick={() => {
                  try {
                    const body = JSON.parse(customBody.createPost || '{"title":"测试文章","authorId":1,"published":true}')
                    callApi('create-post', 'POST', '/api/posts', body)
                  } catch {
                    alert('JSON 格式错误')
                  }
                }}
                loading={loading['create-post']}
                variant="success"
              />
            </div>
            <ResultDisplay resultKey="posts" />
            <ResultDisplay resultKey="posts-latest" />
            <ResultDisplay resultKey="create-post" />
          </div>

          {/* 统计与排行 */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">📊 统计与排行</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              <ApiButton 
                label="概览统计" 
                onClick={() => callApi('stats', 'GET', '/api/stats')}
                loading={loading.stats}
              />
              <ApiButton 
                label="日统计(7天)" 
                onClick={() => callApi('stats-daily', 'GET', '/api/stats?type=daily&days=7')}
                loading={loading['stats-daily']}
              />
              <ApiButton 
                label="实时统计" 
                onClick={() => callApi('stats-realtime', 'GET', '/api/stats?type=realtime')}
                loading={loading['stats-realtime']}
                variant="warning"
              />
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              <ApiButton 
                label="销量排行" 
                onClick={() => callApi('ranking-sales', 'GET', '/api/stats/ranking?type=sales')}
                loading={loading['ranking-sales']}
              />
              <ApiButton 
                label="浏览排行" 
                onClick={() => callApi('ranking-views', 'GET', '/api/stats/ranking?type=views')}
                loading={loading['ranking-views']}
              />
              <ApiButton 
                label="用户消费排行" 
                onClick={() => callApi('ranking-users', 'GET', '/api/stats/ranking?type=users')}
                loading={loading['ranking-users']}
              />
            </div>
            <ResultDisplay resultKey="stats" />
            <ResultDisplay resultKey="stats-daily" />
            <ResultDisplay resultKey="stats-realtime" />
            <ResultDisplay resultKey="ranking-sales" />
            <ResultDisplay resultKey="ranking-views" />
            <ResultDisplay resultKey="ranking-users" />
          </div>

          {/* 缓存测试 */}
          <div className="bg-white p-6 rounded-lg shadow lg:col-span-2">
            <h2 className="text-lg font-semibold mb-4">🚀 缓存效果测试</h2>
            <p className="text-sm text-gray-600 mb-4">
              连续点击同一个 API，观察 <code className="bg-gray-100 px-1">source</code> 字段变化（database → cache）和响应时间变化
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              <ApiButton 
                label="连续请求商品列表 x5" 
                onClick={async () => {
                  for (let i = 0; i < 5; i++) {
                    await callApi(`cache-test-${i}`, 'GET', '/api/products')
                    await new Promise(r => setTimeout(r, 100))
                  }
                }}
                loading={loading['cache-test-0']}
                variant="warning"
              />
              <ApiButton 
                label="连续请求商品详情 x5" 
                onClick={async () => {
                  for (let i = 0; i < 5; i++) {
                    await callApi(`cache-detail-${i}`, 'GET', '/api/products/1')
                    await new Promise(r => setTimeout(r, 100))
                  }
                }}
                loading={loading['cache-detail-0']}
                variant="warning"
              />
            </div>
            <div className="grid grid-cols-5 gap-2">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} className="text-xs">
                  <div className="font-semibold">请求 {i + 1}</div>
                  {results[`cache-test-${i}`] && (
                    <div>
                      <div className={results[`cache-test-${i}`].source === 'cache' ? 'text-green-600' : 'text-blue-600'}>
                        {results[`cache-test-${i}`].source}
                      </div>
                      <div className="text-gray-500">{results[`cache-test-${i}`].time}ms</div>
                    </div>
                  )}
                  {results[`cache-detail-${i}`] && (
                    <div>
                      <div className={results[`cache-detail-${i}`].source === 'cache' ? 'text-green-600' : 'text-blue-600'}>
                        {results[`cache-detail-${i}`].source}
                      </div>
                      <div className="text-gray-500">{results[`cache-detail-${i}`].time}ms</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>

        <div className="mt-6 p-4 bg-yellow-50 rounded-lg text-sm">
          <h3 className="font-semibold mb-2">💡 测试提示</h3>
          <ul className="space-y-1 text-gray-700">
            <li>• 首次请求会从数据库获取（source: database），后续请求从缓存获取（source: cache）</li>
            <li>• 创建/更新/删除操作会自动清除相关缓存</li>
            <li>• 查看响应头中的 <code className="bg-gray-100 px-1">X-RateLimit-*</code> 了解限流状态</li>
            <li>• 快速连续请求同一接口可能触发限流（429 状态码）</li>
            <li>• 请求不存在的商品会缓存空值（防止缓存穿透）</li>
          </ul>
        </div>
      </div>
    </main>
  )
}
