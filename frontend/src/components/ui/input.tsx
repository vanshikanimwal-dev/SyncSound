import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export const controlClass =
  'min-h-11 w-full rounded-md border border-line bg-elevated px-3 text-base text-ink placeholder:text-muted'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...props} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClass, className)} {...props} />
}

export function Checkbox({
  label,
  ...props
}: { label: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex min-h-11 items-start gap-3 text-sm text-ink">
      <input type="checkbox" className="mt-1 size-4 accent-accent" {...props} />
      <span>{label}</span>
    </label>
  )
}
