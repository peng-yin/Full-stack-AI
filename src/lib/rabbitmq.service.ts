/**
 * RabbitMQ 消息队列服务
 * 企业级消息队列实现，与 Redis 队列形成对比学习
 *
 * RabbitMQ vs Redis 队列:
 * - RabbitMQ: 专业 MQ，支持复杂路由、持久化、事务、集群
 * - Redis: 轻量级，适合简单场景，已有 Redis 时零成本
 */

import amqplib, { Channel, ConsumeMessage } from 'amqplib'

export class RabbitMQService {
  private connection: any = null
  private channel: Channel | null = null
  private url: string

  constructor(url: string = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672') {
    this.url = url
  }

  /**
   * ==================== 连接管理 ====================
   */

  // 建立连接
  async connect(): Promise<void> {
    if (this.connection) return

    this.connection = await amqplib.connect(this.url)
    this.channel = await this.connection.createChannel()

    // 连接错误处理
    this.connection.on('error', (err: Error) => {
      console.error('RabbitMQ connection error:', err)
      this.connection = null
      this.channel = null
    })

    this.connection.on('close', () => {
      console.log('RabbitMQ connection closed')
      this.connection = null
      this.channel = null
    })
  }

  // 关闭连接
  async close(): Promise<void> {
    if (this.channel) {
      await this.channel.close()
      this.channel = null
    }
    if (this.connection) {
      await this.connection.close()
      this.connection = null
    }
  }

  // 获取 channel
  private async getChannel(): Promise<Channel> {
    if (!this.channel) {
      await this.connect()
    }
    return this.channel!
  }

  /**
   * ==================== 1. 简单队列 (点对点) ====================
   * 一个生产者 → 一个队列 → 一个消费者
   * 适用: 任务分发、异步处理
   */

  // 发送消息到队列
  async sendToQueue(queueName: string, message: any, options?: {
    persistent?: boolean  // 持久化消息
    expiration?: string   // 消息过期时间(ms)
    priority?: number     // 优先级 0-255
  }): Promise<boolean> {
    const channel = await this.getChannel()

    // 声明队列 (幂等操作)
    await channel.assertQueue(queueName, {
      durable: true,        // 队列持久化
      maxPriority: 10       // 支持优先级
    })

    const content = Buffer.from(JSON.stringify(message))

    return channel.sendToQueue(queueName, content, {
      persistent: options?.persistent ?? true,
      expiration: options?.expiration,
      priority: options?.priority,
      timestamp: Date.now(),
      messageId: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    })
  }

  // 消费队列消息
  async consumeQueue(
    queueName: string,
    handler: (message: any, msg: ConsumeMessage) => Promise<void>,
    options?: {
      prefetch?: number   // 预取数量，控制并发
      noAck?: boolean     // 是否自动确认
    }
  ): Promise<string> {
    const channel = await this.getChannel()

    await channel.assertQueue(queueName, { durable: true, maxPriority: 10 })

    // 设置预取，实现公平分发
    if (options?.prefetch) {
      await channel.prefetch(options.prefetch)
    }

    const { consumerTag } = await channel.consume(queueName, async (msg) => {
      if (!msg) return

      try {
        const content = JSON.parse(msg.content.toString())
        await handler(content, msg)

        // 手动确认
        if (!options?.noAck) {
          channel.ack(msg)
        }
      } catch (error) {
        console.error('Message processing error:', error)
        // 拒绝消息，重新入队
        if (!options?.noAck) {
          channel.nack(msg, false, true)
        }
      }
    }, { noAck: options?.noAck ?? false })

    return consumerTag
  }

  /**
   * ==================== 2. 工作队列 (竞争消费) ====================
   * 一个生产者 → 一个队列 → 多个消费者
   * 适用: 任务并行处理、负载均衡
   */

  // 发送工作任务
  async sendTask(queueName: string, task: any): Promise<boolean> {
    return this.sendToQueue(queueName, {
      id: `task-${Date.now()}`,
      data: task,
      createdAt: new Date().toISOString()
    }, { persistent: true })
  }

  // 启动工作者
  async startWorker(
    queueName: string,
    handler: (task: any) => Promise<void>,
    concurrency: number = 1
  ): Promise<string> {
    return this.consumeQueue(queueName, async (content) => {
      console.log(`Processing task: ${content.id}`)
      await handler(content.data)
      console.log(`Task completed: ${content.id}`)
    }, { prefetch: concurrency })
  }

  /**
   * ==================== 3. 发布/订阅 (Fanout Exchange) ====================
   * 一个生产者 → Exchange → 多个队列 → 多个消费者
   * 适用: 广播通知、日志分发
   */

