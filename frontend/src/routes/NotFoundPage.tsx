import { Link } from 'react-router-dom'
import { buttonClasses } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-3 text-sm text-muted">That address is not part of SyncSound.</p>
      <Link to="/" className={`${buttonClasses('primary')} mt-6`}>
        Go to the home page
      </Link>
    </div>
  )
}
