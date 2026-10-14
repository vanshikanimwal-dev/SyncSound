import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

const tones = {
  info: 'border-line bg-elevated text-ink',
  warn: 'border-warn bg-elevated text-ink',
  danger: 'border-danger bg-elevated text-ink',
}

export function Notice({
  tone = 'info',
  children,
  className,
}: {
  tone?: keyof typeof tones
  children: ReactNode
  className?: string
}) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-lg border px-4 py-3 text-sm', tones[tone], className)}>
      {children}
    </div>
  )
}
