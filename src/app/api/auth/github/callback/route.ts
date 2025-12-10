import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSession } from '@/lib/auth'

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID!
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!
const APP_URL = process.env.APP_URL || 'http://localhost:3008'

interface GitHubTokenResponse {
  access_token: string
  token_type: string
  scope: string
  error?: string
  error_description?: string
}

interface GitHubUser {
  id: number
  login: string
  name: string | null
  email: string | null
  avatar_url: string
}

interface GitHubEmail {
  email: string
  primary: boolean
  verified: boolean
}

// GET /api/auth/github/callback - GitHub OAuth 回调
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const storedState = request.cookies.get('oauth_state')?.value

    // 验证 state
    if (!state || state !== storedState) {
      return createCallbackResponse(false, 'invalid_state')
    }

    if (!code) {
      return createCallbackResponse(false, 'no_code')
    }

    // 用 code 换取 access_token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${APP_URL}/api/auth/github/callback`,
      }),
    })

    const tokenData: GitHubTokenResponse = await tokenResponse.json()

    if (tokenData.error) {
      console.error('GitHub OAuth error:', tokenData.error_description)
      return createCallbackResponse(false, 'oauth_failed')
    }

    // 获取用户信息
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/json',
      },
    })

    const githubUser: GitHubUser = await userResponse.json()

    // 获取用户邮箱（如果 email 为 null）
    let email = githubUser.email
    if (!email) {
      const emailResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Accept': 'application/json',
        },
      })
      const emails: GitHubEmail[] = await emailResponse.json()
      const primaryEmail = emails.find(e => e.primary && e.verified)
      email = primaryEmail?.email || emails[0]?.email || null
    }

    if (!email) {
      return createCallbackResponse(false, 'no_email')
    }

    // 查找或创建用户
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { provider: 'github', providerId: String(githubUser.id) },
          { email },
        ],
      },
    })

    if (!user) {
      // 创建新用户
      user = await prisma.user.create({
        data: {
          email,
          name: githubUser.name || githubUser.login,
          avatar: githubUser.avatar_url,
          provider: 'github',
          providerId: String(githubUser.id),
          password: '', // OAuth 用户无密码
        },
      })
    } else if (!user.providerId) {
      // 已有邮箱用户，关联 GitHub
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          provider: 'github',
          providerId: String(githubUser.id),
          avatar: user.avatar || githubUser.avatar_url,
          name: user.name || githubUser.name || githubUser.login,
        },
      })
    }

    // 创建会话
    const userAgent = request.headers.get('user-agent') || undefined
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
               request.headers.get('x-real-ip') || 
               '127.0.0.1'
    const { token, expiresAt } = await createSession(user.id, userAgent, ip)

    // 返回成功页面（弹窗模式）
    const response = createCallbackResponse(true)

    response.cookies.set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    })

    // 清除 oauth_state cookie
    response.cookies.delete('oauth_state')

    return response
  } catch (error) {
    console.error('GitHub OAuth callback error:', error)
    return createCallbackResponse(false, 'server_error')
  }
}

// 创建回调响应（支持弹窗模式）
function createCallbackResponse(success: boolean, error?: string): NextResponse {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>${success ? 'Login Successful' : 'Login Failed'}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #0d0d0d;
      color: white;
    }
    .container {
      text-align: center;
      padding: 40px;
    }
    .icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    .message {
      font-size: 18px;
      margin-bottom: 8px;
    }
    .submessage {
      font-size: 14px;
      color: #888;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${success ? '✓' : '✗'}</div>
    <div class="message">${success ? 'Login Successful' : 'Login Failed'}</div>
    <div class="submessage">${success ? 'This window will close automatically...' : error || 'Please try again'}</div>
  </div>
  <script>
    // 通知父窗口
    if (window.opener) {
      window.opener.postMessage({ 
        type: '${success ? 'oauth_success' : 'oauth_error'}',
        ${error ? `error: '${error}'` : ''}
      }, window.location.origin);
      // 延迟关闭，让用户看到结果
      setTimeout(() => window.close(), ${success ? 1000 : 2000});
    } else {
      // 非弹窗模式，跳转到首页或登录页
      setTimeout(() => {
        window.location.href = '${success ? '/' : '/login?error=' + (error || 'oauth_failed')}';
      }, 1500);
    }
  </script>
</body>
</html>
`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}
