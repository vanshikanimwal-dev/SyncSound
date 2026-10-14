import { Link } from 'react-router-dom'

export function AppFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>SyncSound coordinates separate phones. It does not pair Bluetooth headsets.</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-2">
          <Link to="/privacy" className="text-link underline-offset-2 hover:underline">
            Privacy
          </Link>
          <Link to="/terms" className="text-link underline-offset-2 hover:underline">
            Terms
          </Link>
          <Link to="/#how-it-works" className="text-link underline-offset-2 hover:underline">
            Help
          </Link>
          <a
            href="https://github.com/vanshikanimwal-dev/SyncSound"
            className="text-link underline-offset-2 hover:underline"
          >
            Project
          </a>
        </nav>
      </div>
    </footer>
  )
}
