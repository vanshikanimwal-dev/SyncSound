import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Notice } from '@/components/ui/notice'
import { useRoomClient } from '@/features/rooms/room-client-context'
import { errorMessage } from '@/services/room-errors'
import type { Room } from '@/types/room'

export function ParticipantList({ room, participantId }: { room: Room; participantId: string }) {
  const { client, refresh } = useRoomClient()
  const self = room.participants.find((participant) => participant.id === participantId)
  const isHost = self?.role === 'host'
  const active = room.participants.filter((participant) => participant.membershipStatus === 'active')
  const pending = room.participants.filter((participant) => participant.membershipStatus === 'pending')
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<unknown> | unknown) {
    try {
      await action()
      setError(null)
      refresh()
    } catch (caught) {
      setError(errorMessage(caught, 'Could not update participants.'))
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">People</h2>
      <p className="mt-1 text-sm text-muted">
        {active.length} of {room.settings.maxParticipants} joined.
        {client.mode === 'remote' ? ' Connected means that phone has the room open.' : ' Presence here is membership in this browser, not a live connection between phones.'}
      </p>
      {error ? <Notice tone="danger" className="mt-3">{error}</Notice> : null}
      <ul className="mt-4 grid gap-3">
        {active.map((participant) => (
          <li key={participant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-elevated px-3 py-3">
            <div>
              <p className="font-medium text-ink">
                {participant.displayName}
                {participant.id === participantId ? <span className="text-muted"> (you)</span> : null}
              </p>
              <p className="text-sm text-muted">{client.mode === 'remote' ? (participant.connectionState === 'connected' ? 'Connected' : 'Reconnecting') : 'Joined'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {participant.role === 'host' ? <Badge tone="accent">Host</Badge> : <Badge>Listener</Badge>}
              {isHost && participant.id !== participantId ? (
                <Button type="button" variant="danger" onClick={() => void run(() => client.removeParticipant(room.id, participantId, participant.id))}>
                  Remove {participant.displayName}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {pending.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-ink">Waiting for approval</h3>
          <ul className="mt-3 grid gap-3">
            {pending.map((participant) => (
              <li key={participant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line px-3 py-3">
                <div>
                  <p className="font-medium">{participant.displayName}</p>
                  <p className="text-sm text-muted">Awaiting approval</p>
                </div>
                {isHost ? (
                  <div className="flex gap-2">
                    <Button type="button" onClick={() => void run(() => client.approve(room.id, participantId, participant.id))}>
                      Approve
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => void run(() => client.deny(room.id, participantId, participant.id))}>
                      Decline
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  )
}
