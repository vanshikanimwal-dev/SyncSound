import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BluetoothHelp } from '@/components/music/BluetoothHelp'
import { ParticipantList } from '@/components/participants/ParticipantList'
import { InvitePanel } from '@/components/room/InvitePanel'
import { PlaybackPanel } from '@/components/room/PlaybackPanel'
import { QueuePanel } from '@/components/room/QueuePanel'
import { Badge } from '@/components/ui/badge'
import { Button, buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Notice } from '@/components/ui/notice'
import { Skeleton } from '@/components/ui/skeleton'
import { useRoomLookup } from '@/features/rooms/use-room-lookup'
import { useRoomClient } from '@/features/rooms/room-client-context'
import { formatTimestamp } from '@/lib/format'
import { invitePath } from '@/lib/invite'
import { forgetMembership, forgetToken, membershipFor } from '@/lib/session'
import { errorMessage } from '@/services/room-errors'
import { usePreferences } from '@/stores/preferences'
import type { Participant, Room } from '@/types/room'

export function RoomPage() {
  const { roomId } = useParams()
  const lookup = useRoomLookup(roomId)
  const { client, refresh } = useRoomClient()
  const participantId = roomId ? membershipFor(roomId) : null

  useEffect(() => {
    if (!roomId || !client.subscribe) return
    return client.subscribe(roomId, refresh)
  }, [client, refresh, roomId])

  if (lookup.status === 'loading') {
    return (
      <div className="mx-auto grid max-w-5xl gap-4 px-4 py-8">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    )
  }

  if (lookup.status === 'expired') {
    return (
      <RoomMessage title="This room has expired" body="Create a new room or ask the host for a new code." />
    )
  }

  if (lookup.status === 'missing') {
    return (
      <RoomMessage
        title="Room not available"
        body={lookup.message ?? 'That room is not available. Check the code, or create a new room.'}
      />
    )
  }

  const self = lookup.room.participants.find((participant) => participant.id === participantId) ?? null
  if (!self) {
    return (
      <RoomMessage
        title={lookup.room.name}
        body="This tab has not joined the room."
        action={
          <Link to={invitePath(lookup.room.code)} className={buttonClasses('primary')}>
            Join this room
          </Link>
        }
      />
    )
  }

  if (self.membershipStatus === 'pending') {
    return <PendingRoom room={lookup.room} self={self} />
  }

  return <ActiveRoom room={lookup.room} self={self} />
}

function ActiveRoom({ room, self }: { room: Room; self: Participant }) {
  const navigate = useNavigate()
  const { client, refresh } = useRoomClient()
  const showHelp = usePreferences((state) => state.showBluetoothHelp)
  const [confirmClose, setConfirmClose] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isHost = self.role === 'host'

  function leave() {
    void (async () => {
      try {
        await client.leave(room.id, self.id)
        forgetMembership(room.id)
        forgetToken(room.id)
        refresh()
        navigate('/')
      } catch (caught) {
        setError(errorMessage(caught, 'Could not leave the room.'))
      }
    })()
  }

  function closeRoom() {
    void (async () => {
      try {
        await client.close(room.id, self.id)
        forgetMembership(room.id)
        forgetToken(room.id)
        refresh()
        navigate('/')
      } catch (caught) {
        setError(errorMessage(caught, 'Could not close the room.'))
      }
    })()
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-4 px-4 py-6">
      <Notice tone={client.mode === 'remote' ? 'info' : 'warn'}>
        {client.mode === 'remote'
          ? 'Each person joins on their own phone. Pair headphones in that phone’s Bluetooth settings. SyncSound cannot attach four headsets to this device.'
          : 'Local preview. This room stays in this browser and is not shared with other phones until the SyncSound backend is running.'}
      </Notice>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{room.name}</h1>
          <p className="mt-1 text-sm text-muted">Expires {formatTimestamp(room.expiresAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={room.settings.isPublic ? 'ok' : 'neutral'}>{room.settings.isPublic ? 'Public' : 'Unlisted'}</Badge>
          {room.settings.requireApproval ? <Badge tone="warn">Approval required</Badge> : null}
          <Badge>{room.settings.queueEditing === 'host' ? 'Host edits queue' : 'Shared queue'}</Badge>
        </div>
      </div>
      <InvitePanel code={room.code} />
      <PlaybackPanel room={room} isHost={isHost} />
      <QueuePanel room={room} participantId={self.id} />
      <ParticipantList room={room} participantId={self.id} />
      {showHelp ? <BluetoothHelp /> : null}
      <div className="flex flex-wrap gap-2 pb-4">
        <Button type="button" variant="secondary" onClick={leave}>
          Leave room
        </Button>
        {isHost ? (
          confirmClose ? (
            <Button type="button" variant="danger" onClick={closeRoom}>
              Close room for everyone
            </Button>
          ) : (
            <Button type="button" variant="danger" onClick={() => setConfirmClose(true)}>
              Close room
            </Button>
          )
        ) : null}
      </div>
    </div>
  )
}

function PendingRoom({ room, self }: { room: Room; self: Participant }) {
  const navigate = useNavigate()
  const { client, refresh } = useRoomClient()
  const [error, setError] = useState<string | null>(null)

  function cancel() {
    void (async () => {
      try {
        await client.leave(room.id, self.id)
        forgetMembership(room.id)
        forgetToken(room.id)
        refresh()
        navigate('/')
      } catch (caught) {
        setError(errorMessage(caught, 'Could not cancel the request.'))
      }
    })()
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <Card>
        <h1 className="text-2xl font-semibold">{room.name}</h1>
        <p className="mt-3 text-sm text-muted">The host needs to approve {self.displayName} before you can listen.</p>
        {error ? <Notice tone="danger" className="mt-3">{error}</Notice> : null}
        <Button type="button" variant="secondary" className="mt-4" onClick={cancel}>
          Cancel request
        </Button>
      </Card>
    </div>
  )
}

function RoomMessage({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <Card>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm text-muted">{body}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {action}
          <Link to="/create" className={buttonClasses('secondary')}>
            Create a room
          </Link>
        </div>
      </Card>
    </div>
  )
}
