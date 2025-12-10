'use server'

import { NextResponse } from 'next/server'

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID!
const APP_URL = process.env.APP_URL || 'http://localhost:3008'

// GET /api/auth/github - 发起 GitHub OAuth 授权
export async function GET() {
  const state = crypto.randomUUID()
  
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: `${APP_URL}/api/auth/github/callback`,
    scope: 'read:user user:email',
    state,
  })

  const response = NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`
  )

  // 存储 state 用于验证回调
  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 分钟
    path: '/',
  })

  return response
}
