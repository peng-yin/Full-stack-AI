'use client'

import * as React from 'react'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { Cross2Icon, CheckCircledIcon, CrossCircledIcon, InfoCircledIcon } from '@radix-ui/react-icons'

type ToastType = 'success' | 'error' | 'info'

interface ToastProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  type?: ToastType
  duration?: number
}

const icons = {
  success: <CheckCircledIcon className="w-5 h-5 text-green-400" />,
  error: <CrossCircledIcon className="w-5 h-5 text-red-400" />,
  info: <InfoCircledIcon className="w-5 h-5 text-blue-400" />,
}

const styles = {
  success: 'border-green-500/30 bg-green-500/10',
  error: 'border-red-500/30 bg-red-500/10',
  info: 'border-blue-500/30 bg-blue-500/10',
}

export function Toast({ open, onOpenChange, title, description, type = 'info', duration = 5000 }: ToastProps) {
  return (
    <ToastPrimitive.Root
      open={open}
      onOpenChange={onOpenChange}
      duration={duration}
      className={`
        rounded-lg border p-4 shadow-lg
        ${styles[type]}
        data-[state=open]:animate-in data-[state=closed]:animate-out
        data-[swipe=end]:animate-out data-[state=closed]:fade-out-80
        data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full
      `}
    >
      <div className="flex items-start gap-3">
        {icons[type]}
        <div className="flex-1">
          {title && (
            <ToastPrimitive.Title className="text-sm font-medium text-white">
              {title}
            </ToastPrimitive.Title>
          )}
          {description && (
            <ToastPrimitive.Description className="text-sm text-gray-400 mt-1">
              {description}
            </ToastPrimitive.Description>
          )}
        </div>
        <ToastPrimitive.Close className="text-gray-500 hover:text-white transition-colors">
          <Cross2Icon className="w-4 h-4" />
        </ToastPrimitive.Close>
      </div>
    </ToastPrimitive.Root>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {children}
      <ToastPrimitive.Viewport className="fixed top-4 right-4 flex flex-col gap-2 w-96 max-w-[100vw] z-50" />
    </ToastPrimitive.Provider>
  )
}

// Hook for using toast
interface ToastState {
  open: boolean
  title?: string
  description?: string
  type?: ToastType
}

export function useToast() {
  const [toast, setToast] = React.useState<ToastState>({ open: false })

  const showToast = React.useCallback((options: Omit<ToastState, 'open'>) => {
    setToast({ ...options, open: true })
  }, [])

  const hideToast = React.useCallback(() => {
    setToast((prev) => ({ ...prev, open: false }))
  }, [])

  return {
    toast,
    showToast,
    hideToast,
    setOpen: (open: boolean) => setToast((prev) => ({ ...prev, open })),
  }
}
