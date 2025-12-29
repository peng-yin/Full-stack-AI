# Agent 全面指南

构建企业级 AI Agent 的完整参考。

## 目录

1. [Agent 基础概念](#1-agent-基础概念)
2. [Agent 类型详解](#2-agent-类型详解)
3. [工具系统](#3-工具系统)
4. [Agent 编排](#4-agent-编排)
5. [状态管理](#5-状态管理)
6. [实战示例](#6-实战示例)
7. [最佳实践](#7-最佳实践)

---

## 1. Agent 基础概念

### 什么是 Agent?

Agent 是一个能够**自主决策**和**执行任务**的 AI 系统。与简单的 LLM 调用不同，Agent 具有：

```
┌─────────────────────────────────────────────────────┐
│                     Agent                            │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐           │
│  │ 感知    │ → │ 推理    │ → │ 行动    │           │
│  │ Perceive│   │ Reason  │   │ Act     │           │
│  └─────────┘   └─────────┘   └─────────┘           │
│       ↑                           │                 │
│       └───────── 反馈 ────────────┘                 │
└─────────────────────────────────────────────────────┘
```

### 核心组件

| 组件 | 作用 | 实现 |
|------|------|------|
| **LLM** | 大脑，负责推理 | OpenAI/Claude/本地模型 |
| **Memory** | 记忆，存储上下文 | Redis/向量数据库 |
| **Tools** | 能力，执行动作 | 函数调用 |
| **Planner** | 计划，分解任务 | LLM + Prompt |

---

## 2. Agent 类型详解

### 2.1 ReAct Agent (推理-行动)

**原理**: 交替进行思考(Thought)和行动(Action)，观察(Observation)结果后继续循环。

```
循环:
  Thought: 我需要查询天气
     ↓
  Action: get_weather(city="北京")
     ↓
  Observation: {temperature: 25, condition: "晴"}
     ↓
  Thought: 我已经得到了答案
     ↓
  Final Answer: 北京今天25度，晴天
```

**代码示例**:

```typescript
import { ReActAgent, commonTools } from '@/lib/ai/agent-framework'

const agent = new ReActAgent({
  name: 'weather-assistant',
  tools: commonTools,
  systemPrompt: '你是一个天气助手',
  maxSteps: 10
})

const result = await agent.run('北京今天天气怎么样?', 'session-123')
console.log(result.output)  // 北京今天25度，晴天
console.log(result.steps)   // 执行步骤详情
```

**API 调用**:

```bash
curl -X POST http://localhost:3008/api/ai/agent \
  -H "Content-Type: application/json" \
  -d '{
    "action": "run-react",
    "data": {
      "input": "北京今天天气怎么样?",
      "sessionId": "test-session"
    }
  }'
```

**适用场景**: 简单任务、问答、信息查询

---

### 2.2 Plan-and-Execute Agent (计划-执行)

**原理**: 先制定完整计划，再逐步执行。支持失败重规划。

```
1. Planning Phase (规划阶段)
   输入: "帮我分析这家公司的股票"
      ↓
   计划:
   - Task 1: 搜索公司基本信息
   - Task 2: 获取财务数据
   - Task 3: 分析技术指标
   - Task 4: 综合评估

2. Execution Phase (执行阶段)
   Task 1 → Result 1
   Task 2 → Result 2 (失败) → Replan
   Task 3 → Result 3
   Task 4 → Final Result
```

**代码示例**:

```typescript
import { PlanExecuteAgent, commonTools } from '@/lib/ai/agent-framework'

const agent = new PlanExecuteAgent({
  name: 'analyst',
  tools: commonTools,
  systemPrompt: '你是一个数据分析专家'
})

const result = await agent.run(
  '分析最近一周的销售数据，找出增长最快的产品',
  'session-456'
)
```

**API 调用**:

```bash
curl -X POST http://localhost:3008/api/ai/agent \
  -H "Content-Type: application/json" \
  -d '{
    "action": "run-plan-execute",
    "data": {
      "input": "分析最近一周的销售数据",
      "sessionId": "test-session"
    }
  }'
```

**适用场景**: 复杂任务、多步骤分析、需要回滚的场景

---

### 2.3 Supervisor Agent (多 Agent 协调)

**原理**: 管理多个子 Agent，根据任务类型分配给合适的 Agent。

```
                    ┌─────────────┐
                    │  Supervisor │
                    └──────┬──────┘
              分配任务      │
         ┌─────────┬───────┼───────┬─────────┐
         ↓         ↓       ↓       ↓         ↓
    ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
    │Research│ │ Coder  │ │Writer  │ │Analyst │
    │ Agent  │ │ Agent  │ │ Agent  │ │ Agent  │
    └────────┘ └────────┘ └────────┘ └────────┘
```

**代码示例**:

```typescript
import {
  SupervisorAgent,
  createReActAgent,
  createPlanExecuteAgent
} from '@/lib/ai/agent-framework'

// 创建子 Agent
const researchAgent = createReActAgent('researcher', [...])
const coderAgent = createReActAgent('coder', [...])
const writerAgent = createReActAgent('writer', [...])

// 创建 Supervisor
const supervisor = new SupervisorAgent({
  name: 'supervisor',
  subAgents: [researchAgent, coderAgent, writerAgent]
})

const result = await supervisor.run(
  '帮我写一篇关于 AI 的技术博客',
  'session-789'
)
// Supervisor 会自动选择 researcher 收集资料，然后 writer 写作
```

**适用场景**: 复杂项目、需要多种专业能力、团队协作

---

## 3. 工具系统

### 3.1 工具定义

```typescript
interface Tool {
  name: string           // 工具名称
  description: string    // 描述（给 LLM 看）
  parameters: {          // 参数 Schema
    type: 'object'
    properties: Record<string, {
      type: string
      description: string
      enum?: string[]
    }>
    required?: string[]
  }
  execute: (params: any, context: AgentContext) => Promise<any>
}
```

### 3.2 内置工具

| 工具名 | 功能 | 参数 |
|--------|------|------|
| `web_search` | 网络搜索 | query, limit |
| `get_weather` | 天气查询 | city |
| `calculator` | 数学计算 | expression |
| `code_interpreter` | 代码执行 | language, code |
| `read_file` | 读文件 | path |
| `write_file` | 写文件 | path, content |
| `http_request` | HTTP 请求 | method, url, body |
| `database_query` | 数据库查询 | query |

### 3.3 自定义工具

```typescript
const myTool: Tool = {
  name: 'send_email',
  description: '发送邮件',
  parameters: {
    type: 'object',
    properties: {
      to: { type: 'string', description: '收件人' },
      subject: { type: 'string', description: '主题' },
      body: { type: 'string', description: '内容' }
    },
    required: ['to', 'subject', 'body']
  },
  execute: async (params, context) => {
    // 调用邮件 API
    await emailService.send(params.to, params.subject, params.body)
    return { success: true, messageId: '...' }
  }
}

// 使用自定义工具
const agent = new ReActAgent({
  name: 'email-agent',
  tools: [...commonTools, myTool]
})
```

---

## 4. Agent 编排

### 4.1 顺序执行

```typescript
// Agent A 的输出作为 Agent B 的输入
const results = await agentOrchestrator.runSequential(
  ['researcher', 'writer'],
  '写一篇关于 AI 的文章',
  sessionId
)
```

### 4.2 并行执行

```typescript
// 同时运行多个 Agent
const results = await agentOrchestrator.runParallel(
  ['factChecker', 'styleChecker', 'grammarChecker'],
  '检查这篇文章',
  sessionId
)
```

### 4.3 条件执行

```typescript
// 根据输入选择不同的 Agent
const result = await agentOrchestrator.runConditional(
  userInput,
  sessionId,
  (input) => {
    if (input.includes('代码')) return 'coder'
    if (input.includes('写作')) return 'writer'
    return 'general'
  }
)
```

### 4.4 管道执行

```typescript
// 带数据转换的管道
const result = await agentOrchestrator.runPipeline(
  [
    { agent: 'researcher' },
    {
      agent: 'analyzer',
      transform: (result) => `分析以下数据: ${result}`
    },
    { agent: 'reporter' }
  ],
  '调研 AI 市场',
  sessionId
)
```

---

## 5. 状态管理

### 5.1 Agent 生命周期

```
idle → thinking → acting → waiting → completed
                    ↓
                  failed
```

### 5.2 状态持久化

```typescript
// 保存状态
await agent.saveState(sessionId)

// 恢复状态
await agent.loadState(sessionId)

// 状态存储在 Redis:
// agent:history:{sessionId} - 对话历史
// agent:state:{sessionId}   - 执行状态
// agent:steps:{sessionId}   - 步骤记录
```

### 5.3 监听事件

```typescript
agent.on('start', ({ input, context }) => {
  console.log('Agent started:', input)
})

agent.on('thought', (step) => {
  console.log('Thinking:', step.content)
})

agent.on('toolCall', ({ tool, params }) => {
  console.log('Calling tool:', tool, params)
})

agent.on('toolResult', ({ tool, result }) => {
  console.log('Tool result:', result)
})

agent.on('complete', (result) => {
  console.log('Completed:', result.output)
})

agent.on('error', (error) => {
  console.error('Error:', error)
})
```

---

## 6. 实战示例

### 6.1 智能客服 Agent

```typescript
const customerServiceAgent = new ReActAgent({
  name: 'customer-service',
  tools: [
    {
      name: 'query_order',
      description: '查询订单状态',
      parameters: { ... },
      execute: async (params) => {
        return await orderService.getOrder(params.orderId)
      }
    },
    {
      name: 'create_ticket',
      description: '创建工单',
      parameters: { ... },
      execute: async (params) => {
        return await ticketService.create(params)
      }
    }
  ],
  systemPrompt: `你是一个专业的客服代表。
    - 始终保持礼貌和耐心
    - 先查询相关信息再回答
    - 如果无法解决，创建工单升级`
})
```

### 6.2 代码助手 Agent

```typescript
const codeAssistantAgent = new PlanExecuteAgent({
  name: 'code-assistant',
  tools: [
    {
      name: 'read_codebase',
      description: '读取代码库',
      execute: async (params) => { ... }
    },
    {
      name: 'write_code',
      description: '写代码',
      execute: async (params) => { ... }
    },
    {
      name: 'run_tests',
      description: '运行测试',
      execute: async (params) => { ... }
    }
  ],
  systemPrompt: `你是一个代码助手。
    1. 先理解需求
    2. 阅读相关代码
    3. 编写解决方案
    4. 运行测试验证`
})
```

### 6.3 研究助手 (Multi-Agent)

```typescript
// 研究员：收集信息
const researcher = createReActAgent('researcher', [webSearchTool])

// 分析师：分析数据
const analyst = createReActAgent('analyst', [dataTool])

// 写手：撰写报告
const writer = createReActAgent('writer', [writeTool])

// 协调员
const coordinator = new SupervisorAgent({
  name: 'research-coordinator',
  subAgents: [researcher, analyst, writer],
  systemPrompt: `协调研究流程:
    1. 让 researcher 收集资料
    2. 让 analyst 分析数据
    3. 让 writer 撰写报告`
})

const result = await coordinator.run(
  '研究电动汽车市场趋势',
  'research-session'
)
```

---

## 7. 最佳实践

### 7.1 Prompt 设计

```typescript
// ❌ 不好的 Prompt
const badPrompt = '你是一个助手'

// ✅ 好的 Prompt
const goodPrompt = `你是一个专业的数据分析师。

## 角色
- 擅长数据分析和可视化
- 精通 SQL 和 Python

## 工作流程
1. 理解用户需求
2. 查询相关数据
3. 进行分析
4. 给出结论和建议

## 限制
- 只回答数据相关问题
- 不确定时要说明
- 敏感数据需要脱敏

## 输出格式
使用 Markdown 格式，包含:
- 数据摘要
- 分析结论
- 建议措施`
```

### 7.2 工具设计

```typescript
// ❌ 工具太复杂
const badTool = {
  name: 'do_everything',
  description: '处理所有请求',
  // ...
}

// ✅ 工具单一职责
const goodTool = {
  name: 'get_user_orders',
  description: '根据用户ID获取订单列表',
  parameters: {
    type: 'object',
    properties: {
      userId: { type: 'string', description: '用户ID' },
      status: { type: 'string', enum: ['pending', 'shipped', 'completed'] },
      limit: { type: 'number', description: '返回数量，默认10' }
    },
    required: ['userId']
  }
}
```

### 7.3 错误处理

```typescript
const agent = new ReActAgent({
  name: 'robust-agent',
  hooks: {
    onError: async (error, context) => {
      // 记录错误
      await logService.error('Agent error', { error, context })

      // 发送告警
      if (error.message.includes('timeout')) {
        await alertService.send('Agent timeout')
      }
    },
    afterStep: async (step, context) => {
      // 监控步骤执行
      if (step.duration && step.duration > 5000) {
        console.warn('Step took too long:', step)
      }
    }
  }
})
```

### 7.4 性能优化

1. **设置合理的 maxSteps** - 防止无限循环
2. **使用缓存** - 对相同查询缓存结果
3. **工具超时** - 每个工具设置超时时间
4. **并行执行** - 独立任务并行处理
5. **流式输出** - 使用 `runStream()` 实时返回结果

---

## API 快速参考

```bash
# 列出可用 Agent
GET /api/ai/agent?action=list-agents

# 列出可用工具
GET /api/ai/agent?action=list-tools

# 运行 ReAct Agent
POST /api/ai/agent
{ "action": "run-react", "data": { "input": "..." } }

# 运行 Plan-Execute Agent
POST /api/ai/agent
{ "action": "run-plan-execute", "data": { "input": "..." } }

# 运行 Supervisor Agent
POST /api/ai/agent
{ "action": "run-supervisor", "data": { "input": "..." } }

# 顺序执行
POST /api/ai/agent
{ "action": "run-sequential", "data": { "agents": ["a", "b"], "input": "..." } }

# 并行执行
POST /api/ai/agent
{ "action": "run-parallel", "data": { "agents": ["a", "b"], "input": "..." } }
```

---

## 推荐资源

- [LangChain Agents](https://python.langchain.com/docs/modules/agents/)
- [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT)
- [CrewAI](https://github.com/joaomdmoura/crewAI)
- [ReAct 论文](https://arxiv.org/abs/2210.03629)
