import { useEffect, useState } from 'react'
import { membershipFor } from '@/lib/session'
import { RoomServiceError } from '@/services/room-errors'
import type { Room } from '@/types/room'
import { useRoomClient } from '@/features/rooms/room-client-context'

export type RoomLookup =
  | { status: 'loading' }
  | { status: 'missing'; message?: string }
  | { status: 'expired' }
  | { status: 'ready'; room: Room }

export function useRoomLookup(roomId: string | undefined): RoomLookup {
  const { client, version } = useRoomClient()
  const [state, setState] = useState<RoomLookup>({ status: 'loading' })

  useEffect(() => {
    let active = true
    if (!roomId) {
      setState({ status: 'missing' })
      return () => {
        active = false
      }
    }

    void (async () => {
      try {
        let room = await client.getById(roomId)
        const participantId = membershipFor(roomId)
        if (participantId && client.mode === 'local') room = await client.touch(roomId, participantId)
        if (active) setState({ status: 'ready', room })
      } catch (error) {
        if (!active) return
        if (error instanceof RoomServiceError && error.code === 'ROOM_EXPIRED') {
          setState({ status: 'expired' })
          return
        }
        const message = error instanceof RoomServiceError ? error.message : 'That room is not available.'
        setState({ status: 'missing', message })
      }
    })()

    return () => {
      active = false
    }
  }, [client, roomId, version])

  return state
}
