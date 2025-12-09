'use client'

import * as React from 'react'
import * as SeparatorPrimitive from '@radix-ui/react-separator'

interface SeparatorWithTextProps extends React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root> {
  text?: string
}

export const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  SeparatorWithTextProps
>(({ className, orientation = 'horizontal', decorative = true, text, ...props }, ref) => {
  if (text) {
    return (
      <div className={`flex items-center gap-4 ${className || ''}`}>
        <SeparatorPrimitive.Root
          ref={ref}
          decorative={decorative}
          orientation={orientation}
          className="flex-1 h-px bg-gray-600"
          {...props}
        />
        <span className="text-gray-400 text-sm">{text}</span>
        <SeparatorPrimitive.Root
          decorative={decorative}
          orientation={orientation}
          className="flex-1 h-px bg-gray-600"
        />
      </div>
    )
  }

  return (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={`
        ${orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px'}
        bg-gray-600
        ${className || ''}
      `}
      {...props}
    />
  )
})
Separator.displayName = SeparatorPrimitive.Root.displayName
