import { Link } from 'react-router-dom'

export function Logo() {
  return (
    <Link to="/" className="inline-flex min-h-11 items-center gap-2 font-semibold tracking-tight text-ink" aria-label="SyncSound home">
      <svg viewBox="0 0 32 32" aria-hidden="true" className="size-8 text-accent">
        <rect width="32" height="32" rx="8" fill="currentColor" />
        <rect x="7" y="13" width="2.2" height="6" rx="1" fill="#ffffff" />
        <rect x="11.4" y="10" width="2.2" height="12" rx="1" fill="#ffffff" />
        <rect x="15.8" y="8" width="2.2" height="16" rx="1" fill="#ffffff" />
        <rect x="20.2" y="10" width="2.2" height="12" rx="1" fill="#ffffff" />
        <rect x="24.6" y="13" width="2.2" height="6" rx="1" fill="#ffffff" />
      </svg>
      <span>SyncSound</span>
    </Link>
  )
}
