import * as LabelPrimitive from '@radix-ui/react-label'
import type * as React from 'react'
import { cn } from '@/lib/utils'

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn('flex flex-col gap-2 text-left text-sm font-bold text-[var(--text-secondary)]', className)}
      {...props}
    />
  )
}

export { Label }
