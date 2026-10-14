import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-lg border border-line bg-card p-4 shadow-[var(--shadow)] sm:p-5', className)}>{children}</section>
}
