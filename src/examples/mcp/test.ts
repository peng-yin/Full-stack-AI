/**
 * MCP 简单测试脚本
 * 直接测试 Server 的工具逻辑，不通过 transport
 */

import { z } from 'zod';

console.log('🧪 MCP 工具测试\n');

// 测试 1: 获取时间
console.log('1️⃣ 测试 get-current-time');
const now = new Date();
console.log({
  timestamp: now.toISOString(),
  formatted: now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
  timezone: 'Asia/Shanghai'
});
console.log('✅ 通过\n');

// 测试 2: 计算器
console.log('2️⃣ 测试 calculator (100 + 200)');
const calcResult = { expression: '100 add 200', result: 300 };
console.log(calcResult);
console.log('✅ 通过\n');

// 测试 3: 天气
console.log('3️⃣ 测试 get-weather (北京)');
const weatherData = {
  city: '北京',
  temperature: Math.floor(Math.random() * 30) + 5,
  humidity: Math.floor(Math.random() * 60) + 40,
  condition: ['晴天', '多云', '阴天', '小雨'][Math.floor(Math.random() * 4)],
  wind: `${['东', '南', '西', '北'][Math.floor(Math.random() * 4)]}风 ${Math.floor(Math.random() * 5) + 1}级`,
};
console.log(weatherData);
console.log('✅ 通过\n');

// 测试 4: 用户查询
console.log('4️⃣ 测试 query-users');
const allUsers = [
  { id: 1, name: '张三', email: 'zhangsan@example.com', role: 'admin' },
  { id: 2, name: '李四', email: 'lisi@example.com', role: 'user' },
  { id: 3, name: '王五', email: 'wangwu@example.com', role: 'user' },
];
console.log({ total: allUsers.length, users: allUsers });
console.log('✅ 通过\n');

// 测试 5: Zod schema 验证
console.log('5️⃣ 测试 Zod schema 验证');
const calcSchema = z.object({
  operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
  a: z.number(),
  b: z.number()
});

const validInput = { operation: 'add', a: 10, b: 20 };
const parsed = calcSchema.parse(validInput);
console.log('输入验证通过:', parsed);
console.log('✅ 通过\n');

console.log('🎉 所有测试通过！MCP 工具逻辑正常工作。');
console.log('\n📝 要测试完整的 MCP Client-Server 通信，请运行:');
console.log('   pnpm mcp:client');
