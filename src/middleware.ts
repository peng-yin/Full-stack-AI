import { NextRequest, NextResponse } from 'next/server'

// 简单的内存限流（适用于单实例，生产环境建议在 API 路由中使用 Redis 限流）
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

// 限流配置
const RATE_LIMIT_CONFIG: Record<string, { limit: number; window: number }> = {
  default: { limit: 100, window: 60 },
  '/api/auth/login': { limit: 10, window: 60 },
  '/api/auth/signup': { limit: 5, window: 60 },
  '/api/auth/send-code': { limit: 3, window: 60 },
  '/api/users': { limit: 50, window: 60 },
  '/api/orders': { limit: 20, window: 60 },
}

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  if (forwarded) return forwarded.split(',')[0].trim()
  if (realIp) return realIp
  return '127.0.0.1'
}

function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now()
  const windowMs = windowSeconds * 1000
  
  const entry = rateLimitMap.get(key)
  
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs })
    return { allowed: true, remaining: limit - 1, resetIn: windowSeconds }
  }
  
  entry.count++
  const resetIn = Math.ceil((entry.resetTime - now) / 1000)
  
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetIn,
  }
}

// 定期清理过期的限流记录
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now > entry.resetTime) {
        rateLimitMap.delete(key)
      }
    }
  }, 60000)
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!pathname.startsWith('/api')) {
    return NextResponse.next()
  }

  if (pathname === '/api/health') {
    return NextResponse.next()
  }

  const config = RATE_LIMIT_CONFIG[pathname] || RATE_LIMIT_CONFIG.default
  const ip = getClientIP(request)
  const rateLimitKey = `${pathname}:${ip}`

  const { allowed, remaining, resetIn } = checkRateLimit(
    rateLimitKey,
    config.limit,
    config.window
  )

  const response = allowed
    ? NextResponse.next()
    : NextResponse.json(
        { error: 'Too many requests, please try again later' },
        { status: 429 }
      )

  response.headers.set('X-RateLimit-Limit', config.limit.toString())
  response.headers.set('X-RateLimit-Remaining', remaining.toString())
  response.headers.set('X-RateLimit-Reset', resetIn.toString())

  if (!allowed) {
    response.headers.set('Retry-After', resetIn.toString())
  }

  return response
}

export const config = {
  matcher: '/api/:path*',
}
