import { RoomServiceError, type RoomErrorCode } from '@/services/room-errors'
import { forgetToken, rememberToken, tokenFor } from '@/lib/session'
import { noteServerTime } from '@/features/playback/clock'
import type { CreateRoomInput, JoinResult, JoinRoomInput, Room } from '@/types/room'

interface MembershipResponse {
  status: 'joined' | 'pending'
  participantId: string
  token: string
  room: Room
}

export class ApiRoomClient {
  readonly mode = 'remote' as const
  connection: 'offline' | 'connecting' | 'live' | 'reconnecting' = 'offline'
  private readonly cache = new Map<string, Room>()

  async create(input: CreateRoomInput): Promise<{ room: Room; participantId: string; token: string }> {
    const body = await this.request<MembershipResponse>('/api/rooms', { method: 'POST', body: input })
    this.remember(body)
    return { room: body.room, participantId: body.participantId, token: body.token }
  }

  async join(input: JoinRoomInput): Promise<JoinResult & { token: string }> {
    const body = await this.request<MembershipResponse>('/api/rooms/join', { method: 'POST', body: input })
    this.remember(body)
    return { status: body.status, room: body.room, participantId: body.participantId, token: body.token }
  }

  async getById(roomId: string): Promise<Room> {
    const cached = this.cache.get(roomId)
    if (cached) return cached
    const room = await this.request<Room>(`/api/rooms/${roomId}`, { method: 'GET', roomId })
    this.cache.set(roomId, room)
    return room
  }

  async touch(roomId: string, _participantId: string): Promise<Room> {
    return this.getById(roomId)
  }

  leave(roomId: string, _participantId: string): Promise<{ closed: boolean; room: Room | null }> {
    return this.request<{ closed: boolean; room: Room | null }>(`/api/rooms/${roomId}/leave`, { method: 'POST', roomId }).finally(() => {
      forgetToken(roomId)
      this.cache.delete(roomId)
    })
  }

  async close(roomId: string, _participantId: string): Promise<void> {
    await this.request(`/api/rooms/${roomId}/close`, { method: 'POST', roomId })
    forgetToken(roomId)
    this.cache.delete(roomId)
  }

  approve(roomId: string, _hostParticipantId: string, targetParticipantId: string): Promise<Room> {
    return this.mutate(roomId, '/approve', { targetParticipantId })
  }

  deny(roomId: string, _hostParticipantId: string, targetParticipantId: string): Promise<Room> {
    return this.mutate(roomId, '/deny', { targetParticipantId })
  }

  removeParticipant(roomId: string, _hostParticipantId: string, targetParticipantId: string): Promise<Room> {
    return this.mutate(roomId, '/participants/remove', { targetParticipantId })
  }

  addQueueItem(input: { roomId: string; participantId: string; mediaId: string; title: string }): Promise<Room> {
    return this.mutate(input.roomId, '/queue', { mediaId: input.mediaId, title: input.title })
  }

  removeQueueItem(roomId: string, _participantId: string, itemId: string): Promise<Room> {
    return this.mutate(roomId, '/queue/remove', { itemId })
  }

  moveQueueItem(roomId: string, _participantId: string, itemId: string, direction: 'up' | 'down'): Promise<Room> {
    return this.mutate(roomId, '/queue/move', { itemId, direction })
  }

  selectTrack(roomId: string, _participantId: string, itemId: string): Promise<Room> {
    return this.mutate(roomId, '/select', { itemId })
  }

  play(roomId: string, revision: number): Promise<Room> {
    return this.mutate(roomId, '/playback', { action: 'play', revision })
  }

  pause(roomId: string, revision: number): Promise<Room> {
    return this.mutate(roomId, '/playback', { action: 'pause', revision })
  }

  seek(roomId: string, revision: number, positionSeconds: number): Promise<Room> {
    return this.mutate(roomId, '/playback', { action: 'seek', revision, positionSeconds })
  }

  subscribe(roomId: string, onChange: () => void): () => void {
    let closed = false
    let socket: WebSocket | null = null
    let attempt = 0
    let timer = 0

    const connect = () => {
      if (closed) return
      const token = tokenFor(roomId)
      if (!token) return
      this.connection = attempt === 0 ? 'connecting' : 'reconnecting'
      onChange()
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      socket = new WebSocket(`${protocol}://${window.location.host}/ws/rooms/${roomId}?token=${encodeURIComponent(token)}`)
      socket.onopen = () => {
        attempt = 0
        this.connection = 'live'
        onChange()
      }
      socket.onmessage = (event: MessageEvent<string>) => {
        const message = JSON.parse(event.data) as {
          type?: string
          room?: Room
          serverTimeMs?: number
        }
        if (typeof message.serverTimeMs === 'number') noteServerTime(message.serverTimeMs)
        if (message.type === 'room.snapshot' && message.room) {
          this.cache.set(roomId, message.room)
          onChange()
        }
        if (message.type === 'room.closed') {
          this.cache.delete(roomId)
          onChange()
        }
      }
      socket.onclose = () => {
        if (closed) return
        attempt += 1
        if (attempt > 6) {
          this.connection = 'offline'
          onChange()
          return
        }
        this.connection = 'reconnecting'
        onChange()
        timer = window.setTimeout(connect, Math.min(1000 * 2 ** attempt, 8000))
      }
    }

    connect()
    return () => {
      closed = true
      window.clearTimeout(timer)
      socket?.close()
      this.connection = 'offline'
    }
  }

  private remember(body: MembershipResponse): void {
    this.cache.set(body.room.id, body.room)
    rememberToken(body.room.id, body.token)
  }

  private async mutate(roomId: string, path: string, body: unknown): Promise<Room> {
    const room = await this.request<Room>(`/api/rooms/${roomId}${path}`, { method: 'POST', body, roomId })
    this.cache.set(roomId, room)
    return room
  }

  private async request<T>(path: string, init: { method: string; body?: unknown; roomId?: string }): Promise<T> {
    const headers: Record<string, string> = {}
    if (init.body !== undefined) headers['Content-Type'] = 'application/json'
    if (init.roomId) {
      const token = tokenFor(init.roomId)
      if (token) headers.Authorization = `Bearer ${token}`
    }
    let response: Response
    try {
      response = await fetch(path, {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      })
    } catch {
      throw new RoomServiceError('SERVER_UNAVAILABLE', 'The SyncSound server is not running. Start the backend and try again.')
    }
    const payload = (await response.json().catch(() => null)) as { code?: RoomErrorCode; message?: string } | T | null
    if (!response.ok) {
      const error = payload as { code?: RoomErrorCode; message?: string } | null
      if (!error?.message && response.status >= 500) {
        throw new RoomServiceError(
          'SERVER_UNAVAILABLE',
          'The SyncSound server is not running. Start the backend and try again.',
        )
      }
      const code = error?.code ?? 'INVALID_INPUT'
      throw new RoomServiceError(code, error?.message ?? 'The server could not complete that request.')
    }
    return payload as T
  }
}