  // 发布消息到所有订阅者
  async publish(exchangeName: string, message: any): Promise<boolean> {
    const channel = await this.getChannel()

    // 声明 fanout 类型交换机
    await channel.assertExchange(exchangeName, 'fanout', { durable: true })

    const content = Buffer.from(JSON.stringify(message))

    return channel.publish(exchangeName, '', content, {
      persistent: true,
      timestamp: Date.now()
    })
  }

  // 订阅消息
  async subscribe(
    exchangeName: string,
    handler: (message: any) => Promise<void>
  ): Promise<string> {
    const channel = await this.getChannel()

    await channel.assertExchange(exchangeName, 'fanout', { durable: true })

    // 创建临时队列
    const { queue } = await channel.assertQueue('', { exclusive: true })

    // 绑定队列到交换机
    await channel.bindQueue(queue, exchangeName, '')

    const { consumerTag } = await channel.consume(queue, async (msg) => {
      if (!msg) return

      try {
        const content = JSON.parse(msg.content.toString())
        await handler(content)
        channel.ack(msg)
      } catch (error) {
        console.error('Subscribe handler error:', error)
        channel.nack(msg, false, false)
      }
    })

    return consumerTag
  }

  /**
   * ==================== 4. 路由模式 (Direct Exchange) ====================
   * 根据 routing key 精确匹配
   * 适用: 日志级别分发、多租户消息
   */

  // 发送带路由键的消息
  async sendWithRouting(
    exchangeName: string,
    routingKey: string,
    message: any
  ): Promise<boolean> {
    const channel = await this.getChannel()

    await channel.assertExchange(exchangeName, 'direct', { durable: true })

    const content = Buffer.from(JSON.stringify(message))

    return channel.publish(exchangeName, routingKey, content, {
      persistent: true
    })
  }

  // 订阅特定路由键
  async subscribeWithRouting(
    exchangeName: string,
    routingKeys: string[],
    handler: (message: any, routingKey: string) => Promise<void>
  ): Promise<string> {
    const channel = await this.getChannel()

    await channel.assertExchange(exchangeName, 'direct', { durable: true })

    const { queue } = await channel.assertQueue('', { exclusive: true })

    // 绑定多个路由键
    for (const key of routingKeys) {
      await channel.bindQueue(queue, exchangeName, key)
    }

    const { consumerTag } = await channel.consume(queue, async (msg) => {
      if (!msg) return

      try {
        const content = JSON.parse(msg.content.toString())
        await handler(content, msg.fields.routingKey)
        channel.ack(msg)
      } catch (error) {
        console.error('Routing handler error:', error)
        channel.nack(msg, false, false)
      }
    })

    return consumerTag
  }

  /**
   * ==================== 5. 主题模式 (Topic Exchange) ====================
   * 支持通配符匹配: * 匹配一个词, # 匹配多个词
   * 适用: 复杂的消息路由、事件系统
   */

  // 发送主题消息
  async sendTopic(
    exchangeName: string,
    topic: string,  // 如: order.created, user.login.success
    message: any
  ): Promise<boolean> {
    const channel = await this.getChannel()

    await channel.assertExchange(exchangeName, 'topic', { durable: true })

    const content = Buffer.from(JSON.stringify(message))

    return channel.publish(exchangeName, topic, content, {
      persistent: true
    })
  }

  // 订阅主题 (支持通配符)
  async subscribeTopic(
    exchangeName: string,
    pattern: string,  // 如: order.*, user.#, *.error
    handler: (message: any, topic: string) => Promise<void>
  ): Promise<string> {
    const channel = await this.getChannel()

    await channel.assertExchange(exchangeName, 'topic', { durable: true })

    const { queue } = await channel.assertQueue('', { exclusive: true })
    await channel.bindQueue(queue, exchangeName, pattern)

    const { consumerTag } = await channel.consume(queue, async (msg) => {
      if (!msg) return

      try {
        const content = JSON.parse(msg.content.toString())
        await handler(content, msg.fields.routingKey)
        channel.ack(msg)
      } catch (error) {
        console.error('Topic handler error:', error)
        channel.nack(msg, false, false)
      }
    })

    return consumerTag
  }

  /**
   * ==================== 6. 延迟队列 (Dead Letter Exchange) ====================
   * 使用 TTL + DLX 实现延迟消息
   * 适用: 订单超时取消、延迟通知
   */

  // 发送延迟消息
  async sendDelayed(
    queueName: string,
    message: any,
    delayMs: number
  ): Promise<boolean> {
    const channel = await this.getChannel()

    const delayQueueName = `${queueName}.delay.${delayMs}`
    const dlxExchange = `${queueName}.dlx`

    // 声明死信交换机
    await channel.assertExchange(dlxExchange, 'direct', { durable: true })

    // 声明目标队列
    await channel.assertQueue(queueName, { durable: true })
    await channel.bindQueue(queueName, dlxExchange, queueName)

    // 声明延迟队列 (带 TTL 和 DLX)
    await channel.assertQueue(delayQueueName, {
      durable: true,
      deadLetterExchange: dlxExchange,
      deadLetterRoutingKey: queueName,
      messageTtl: delayMs
    })

    const content = Buffer.from(JSON.stringify({
      data: message,
      delayMs,
      scheduledAt: new Date(Date.now() + delayMs).toISOString(),
      createdAt: new Date().toISOString()
    }))

    return channel.sendToQueue(delayQueueName, content, { persistent: true })
  }

