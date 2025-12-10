'use client'

// 弹窗式 OAuth 授权
export function openOAuthPopup(provider: 'github' | 'google'): Promise<boolean> {
  return new Promise((resolve) => {
    const width = 500
    const height = 600
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2

    const popup = window.open(
      `/api/auth/${provider}`,
      `${provider}_oauth`,
      `width=${width},height=${height},left=${left},top=${top},popup=yes`
    )

    if (!popup) {
      // 弹窗被阻止，回退到页面跳转
      window.location.href = `/api/auth/${provider}`
      return
    }

    // 监听弹窗关闭
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed)
        // 检查是否登录成功（通过检查 cookie 或发请求）
        checkAuthStatus().then(resolve)
      }
    }, 500)

    // 监听来自弹窗的消息
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      
      if (event.data?.type === 'oauth_success') {
        clearInterval(checkClosed)
        window.removeEventListener('message', handleMessage)
        popup.close()
        resolve(true)
      } else if (event.data?.type === 'oauth_error') {
        clearInterval(checkClosed)
        window.removeEventListener('message', handleMessage)
        popup.close()
        resolve(false)
      }
    }

    window.addEventListener('message', handleMessage)

    // 超时处理（5分钟）
    setTimeout(() => {
      clearInterval(checkClosed)
      window.removeEventListener('message', handleMessage)
      if (!popup.closed) {
        popup.close()
      }
      resolve(false)
    }, 5 * 60 * 1000)
  })
}

// 检查登录状态
async function checkAuthStatus(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/me')
    return res.ok
  } catch {
    return false
  }
}
