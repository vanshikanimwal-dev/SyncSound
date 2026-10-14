import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox, Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { Notice } from '@/components/ui/notice'
import { normalizeDisplayName } from '@/lib/validation'
import { usePreferences, type ThemePreference } from '@/stores/preferences'

const themes: Array<{ value: ThemePreference; label: string }> = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'Match device' },
]

export function SettingsPage() {
  const displayName = usePreferences((state) => state.displayName)
  const rememberDisplayName = usePreferences((state) => state.rememberDisplayName)
  const theme = usePreferences((state) => state.theme)
  const showBluetoothHelp = usePreferences((state) => state.showBluetoothHelp)
  const setDisplayName = usePreferences((state) => state.setDisplayName)
  const setRememberDisplayName = usePreferences((state) => state.setRememberDisplayName)
  const setTheme = usePreferences((state) => state.setTheme)
  const setShowBluetoothHelp = usePreferences((state) => state.setShowBluetoothHelp)
  const [name, setName] = useState(displayName)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setName(displayName)
  }, [displayName])

  function save(event: FormEvent) {
    event.preventDefault()
    const next = normalizeDisplayName(name, true)
    if (next === null) {
      setSaved(false)
      setError('Enter a display name up to 40 characters, or leave it blank.')
      return
    }
    setDisplayName(next)
    setError(null)
    setSaved(true)
  }

  return (
    <div className="mx-auto grid max-w-xl gap-4 px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <Card>
        <form className="grid gap-4" onSubmit={save}>
          <Field label="Display name" htmlFor="settings-name" hint="Used the next time you create or join a room." error={error}>
            <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="nickname" maxLength={40} />
          </Field>
          <Checkbox
            label="Remember my display name on this device. If this is off, the name is forgotten when you reload SyncSound."
            checked={rememberDisplayName}
            onChange={(event) => setRememberDisplayName(event.target.checked)}
          />
          <Button type="submit">Save preferences</Button>
          {saved ? <p role="status" className="text-sm text-ok">Saved on this device.</p> : null}
        </form>
      </Card>
      <Card>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Theme</legend>
          {themes.map((option) => (
            <label key={option.value} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={theme === option.value}
                onChange={() => setTheme(option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Playback</h2>
        <p className="mt-2 text-sm text-muted">Preferred source: YouTube. Spotify is unavailable in this version.</p>
        <div className="mt-3">
          <Checkbox
            label="Show headphone setup help in rooms"
            checked={showBluetoothHelp}
            onChange={(event) => setShowBluetoothHelp(event.target.checked)}
          />
        </div>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Integrations</h2>
        <ul className="mt-3 grid gap-3 text-sm text-muted">
          <li>YouTube player: the official embedded player runs on each phone when a shared room is playing. SyncSound does not stream the audio.</li>
          <li>YouTube Data API: no API key configured. Search and thumbnails are unavailable. You can still paste a video URL in a room.</li>
          <li>Spotify: not connected. No Spotify account is stored, and there is no disconnect action because nothing is linked.</li>
        </ul>
        <Notice className="mt-4">SyncSound will not ask for your Google or Spotify password.</Notice>
      </Card>
    </div>
  )
}
