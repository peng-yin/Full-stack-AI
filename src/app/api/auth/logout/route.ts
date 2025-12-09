import { NextRequest, NextResponse } from 'next/server'
import { deleteSession } from '@/lib/auth'

// POST /api/auth/logout - 用户登出
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('session_token')?.value

    if (token) {
      await deleteSession(token)
    }

    const response = NextResponse.json({
      message: 'Logout successful',
    })

    // 清除 cookie
    response.cookies.set('session_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: new Date(0),
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Error during logout:', error)
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    )
  }
}
