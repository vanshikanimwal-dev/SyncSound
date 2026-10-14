import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/notice'
import { getSessionId, rememberMembership } from '@/lib/session'
import { normalizeRoomCode, roomCodeError } from '@/lib/room-code'
import { normalizeDisplayName } from '@/lib/validation'
import { useRoomClient } from '@/features/rooms/room-client-context'
import { errorMessage } from '@/services/room-errors'
import { usePreferences } from '@/stores/preferences'

export function JoinRoomPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { client, refresh } = useRoomClient()
  const savedName = usePreferences((state) => state.displayName)
  const setDisplayName = usePreferences((state) => state.setDisplayName)
  const remember = usePreferences((state) => state.rememberDisplayName)
  const initialCode = params.get('code') ?? ''
  const [code, setCode] = useState(initialCode ? normalizeRoomCode(initialCode) : '')
  const [displayName, setName] = useState(savedName)
  const [codeError, setCodeError] = useState<string | null>(initialCode && roomCodeError(initialCode) ? roomCodeError(initialCode) : null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (savedName) setName((current) => current || savedName)
  }, [savedName])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const nextCodeError = roomCodeError(code)
    const name = normalizeDisplayName(displayName)
    setCodeError(nextCodeError)
    setNameError(name ? null : 'Enter a display name up to 40 characters.')
    if (nextCodeError || !name) return

    setSubmitting(true)
    setFormError(null)
    try {
      const result = await client.join({ code, displayName: name, sessionId: getSessionId() })
      if (remember) setDisplayName(name)
      rememberMembership(result.room.id, result.participantId)
      refresh()
      navigate(`/room/${result.room.id}`)
    } catch (error) {
      setSubmitting(false)
      setFormError(errorMessage(error, 'Could not join that room.'))
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Join a room</h1>
      <p className="mt-2 text-sm text-muted">Use a room code or an invitation link. A QR code opens this page with the code filled in.</p>
      <Card className="mt-6">
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Room code (required)" htmlFor="join-code" error={codeError}>
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={12}
            />
          </Field>
          <Field label="Display name (required)" htmlFor="join-name" error={nameError}>
            <Input value={displayName} onChange={(event) => setName(event.target.value)} autoComplete="nickname" maxLength={40} />
          </Field>
          {formError ? <Notice tone="danger">{formError}</Notice> : null}
          <Button type="submit" disabled={submitting} aria-busy={submitting}>
            {submitting ? 'Joining…' : 'Join room'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
