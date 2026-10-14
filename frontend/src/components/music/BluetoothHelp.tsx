import { Headphones } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { usePreferences } from '@/stores/preferences'

export function BluetoothHelp() {
  const setShowBluetoothHelp = usePreferences((state) => state.setShowBluetoothHelp)

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Headphones aria-hidden="true" className="size-5 text-cyan" />
        <h2 className="text-lg font-semibold">Use your own headphones</h2>
      </div>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
        <li>Pair your Bluetooth earphones with this phone in the phone’s Bluetooth settings.</li>
        <li>Open SyncSound in this phone’s browser.</li>
        <li>Join the listening room.</li>
        <li>When playback is available, tap the player if the browser asks for a tap.</li>
        <li>If sound comes from the wrong place, change the audio output in the phone’s system controls.</li>
      </ol>
      <p className="mt-3 text-sm text-muted">
        SyncSound never requests Bluetooth permission and cannot select a headset. It also cannot connect four Bluetooth headsets to one phone. Delay varies by phone, browser, codec, and network. The status label is an estimate, not a measurement of Bluetooth latency.
      </p>
      <button type="button" className="mt-3 min-h-11 text-sm font-medium text-link" onClick={() => setShowBluetoothHelp(false)}>
        Hide this help
      </button>
    </Card>
  )
}