  /**
   * ==================== 7. RPC 模式 (请求/响应) ====================
   * 同步风格的异步调用
   * 适用: 微服务间调用、远程计算
   */

  // RPC 客户端 - 发送请求并等待响应
  async rpcCall(queueName: string, request: any, timeout: number = 30000): Promise<any> {
    const channel = await this.getChannel()

    // 创建回复队列
    const { queue: replyQueue } = await channel.assertQueue('', { exclusive: true })

    const correlationId = `rpc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('RPC timeout'))
      }, timeout)

      // 监听回复
      channel.consume(replyQueue, (msg) => {
        if (!msg) return

        if (msg.properties.correlationId === correlationId) {
          clearTimeout(timer)
          const response = JSON.parse(msg.content.toString())
          channel.ack(msg)
          resolve(response)
        }
      }, { noAck: false })

      // 发送请求
      const content = Buffer.from(JSON.stringify(request))
      channel.sendToQueue(queueName, content, {
        correlationId,
        replyTo: replyQueue,
        persistent: true
      })
    })
  }

  // RPC 服务端 - 处理请求并返回响应
  async rpcServer(
    queueName: string,
    handler: (request: any) => Promise<any>
  ): Promise<string> {
    const channel = await this.getChannel()

    await channel.assertQueue(queueName, { durable: true })
    await channel.prefetch(1)

    const { consumerTag } = await channel.consume(queueName, async (msg) => {
      if (!msg) return

      try {
        const request = JSON.parse(msg.content.toString())
        const response = await handler(request)

        // 发送响应
        const content = Buffer.from(JSON.stringify(response))
        channel.sendToQueue(msg.properties.replyTo, content, {
          correlationId: msg.properties.correlationId
        })

        channel.ack(msg)
      } catch (error: any) {
        // 发送错误响应
        const errorResponse = { error: error.message }
        channel.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify(errorResponse)), {
          correlationId: msg.properties.correlationId
        })
        channel.ack(msg)
      }
    })

    return consumerTag
  }

  /**
   * ==================== 8. 死信队列 (错误处理) ====================
   * 处理失败的消息
   * 适用: 错误追踪、重试机制
   */

  // 创建带死信队列的队列
  async createQueueWithDLQ(queueName: string): Promise<void> {
    const channel = await this.getChannel()

    const dlqName = `${queueName}.dlq`
    const dlxExchange = `${queueName}.dlx`

    // 声明死信交换机和队列
    await channel.assertExchange(dlxExchange, 'direct', { durable: true })
    await channel.assertQueue(dlqName, { durable: true })
    await channel.bindQueue(dlqName, dlxExchange, queueName)

    // 声明主队列，配置死信
    await channel.assertQueue(queueName, {
      durable: true,
      deadLetterExchange: dlxExchange,
      deadLetterRoutingKey: queueName
    })
  }

  // 消费并处理死信
  async consumeDLQ(
    queueName: string,
    handler: (message: any, reason: string) => Promise<void>
  ): Promise<string> {
    const dlqName = `${queueName}.dlq`
    return this.consumeQueue(dlqName, async (content, msg) => {
      const reason = msg.properties.headers?.['x-death']?.[0]?.reason || 'unknown'
      await handler(content, reason)
    })
  }

  /**
   * ==================== 队列管理 ====================
   */

  // 获取队列信息
  async getQueueInfo(queueName: string): Promise<{
    messageCount: number
    consumerCount: number
  }> {
    const channel = await this.getChannel()
    const { messageCount, consumerCount } = await channel.checkQueue(queueName)
    return { messageCount, consumerCount }
  }

  // 清空队列
  async purgeQueue(queueName: string): Promise<number> {
    const channel = await this.getChannel()
    const { messageCount } = await channel.purgeQueue(queueName)
    return messageCount
  }

  // 删除队列
  async deleteQueue(queueName: string): Promise<number> {
    const channel = await this.getChannel()
    const { messageCount } = await channel.deleteQueue(queueName)
    return messageCount
  }

  // 取消消费者
  async cancelConsumer(consumerTag: string): Promise<void> {
    const channel = await this.getChannel()
    await channel.cancel(consumerTag)
  }
}

// 导出单例
export const rabbitmqService = new RabbitMQService()
