'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, Input, PasswordInput, Separator, ToastProvider, Toast, useToast, GitHubIcon, GoogleIcon } from '@/components/ui'

function LoginForm() {
  const router = useRouter()
  const { toast, showToast, setOpen } = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Login failed')
      }

      showToast({ type: 'success', title: 'Success', description: 'Login successful!' })
      setTimeout(() => router.push('/'), 1000)
    } catch (err) {
      showToast({ 
        type: 'error', 
        title: 'Error', 
        description: err instanceof Error ? err.message : 'Login failed' 
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
          <h1 className="text-4xl font-bold text-white text-center mb-8">Log in</h1>

          {/* OAuth Buttons */}
          <div className="space-y-3 mb-6">
            <Button variant="oauth" className="w-full" icon={<GitHubIcon className="w-5 h-5" />}>
              GitHub
            </Button>
            <Button variant="oauth" className="w-full" icon={<GoogleIcon className="w-5 h-5" />}>
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

            <PasswordInput
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />

            <Button type="submit" variant="primary" className="w-full" loading={loading}>
              {loading ? 'Logging in...' : 'Log in'}
            </Button>
          </form>

          {/* Sign Up Link */}
          <p className="text-gray-400 text-center mt-6">
            Don&apos;t have an account ?{' '}
            <Link href="/signup" className="text-white font-medium hover:underline transition-colors">
              Sign up
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

export default function LoginPage() {
  return (
    <ToastProvider>
      <LoginForm />
    </ToastProvider>
  )
}
