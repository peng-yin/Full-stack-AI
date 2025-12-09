'use client'

import * as React from 'react'
import { ReloadIcon } from '@radix-ui/react-icons'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'oauth' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, icon, children, disabled, ...props }, ref) => {
    const baseStyles = `
      inline-flex items-center justify-center gap-3 font-medium rounded-lg
      transition-all duration-200
      focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0d0d0d]
      disabled:opacity-50 disabled:cursor-not-allowed
    `

    const variants = {
      primary: 'bg-[#4ade80] text-black hover:bg-[#22c55e] focus:ring-[#4ade80]/50',
      secondary: 'bg-[#1a1a1a] text-white border border-gray-700 hover:bg-[#252525] focus:ring-gray-500/50',
      oauth: 'bg-white text-gray-800 hover:bg-gray-100 focus:ring-gray-300/50',
      ghost: 'bg-transparent text-gray-400 hover:text-white hover:bg-white/5 focus:ring-gray-500/50',
    }

    const sizes = {
      sm: 'px-3 py-2 text-sm',
      md: 'px-4 py-3 text-base',
      lg: 'px-6 py-4 text-lg',
    }

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className || ''}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <ReloadIcon className="w-4 h-4 animate-spin" />
        ) : icon ? (
          icon
        ) : null}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
