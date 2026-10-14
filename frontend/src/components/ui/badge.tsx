import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

const tones = {
  neutral: 'border-line bg-elevated text-muted',
  accent: 'border-transparent bg-accent text-accent-ink',
  warn: 'border-warn bg-elevated text-warn',
  ok: 'border-ok bg-elevated text-ok',
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof tones }) {
  return <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>
}
