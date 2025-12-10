'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, Input, PasswordInput, Separator, ToastProvider, Toast, useToast, GitHubIcon, GoogleIcon } from '@/components/ui'
import { openOAuthPopup } from '@/lib/oauth'

function SignUpForm() {
  const router = useRouter()
  const { toast, showToast, setOpen } = useToast()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [oauthLoading, setOauthLoading] = useState<'github' | 'google' | null>(null)

  const handleOAuth = async (provider: 'github' | 'google') => {
    setOauthLoading(provider)
    try {
      const success = await openOAuthPopup(provider)
      if (success) {
        showToast({ type: 'success', title: 'Success', description: 'Account created successfully!' })
        setTimeout(() => router.push('/'), 500)
      }
    } catch {
      showToast({ type: 'error', title: 'Error', description: 'OAuth signup failed' })
    } finally {
      setOauthLoading(null)
    }
  }

  const handleSendCode = async () => {
    if (!email || countdown > 0) return

    setSendingCode(true)

    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send code')
      }

      showToast({ type: 'success', title: 'Code Sent', description: 'Verification code sent to your email' })
      
      // 开始倒计时
      setCountdown(60)
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (err) {
      showToast({ 
        type: 'error', 
        title: 'Error', 
        description: err instanceof Error ? err.message : 'Failed to send code' 
      })
    } finally {
      setSendingCode(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Signup failed')
      }

      showToast({ type: 'success', title: 'Success', description: 'Account created successfully!' })
      setTimeout(() => router.push('/'), 1000)
    } catch (err) {
      showToast({ 
        type: 'error', 
        title: 'Error', 
        description: err instanceof Error ? err.message : 'Signup failed' 
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Toast {...toast} onOpenChange={setOpen} />
      
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <h1 className="text-4xl font-bold text-white text-center mb-8">Sign up</h1>

          {/* OAuth Buttons */}
          <div className="space-y-3 mb-6">
            <Button 
              variant="oauth" 
              className="w-full" 
              icon={<GitHubIcon className="w-5 h-5" />}
              onClick={() => handleOAuth('github')}
              loading={oauthLoading === 'github'}
              disabled={oauthLoading !== null}
            >
              GitHub
            </Button>
            <Button 
              variant="oauth" 
              className="w-full" 
              icon={<GoogleIcon className="w-5 h-5" />}
              disabled={oauthLoading !== null}
            >
              Google
            </Button>
          </div>

          {/* Divider */}
          <Separator text="or with Email" className="mb-6" />

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Verification code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
                required
                className="flex-1"
                autoComplete="one-time-code"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleSendCode}
                disabled={!email || countdown > 0}
                loading={sendingCode}
                className="whitespace-nowrap min-w-[100px]"
              >
                {countdown > 0 ? `${countdown}s` : 'Send Code'}
              </Button>
            </div>

            <PasswordInput
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />

            <Button type="submit" variant="primary" className="w-full" loading={loading}>
              {loading ? 'Signing up...' : 'Sign Up'}
            </Button>
          </form>

          {/* Login Link */}
          <p className="text-gray-400 text-center mt-6">
            Already have an account ?{' '}
            <Link href="/login" className="text-white font-medium hover:underline transition-colors">
              Log in
            </Link>
          </p>

          {/* Terms */}
          <p className="text-gray-500 text-sm text-center mt-6">
            by continuing, you are agreeing to Trae&apos;s{' '}
            <a href="#" className="text-[#4ade80] hover:underline">Terms of Service</a>
            {' '}and{' '}
            <a href="#" className="text-[#4ade80] hover:underline">Privacy Policy</a>
          </p>
        </div>
      </div>
    </>
  )
}

export default function SignUpPage() {
  return (
    <ToastProvider>
      <SignUpForm />
    </ToastProvider>
  )
}
