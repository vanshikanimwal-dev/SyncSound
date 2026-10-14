import { Card } from '@/components/ui/card'
import { Notice } from '@/components/ui/notice'

export function PrivacyPage() {
  return (
    <div className="mx-auto grid max-w-3xl gap-4 px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
      <Notice tone="warn">This text requires legal review before a production launch. It describes the current preview, not a certified privacy program.</Notice>
      <Card>
        <h2 className="text-lg font-semibold">What this preview stores</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
          <li>Display name, theme, and headphone-help preference in local storage on this device, if you choose to remember the name.</li>
          <li>When the SyncSound server is running, room names, display names, queue video IDs, and playback position are sent to that server and stored in its local database.</li>
          <li>A random session id and a short-lived room credential, in session storage. Those values are cleared when the tab closes.</li>
          <li>YouTube video IDs you paste into a queue. The title is the text you enter.</li>
        </ul>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">What this preview does not collect</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
          <li>No account, password, precise location, contacts, or Bluetooth identifiers.</li>
          <li>No Bluetooth permission. Pairing happens in the phone’s own settings.</li>
          <li>No Spotify or Google password. Those integrations are not connected.</li>
          <li>No playback audio. Audio is not uploaded.</li>
        </ul>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">How long rooms last</h2>
        <p className="mt-3 text-sm text-muted">
          A room expires four hours after it is created, or sooner if the host closes it or the last person leaves. If the host’s phone disconnects, host control moves to another connected person after 30 seconds. Invitation links stop working when the room expires.
        </p>
      </Card>
    </div>
  )
}
