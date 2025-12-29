/**
 * RabbitMQ 演示 API
 * 展示各种消息队列模式
 */

import { NextRequest, NextResponse } from 'next/server'
import { rabbitmqService } from '@/lib/rabbitmq.service'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  try {
    switch (action) {
      // 获取队列信息
      case 'queue-info': {
        const queue = searchParams.get('queue') || 'test-queue'
        const info = await rabbitmqService.getQueueInfo(queue)
        return NextResponse.json({ success: true, data: info })
      }

      // 简单消费（获取一条消息）
      case 'consume-one': {
        const queue = searchParams.get('queue') || 'test-queue'
        let message: any = null

        // 创建临时消费者获取一条消息
        const consumerTag = await rabbitmqService.consumeQueue(queue, async (msg) => {
          message = msg
        }, { prefetch: 1 })

        // 等待一小段时间
        await new Promise(resolve => setTimeout(resolve, 100))
        await rabbitmqService.cancelConsumer(consumerTag)

        return NextResponse.json({ success: true, data: { message } })
      }

      default:
        return NextResponse.json({
          success: true,
          message: 'RabbitMQ Demo API',
          availableActions: [
            'queue-info - 获取队列信息',
          ],
          postActions: [
            'send-simple - 简单队列发送',
            'send-priority - 优先级消息',
            'send-delayed - 延迟消息',
            'publish - 发布订阅',
            'send-topic - 主题模式',
            'rpc-call - RPC 调用',
          ]
        })
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, data } = body

    switch (action) {
      // 1. 简单队列 - 发送消息
      case 'send-simple': {
        const { queue = 'test-queue', message } = data
        const result = await rabbitmqService.sendToQueue(queue, message)
        return NextResponse.json({
          success: true,
          data: { sent: result, queue, message }
        })
      }

      // 2. 工作队列 - 发送任务
      case 'send-task': {
        const { queue = 'task-queue', task } = data
        const result = await rabbitmqService.sendTask(queue, task)
        return NextResponse.json({
          success: true,
          data: { sent: result, queue, task }
        })
      }

      // 3. 优先级队列 - 发送优先级消息
      case 'send-priority': {
        const { queue = 'priority-queue', message, priority = 5 } = data
        const result = await rabbitmqService.sendToQueue(queue, message, { priority })
        return NextResponse.json({
          success: true,
          data: { sent: result, queue, message, priority }
        })
      }

      // 4. 延迟队列 - 发送延迟消息
      case 'send-delayed': {
        const { queue = 'delayed-queue', message, delayMs = 5000 } = data
        const result = await rabbitmqService.sendDelayed(queue, message, delayMs)
        return NextResponse.json({
          success: true,
          data: {
            sent: result,
            queue,
            message,
            delayMs,
            executeAt: new Date(Date.now() + delayMs).toISOString()
          }
        })
      }

      // 5. 发布订阅 - 广播消息
      case 'publish': {
        const { exchange = 'broadcast', message } = data
        const result = await rabbitmqService.publish(exchange, message)
        return NextResponse.json({
          success: true,
          data: { published: result, exchange, message }
        })
      }

      // 6. 路由模式 - 发送带路由键的消息
      case 'send-routing': {
        const { exchange = 'logs', routingKey = 'info', message } = data
        const result = await rabbitmqService.sendWithRouting(exchange, routingKey, message)
        return NextResponse.json({
          success: true,
          data: { sent: result, exchange, routingKey, message }
        })
      }

      // 7. 主题模式 - 发送主题消息
      case 'send-topic': {
        const { exchange = 'events', topic = 'order.created', message } = data
        const result = await rabbitmqService.sendTopic(exchange, topic, message)
        return NextResponse.json({
          success: true,
          data: { sent: result, exchange, topic, message }
        })
      }

      // 8. RPC 调用
      case 'rpc-call': {
        const { queue = 'rpc-queue', request, timeout = 5000 } = data

        // 先启动一个模拟的 RPC 服务器
        const serverTag = await rabbitmqService.rpcServer(queue, async (req) => {
          // 模拟处理：将数字翻倍
          if (typeof req.number === 'number') {
            return { result: req.number * 2, processed: true }
          }
          return { echo: req, processed: true }
        })

        try {
          const response = await rabbitmqService.rpcCall(queue, request, timeout)
          return NextResponse.json({
            success: true,
            data: { request, response }
          })
        } finally {
          await rabbitmqService.cancelConsumer(serverTag)
        }
      }

      // 清空队列
      case 'purge': {
        const { queue } = data
        const count = await rabbitmqService.purgeQueue(queue)
        return NextResponse.json({
          success: true,
          data: { queue, purgedCount: count }
        })
      }

      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}`
        }, { status: 400 })
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}
