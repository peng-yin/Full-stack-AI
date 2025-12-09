'use client'

import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { EyeOpenIcon, EyeClosedIcon } from '@radix-ui/react-icons'

// Label Component
export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={`text-sm font-medium text-gray-300 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className || ''}`}
    {...props}
  />
))
Label.displayName = LabelPrimitive.Root.displayName

// Input Component
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={`
          w-full bg-[#1a1a1a] text-white placeholder-gray-500 
          border rounded-lg px-4 py-3 
          focus:outline-none focus:ring-2 focus:ring-gray-500/50 focus:border-gray-500
          transition-all duration-200
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? 'border-red-500' : 'border-gray-700'}
          ${className || ''}
        `}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

// Password Input Component
interface PasswordInputProps extends Omit<InputProps, 'type'> {
  showPassword?: boolean
  onTogglePassword?: () => void
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, showPassword, onTogglePassword, ...props }, ref) => {
    const [internalShow, setInternalShow] = React.useState(false)
    const isControlled = showPassword !== undefined
    const show = isControlled ? showPassword : internalShow

    const handleToggle = () => {
      if (isControlled && onTogglePassword) {
        onTogglePassword()
      } else {
        setInternalShow(!internalShow)
      }
    }

    return (
      <div className="relative">
        <Input
          type={show ? 'text' : 'password'}
          className={`pr-12 ${className || ''}`}
          ref={ref}
          {...props}
        />
        <button
          type="button"
          onClick={handleToggle}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors focus:outline-none focus:text-gray-300"
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? (
            <EyeOpenIcon className="w-5 h-5" />
          ) : (
            <EyeClosedIcon className="w-5 h-5" />
          )}
        </button>
      </div>
    )
  }
)
PasswordInput.displayName = 'PasswordInput'
