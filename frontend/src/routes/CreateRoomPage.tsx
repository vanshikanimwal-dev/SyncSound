import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { Input, Select } from '@/components/ui/input'
import { Notice } from '@/components/ui/notice'
import { DEFAULT_MAX_PARTICIPANTS, MAX_PARTICIPANTS, MIN_PARTICIPANTS, ROOM_TTL_MINUTES } from '@/lib/config'
import { getSessionId, rememberMembership } from '@/lib/session'
import { normalizeDisplayName } from '@/lib/validation'
import { useRoomClient } from '@/features/rooms/room-client-context'
import { errorMessage } from '@/services/room-errors'
import { usePreferences } from '@/stores/preferences'
import type { QueueEditing } from '@/types/room'

export function CreateRoomPage() {
  const navigate = useNavigate()
  const { client, refresh } = useRoomClient()
  const savedName = usePreferences((state) => state.displayName)
  const setDisplayName = usePreferences((state) => state.setDisplayName)
  const remember = usePreferences((state) => state.rememberDisplayName)
  const [displayName, setName] = useState(savedName)
  const [roomName, setRoomName] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [requireApproval, setRequireApproval] = useState(false)
  const [queueEditing, setQueueEditing] = useState<QueueEditing>('everyone')
  const [maxParticipants, setMaxParticipants] = useState(String(DEFAULT_MAX_PARTICIPANTS))
  const [nameError, setNameError] = useState<string | null>(null)
  const [maxError, setMaxError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (savedName) setName((current) => current || savedName)
  }, [savedName])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const name = normalizeDisplayName(displayName)
    const max = Number(maxParticipants)
    let valid = true
    if (!name) {
      setNameError('Enter a display name up to 40 characters.')
      valid = false
    } else {
      setNameError(null)
    }
    if (!Number.isInteger(max) || max < MIN_PARTICIPANTS || max > MAX_PARTICIPANTS) {
      setMaxError(`Choose a limit from ${MIN_PARTICIPANTS} to ${MAX_PARTICIPANTS}.`)
      valid = false
    } else {
      setMaxError(null)
    }
    if (!valid || !name) return

    setSubmitting(true)
    setFormError(null)
    try {
      const result = await client.create({
        displayName: name,
        roomName,
        source: 'youtube',
        isPublic,
        requireApproval,
        queueEditing,
        maxParticipants: max,
        ttlMinutes: ROOM_TTL_MINUTES,
        sessionId: getSessionId(),
      })
      if (remember) setDisplayName(name)
      rememberMembership(result.room.id, result.participantId)
      refresh()
      navigate(`/room/${result.room.id}`)
    } catch (error) {
      setSubmitting(false)
      setFormError(errorMessage(error, 'Could not create the room.'))
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Create a room</h1>
      <p className="mt-2 text-sm text-muted">
        The room stays open for {ROOM_TTL_MINUTES / 60} hours. Other phones join with the code from the same Wi-Fi address as this page.
      </p>
      <Card className="mt-6">
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Display name (required)" htmlFor="display-name" error={nameError}>
            <Input value={displayName} onChange={(event) => setName(event.target.value)} autoComplete="nickname" maxLength={40} />
          </Field>
          <Field label="Room name (optional)" htmlFor="room-name" hint="Leave blank to use your name.">
            <Input value={roomName} onChange={(event) => setRoomName(event.target.value)} maxLength={60} />
          </Field>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Playback source</legend>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="radio" name="source" value="youtube" defaultChecked />
              YouTube
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm text-muted">
              <input type="radio" name="source" value="spotify" disabled />
              Spotify — unavailable. Synchronized Spotify playback is not enabled.
            </label>
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Who can find the room</legend>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="radio" name="visibility" checked={isPublic} onChange={() => setIsPublic(true)} />
              Listed as public in the room details
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="radio" name="visibility" checked={!isPublic} onChange={() => setIsPublic(false)} />
              Unlisted. People still need the code to join.
            </label>
          </fieldset>
          <Checkbox
            label="Require host approval before someone can listen"
            checked={requireApproval}
            onChange={(event) => setRequireApproval(event.target.checked)}
          />
          <Field label="Who can edit the queue" htmlFor="queue-editing">
            <Select
              value={queueEditing}
              onChange={(event) => setQueueEditing(event.target.value as QueueEditing)}
            >
              <option value="everyone">Everyone in the room</option>
              <option value="host">Host only</option>
            </Select>
          </Field>
          <Field
            label="Maximum people (required)"
            htmlFor="max-people"
            hint={`From ${MIN_PARTICIPANTS} to ${MAX_PARTICIPANTS}, including the host.`}
            error={maxError}
          >
            <Input
              type="number"
              min={MIN_PARTICIPANTS}
              max={MAX_PARTICIPANTS}
              value={maxParticipants}
              onChange={(event) => setMaxParticipants(event.target.value)}
            />
          </Field>
          <p className="text-sm text-muted">
            The room expires {ROOM_TTL_MINUTES / 60} hours after it is created. Closing it, or the last person leaving, removes it sooner.
          </p>
          {formError ? <Notice tone="danger">{formError}</Notice> : null}
          <Button type="submit" disabled={submitting} aria-busy={submitting}>
            {submitting ? 'Creating room…' : 'Create room'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
