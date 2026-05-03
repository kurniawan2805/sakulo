import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-extrabold transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-[var(--text-primary)] text-white hover:bg-[color-mix(in_srgb,var(--text-primary)_88%,white)] focus-visible:outline-[color-mix(in_srgb,var(--text-primary)_28%,transparent)]',
        income: 'bg-[var(--color-income)] text-white hover:bg-[color-mix(in_srgb,var(--color-income)_86%,black)] focus-visible:outline-[color-mix(in_srgb,var(--color-income)_28%,transparent)]',
        expense: 'bg-[var(--color-expense)] text-white hover:bg-[color-mix(in_srgb,var(--color-expense)_86%,black)] focus-visible:outline-[color-mix(in_srgb,var(--color-expense)_28%,transparent)]',
        transfer: 'bg-[var(--color-transfer)] text-white hover:bg-[color-mix(in_srgb,var(--color-transfer)_86%,black)] focus-visible:outline-[color-mix(in_srgb,var(--color-transfer)_28%,transparent)]',
        outline: 'border border-[var(--border-color)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--soft-bg-color)] focus-visible:outline-[color-mix(in_srgb,var(--text-primary)_20%,transparent)]',
        ghost: 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--soft-bg-color)] hover:text-[var(--text-primary)] focus-visible:outline-[color-mix(in_srgb,var(--text-primary)_20%,transparent)]',
        destructive: 'bg-transparent text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--color-expense)_10%,transparent)] hover:text-[var(--color-expense)] focus-visible:outline-[color-mix(in_srgb,var(--color-expense)_24%,transparent)]',
      },
      size: {
        default: 'h-12 px-5 py-3',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-14 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'

  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button }
