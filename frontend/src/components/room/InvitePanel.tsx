import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { inviteUrl } from '@/lib/invite'

export function InvitePanel({ code }: { code: string }) {
  const url = inviteUrl(code)
  const [qr, setQr] = useState<string | null>(null)
  const [qrError, setQrError] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    let cancelled = false
    setQr(null)
    setQrError(false)
    QRCode.toString(url, { type: 'svg', margin: 1 })
      .then((svg) => {
        if (!cancelled) setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
      })
      .catch(() => {
        if (!cancelled) setQrError(true)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  async function copyLink() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(url)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">Invite friends</h2>
      <p className="mt-1 text-sm text-muted">Share this code, link, or QR code. Each person joins on their own phone.</p>
      <p className="mt-4 font-mono text-3xl tracking-[0.28em] text-ink" aria-label={`Room code ${code.split('').join(' ')}`}>
        {code}
      </p>
      <p className="mt-3 break-all text-sm text-link">{url}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={() => void copyLink()}>
          {copyState === 'copied' ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
          {copyState === 'copied' ? 'Copied' : 'Copy invitation link'}
        </Button>
        <p role="status" className="text-sm text-muted">
          {copyState === 'copied' ? 'Invitation link copied.' : null}
          {copyState === 'failed' ? 'Clipboard unavailable. Select the link above and copy it.' : null}
        </p>
      </div>
      <div className="mt-4">
        {qr ? (
          <img src={qr} alt="QR code to join the room" width={180} height={180} className="rounded-md bg-white p-2" />
        ) : qrError ? (
          <p className="text-sm text-muted">QR code could not be created. Share the link instead.</p>
        ) : (
          <Skeleton className="size-44" />
        )}
      </div>
    </Card>
  )
}
