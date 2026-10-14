import { Card } from '@/components/ui/card'
import { Notice } from '@/components/ui/notice'

export function TermsPage() {
  return (
    <div className="mx-auto grid max-w-3xl gap-4 px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Terms</h1>
      <Notice tone="warn">This text requires legal review before a production launch. It is a product description, not a complete legal agreement.</Notice>
      <Card>
        <ul className="list-disc space-y-3 pl-5 text-sm text-muted">
          <li>SyncSound is shared under the MIT license in this repository. That license is not a warranty.</li>
          <li>The listening service coordinates a start time across phones. It is not sample-accurate, and Bluetooth delay is outside SyncSound’s control.</li>
          <li>You are responsible for having the right to play media you add. YouTube content stays subject to YouTube’s terms. The video plays in YouTube’s player on each phone.</li>
          <li>Spotify synchronized listening is not offered.</li>
          <li>This server is meant for a small group on one computer or one home network. It is not a production hosting setup.</li>
        </ul>
      </Card>
    </div>
  )
}
