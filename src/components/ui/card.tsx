import type * as React from 'react'
import { cn } from '@/lib/utils'

function Card({ className, ...props }: React.ComponentProps<'section'>) {
  return (
    <section
      className={cn('rounded-[28px] bg-[var(--surface-color)] p-5 shadow-[var(--card-shadow)] transition-colors', className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mb-4 space-y-1', className)} {...props} />
}

function CardTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return <h2 className={cn('text-lg font-extrabold tracking-[-0.035em] text-[var(--text-primary)]', className)} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-sm text-[var(--text-secondary)]', className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn(className)} {...props} />
}

export { Card, CardContent, CardDescription, CardHeader, CardTitle }
