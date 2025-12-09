import { NextRequest, NextResponse } from 'next/server'
import { redisUtils } from '@/lib/redis'
import { generateVerificationCode } from '@/lib/auth'
import { z } from 'zod'

const sendCodeSchema = z.object({
  email: z.string().email('Invalid email format'),
})

// POST /api/auth/send-code - 发送验证码
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 验证请求体
    const validation = sendCodeSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { email } = validation.data

    // 检查是否频繁发送（60秒内只能发送一次）
    const existingCode = await redisUtils.getVerificationCode(email)
    if (existingCode) {
      return NextResponse.json(
        { error: 'Please wait before requesting a new code' },
        { status: 429 }
      )
    }

    // 生成验证码
    const code = generateVerificationCode()

    // 保存验证码（5分钟有效）
    await redisUtils.setVerificationCode(email, code, 300)

    // TODO: 实际项目中应该通过邮件服务发送验证码
    // 这里仅在开发环境打印验证码
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV] Verification code for ${email}: ${code}`)
    }

    return NextResponse.json({
      message: 'Verification code sent successfully',
      // 开发环境返回验证码，生产环境不返回
      ...(process.env.NODE_ENV === 'development' && { code }),
    })
  } catch (error) {
    console.error('Error sending verification code:', error)
    return NextResponse.json(
      { error: 'Failed to send verification code' },
      { status: 500 }
    )
  }
}
