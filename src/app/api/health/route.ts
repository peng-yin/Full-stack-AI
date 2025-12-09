import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'

interface HealthStatus {
  status: 'healthy' | 'unhealthy'
  timestamp: string
  services: {
    mysql: { status: 'up' | 'down'; latency?: number; error?: string }
    redis: { status: 'up' | 'down'; latency?: number; error?: string }
  }
}

export async function GET() {
  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      mysql: { status: 'down' },
      redis: { status: 'down' },
    },
  }

  // 检查 MySQL
  try {
    const start = Date.now()
    await prisma.$queryRaw`SELECT 1`
    health.services.mysql = {
      status: 'up',
      latency: Date.now() - start,
    }
  } catch (error) {
    health.status = 'unhealthy'
    health.services.mysql = {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }

  // 检查 Redis
  try {
    const start = Date.now()
    await redis.ping()
    health.services.redis = {
      status: 'up',
      latency: Date.now() - start,
    }
  } catch (error) {
    health.status = 'unhealthy'
    health.services.redis = {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }

  const statusCode = health.status === 'healthy' ? 200 : 503
  return NextResponse.json(health, { status: statusCode })
}
