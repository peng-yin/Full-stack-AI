/**
 * 流程实例 Redis 持久化
 */

import { redis, withPrefix } from '../agent/core'
import { InstanceStore, WorkflowInstance, InstanceStatus } from './engine'

const INSTANCE_KEY = (id: string) => withPrefix(`wf:instance:${id}`)
const BIZ_INDEX_KEY = (bizType: string, bizId: string) => withPrefix(`wf:biz:${bizType}:${bizId}`)
const LIST_KEY = withPrefix('wf:instances')

export class RedisInstanceStore implements InstanceStore {
  async save(instance: WorkflowInstance): Promise<void> {
    const key = INSTANCE_KEY(instance.id)
    const json = JSON.stringify(instance)

    await Promise.all([
      redis.set(key, json),
      // 业务索引：bizType + bizId → instanceId
      redis.set(BIZ_INDEX_KEY(instance.context.bizType, instance.context.bizId), instance.id),
      // 全局列表（用 sorted set，score 为时间戳）
      redis.zadd(LIST_KEY, Date.now(), instance.id),
    ])
  }

  async get(instanceId: string): Promise<WorkflowInstance | null> {
    const raw = await redis.get(INSTANCE_KEY(instanceId))
    return raw ? JSON.parse(raw) : null
  }

  async getByBiz(bizType: string, bizId: string): Promise<WorkflowInstance | null> {
    const instanceId = await redis.get(BIZ_INDEX_KEY(bizType, bizId))
    if (!instanceId) return null
    return this.get(instanceId)
  }

  async list(filter?: { status?: InstanceStatus; definitionId?: string }): Promise<WorkflowInstance[]> {
    const ids = await redis.zrevrange(LIST_KEY, 0, 99)
    const instances: WorkflowInstance[] = []

    for (const id of ids) {
      const instance = await this.get(id)
      if (!instance) continue
      if (filter?.status && instance.status !== filter.status) continue
      if (filter?.definitionId && instance.definitionId !== filter.definitionId) continue
      instances.push(instance)
    }

    return instances
  }
}
