import { Settings } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Logo } from '@/components/layout/Logo'
import { cn } from '@/lib/cn'

function navClass({ isActive }: { isActive: boolean }): string {
  return cn(
    'inline-flex min-h-11 items-center justify-center rounded-md px-3 text-sm font-medium',
    isActive ? 'text-ink' : 'text-muted hover:text-ink',
  )
}

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-elevated">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Logo />
        <nav aria-label="Primary" className="flex items-center gap-1">
          <NavLink to="/create" className={navClass}>
            Create
          </NavLink>
          <NavLink to="/join" className={navClass}>
            Join
          </NavLink>
          <NavLink to="/settings" aria-label="Settings" className={navClass}>
            <Settings aria-hidden="true" className="size-5" />
          </NavLink>
        </nav>
      </div>
    </header>
  )
}
