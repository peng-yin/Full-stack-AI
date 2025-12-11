/**
 * 传统 REST API 示例
 * 用于对比 MCP 的区别
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { city } = await request.json();
    
    if (!city) {
      return NextResponse.json(
        { error: '缺少 city 参数' },
        { status: 400 }
      );
    }

    // 模拟天气数据（和 MCP 相同的逻辑）
    const weatherData = {
      city,
      temperature: Math.floor(Math.random() * 30) + 5,
      humidity: Math.floor(Math.random() * 60) + 40,
      condition: ['晴天', '多云', '阴天', '小雨'][Math.floor(Math.random() * 4)],
      wind: `${['东', '南', '西', '北'][Math.floor(Math.random() * 4)]}风 ${Math.floor(Math.random() * 5) + 1}级`,
      updatedAt: new Date().toISOString(),
      source: 'REST API'
    };

    return NextResponse.json({
      success: true,
      data: weatherData
    });

  } catch (error) {
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    );
  }
}