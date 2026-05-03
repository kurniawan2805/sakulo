import type * as React from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-12 w-full rounded-2xl border border-[var(--border-color)] bg-[var(--field-bg-color)] px-3.5 py-3 text-base text-[var(--text-primary)] transition-colors placeholder:text-[color-mix(in_srgb,var(--text-secondary)_60%,transparent)] focus-visible:outline-3 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      type={type}
      {...props}
    />
  )
}

export { Input }
