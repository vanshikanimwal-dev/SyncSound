import { Outlet } from 'react-router-dom'
import { AppFooter } from '@/components/layout/AppFooter'
import { AppHeader } from '@/components/layout/AppHeader'
import { Notice } from '@/components/ui/notice'
import { youTubePlaybackUrl } from '@/lib/invite'

export function PageShell() {
  const playbackUrl = youTubePlaybackUrl()
  return (
    <div className="flex min-h-dvh flex-col">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <AppHeader />
      {playbackUrl ? (
        <div className="mx-auto w-full max-w-5xl px-4 pt-4">
          <Notice>
            YouTube will not play from a numeric address. Open{' '}
            <a className="text-link underline" href={playbackUrl}>
              {playbackUrl}
            </a>{' '}
            and continue past the certificate warning.
          </Notice>
        </div>
      ) : null}
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <AppFooter />
    </div>
  )
}
