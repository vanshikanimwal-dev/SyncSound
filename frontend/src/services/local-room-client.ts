import {
  MAX_DISPLAY_NAME,
  MAX_PARTICIPANTS,
  MAX_QUEUE_ITEMS,
  MAX_QUEUE_TITLE,
  MAX_ROOM_NAME,
  MAX_TTL_MINUTES,
  MIN_PARTICIPANTS,
} from '@/lib/config'
import { generateRoomCode, isValidRoomCode, normalizeRoomCode, roomCodeError } from '@/lib/room-code'
import { cleanText, isUuid, normalizeDisplayName } from '@/lib/validation'
import { isYouTubeVideoId } from '@/lib/youtube'
import type { CreateRoomInput, JoinResult, JoinRoomInput, Participant, QueueItem, Room } from '@/types/room'
import { RoomServiceError } from '@/services/room-errors'
import type { RoomRepository } from '@/services/room-repository'

const NOT_FOUND = 'That room is not saved in this browser. Shared rooms need the SyncSound backend, which is not connected.'

/**
 * Browser-local room coordinator used by tests and when the server is not the source of truth.
 * The running app uses the backend client so phones can share a room.
 */
export class LocalRoomClient {
  readonly mode = 'local' as const
  constructor(
    private readonly repository: RoomRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  create(input: CreateRoomInput): { room: Room; participantId: string } {
    const displayName = this.requireName(input.displayName)
    const roomName = this.roomName(input.roomName, displayName)
    if (input.source !== 'youtube') {
      throw new RoomServiceError('INVALID_INPUT', 'YouTube is the only playback source available.')
    }
    if (typeof input.isPublic !== 'boolean' || typeof input.requireApproval !== 'boolean') {
      throw new RoomServiceError('INVALID_INPUT', 'Room visibility settings are invalid.')
    }
    if (input.queueEditing !== 'host' && input.queueEditing !== 'everyone') {
      throw new RoomServiceError('INVALID_INPUT', 'Choose who can edit the queue.')
    }
    if (!Number.isInteger(input.maxParticipants) || input.maxParticipants < MIN_PARTICIPANTS || input.maxParticipants > MAX_PARTICIPANTS) {
      throw new RoomServiceError('INVALID_INPUT', `Participant limit must be between ${MIN_PARTICIPANTS} and ${MAX_PARTICIPANTS}.`)
    }
    if (!Number.isInteger(input.ttlMinutes) || input.ttlMinutes < 1 || input.ttlMinutes > MAX_TTL_MINUTES) {
      throw new RoomServiceError('INVALID_INPUT', 'Room lifetime must be between 1 minute and 24 hours.')
    }
    const sessionId = this.requireSession(input.sessionId)
    const { active } = this.load()
    const createdAt = this.now()
    const hostId = crypto.randomUUID()
    const host = this.participant({
      id: hostId,
      sessionId,
      displayName,
      role: 'host',
      membershipStatus: 'active',
      at: createdAt,
    })
    const room: Room = {
      id: crypto.randomUUID(),
      code: this.uniqueCode(active),
      name: roomName,
      hostParticipantId: hostId,
      settings: {
        isPublic: input.isPublic,
        requireApproval: input.requireApproval,
        queueEditing: input.queueEditing,
        maxParticipants: input.maxParticipants,
        source: 'youtube',
        ttlMinutes: input.ttlMinutes,
      },
      participants: [host],
      queue: [],
      currentMediaId: null,
      createdAt: createdAt.toISOString(),
      lastActivityAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + input.ttlMinutes * 60_000).toISOString(),
    }
    active.push(room)
    this.repository.writeAll(active)
    return { room, participantId: hostId }
  }

  join(input: JoinRoomInput): JoinResult {
    const codeError = roomCodeError(input.code)
    if (codeError || !isValidRoomCode(input.code)) {
      throw new RoomServiceError('INVALID_INPUT', codeError ?? 'Enter a valid room code.')
    }
    const displayName = this.requireName(input.displayName)
    const sessionId = this.requireSession(input.sessionId)
    const code = normalizeRoomCode(input.code)
    const { active, expired } = this.load()
    if (expired.some((room) => room.code === code)) {
      throw new RoomServiceError('ROOM_EXPIRED', 'This room has expired.')
    }
    const index = active.findIndex((room) => room.code === code)
    if (index < 0) throw new RoomServiceError('ROOM_NOT_FOUND', NOT_FOUND)

    const room = structuredClone(active[index])
    const existing = room.participants.find((participant) => participant.sessionId === sessionId)
    if (existing) {
      existing.displayName = displayName
      existing.lastSeenAt = this.now().toISOString()
      if (existing.membershipStatus === 'active') existing.connectionState = 'connected'
      this.commit(active, index, room)
      return existing.membershipStatus === 'pending'
        ? { status: 'pending', room, participantId: existing.id }
        : { status: 'joined', room, participantId: existing.id }
    }

    if (room.participants.length >= room.settings.maxParticipants) {
      throw new RoomServiceError('ROOM_FULL', 'This room is full.')
    }

    const at = this.now()
    const participant = this.participant({
      id: crypto.randomUUID(),
      sessionId,
      displayName,
      role: 'listener',
      membershipStatus: room.settings.requireApproval ? 'pending' : 'active',
      at,
    })
    room.participants.push(participant)
    this.commit(active, index, room)
    return participant.membershipStatus === 'pending'
      ? { status: 'pending', room, participantId: participant.id }
      : { status: 'joined', room, participantId: participant.id }
  }

  getById(roomId: string): Room {
    const { active, expired } = this.load()
    if (expired.some((room) => room.id === roomId)) {
      throw new RoomServiceError('ROOM_EXPIRED', 'This room has expired.')
    }
    const room = active.find((item) => item.id === roomId)
    if (!room) throw new RoomServiceError('ROOM_NOT_FOUND', NOT_FOUND)
    return room
  }

  touch(roomId: string, participantId: string): Room {
    return this.update(roomId, (room) => {
      const participant = room.participants.find((item) => item.id === participantId)
      if (!participant) return room
      participant.lastSeenAt = this.now().toISOString()
      if (participant.membershipStatus === 'active') participant.connectionState = 'connected'
      return room
    })
  }

  updateDisplayName(roomId: string, participantId: string, displayName: string): Room {
    const name = this.requireName(displayName)
    return this.update(roomId, (room) => {
      const participant = room.participants.find((item) => item.id === participantId)
      if (!participant) throw new RoomServiceError('UNAUTHORIZED', "You don't have permission to do that.")
      participant.displayName = name
      return room
    })
  }

  approve(roomId: string, hostParticipantId: string, targetParticipantId: string): Room {
    return this.update(roomId, (room) => {
      this.requireHost(room, hostParticipantId)
      const target = room.participants.find((item) => item.id === targetParticipantId)
      if (!target || target.membershipStatus !== 'pending') {
        throw new RoomServiceError('INVALID_INPUT', 'That person is not waiting for approval.')
      }
      const activeCount = room.participants.filter((item) => item.membershipStatus === 'active').length
      if (activeCount >= room.settings.maxParticipants) {
        throw new RoomServiceError('ROOM_FULL', 'This room is full.')
      }
      target.membershipStatus = 'active'
      target.role = 'listener'
      target.connectionState = 'connected'
      return room
    })
  }

  deny(roomId: string, hostParticipantId: string, targetParticipantId: string): Room {
    return this.update(roomId, (room) => {
      this.requireHost(room, hostParticipantId)
      const target = room.participants.find((item) => item.id === targetParticipantId)
      if (!target || target.membershipStatus !== 'pending') {
        throw new RoomServiceError('INVALID_INPUT', 'That person is not waiting for approval.')
      }
      room.participants = room.participants.filter((item) => item.id !== targetParticipantId)
      return room
    })
  }

  removeParticipant(roomId: string, hostParticipantId: string, targetParticipantId: string): Room {
    return this.update(roomId, (room) => {
      this.requireHost(room, hostParticipantId)
      if (targetParticipantId === hostParticipantId) {
        throw new RoomServiceError('UNAUTHORIZED', 'Leave the room or close it instead of removing yourself.')
      }
      const target = room.participants.find((item) => item.id === targetParticipantId && item.membershipStatus === 'active')
      if (!target) throw new RoomServiceError('INVALID_INPUT', 'That person is not in the room.')
      room.participants = room.participants.filter((item) => item.id !== targetParticipantId)
      return room
    })
  }

  leave(roomId: string, participantId: string): { closed: boolean; room: Room | null } {
    const { active, expired } = this.load()
    if (expired.some((room) => room.id === roomId)) {
      throw new RoomServiceError('ROOM_EXPIRED', 'This room has expired.')
    }
    const index = active.findIndex((room) => room.id === roomId)
    if (index < 0) throw new RoomServiceError('ROOM_NOT_FOUND', NOT_FOUND)
    const room = structuredClone(active[index])
    const participant = room.participants.find((item) => item.id === participantId)
    if (!participant) throw new RoomServiceError('UNAUTHORIZED', "You don't have permission to do that.")

    const wasHost = room.hostParticipantId === participantId
    room.participants = room.participants.filter((item) => item.id !== participantId)
    const remainingActive = room.participants
      .filter((item) => item.membershipStatus === 'active')
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))

    if (remainingActive.length === 0) {
      this.repository.writeAll(active.filter((item) => item.id !== roomId))
      return { closed: true, room: null }
    }

    if (wasHost) {
      const nextHost = remainingActive[0]
      room.hostParticipantId = nextHost.id
      room.participants = room.participants.map((item) => (item.id === nextHost.id ? { ...item, role: 'host' } : item))
    }

    this.commit(active, index, room)
    return { closed: false, room }
  }

  close(roomId: string, participantId: string): void {
    const room = this.getById(roomId)
    this.requireHost(room, participantId)
    const { active } = this.load()
    this.repository.writeAll(active.filter((item) => item.id !== roomId))
  }

  addQueueItem(input: { roomId: string; participantId: string; mediaId: string; title: string }): Room {
    return this.update(input.roomId, (room) => {
      this.requireQueueEditor(room, input.participantId)
      if (!isYouTubeVideoId(input.mediaId)) {
        throw new RoomServiceError('INVALID_MEDIA', 'Enter a YouTube video URL or an 11-character video ID.')
      }
      if (room.queue.some((item) => item.mediaId === input.mediaId)) {
        throw new RoomServiceError('DUPLICATE_MEDIA', 'That video is already in the queue.')
      }
      if (room.queue.length >= MAX_QUEUE_ITEMS) {
        throw new RoomServiceError('INVALID_INPUT', `The queue already has ${MAX_QUEUE_ITEMS} videos.`)
      }
      const title = this.queueTitle(input.title)
      const item: QueueItem = {
        id: crypto.randomUUID(),
        provider: 'youtube',
        mediaId: input.mediaId,
        title,
        addedByParticipantId: input.participantId,
        addedAt: this.now().toISOString(),
        position: room.queue.length,
        error: null,
      }
      room.queue = [...room.queue, item]
      return room
    })
  }

  removeQueueItem(roomId: string, participantId: string, itemId: string): Room {
    return this.update(roomId, (room) => {
      this.requireQueueEditor(room, participantId)
      const item = room.queue.find((entry) => entry.id === itemId)
      if (!item) throw new RoomServiceError('INVALID_INPUT', 'That queue item is no longer in the queue.')
      room.queue = reindex(room.queue.filter((entry) => entry.id !== itemId))
      if (room.currentMediaId === item.mediaId) room.currentMediaId = null
      return room
    })
  }

  moveQueueItem(roomId: string, participantId: string, itemId: string, direction: 'up' | 'down'): Room {
    return this.update(roomId, (room) => {
      this.requireQueueEditor(room, participantId)
      const index = room.queue.findIndex((entry) => entry.id === itemId)
      if (index < 0) throw new RoomServiceError('INVALID_INPUT', 'That queue item is no longer in the queue.')
      const target = index + (direction === 'up' ? -1 : 1)
      if (target < 0 || target >= room.queue.length) return room
      const next = room.queue.slice()
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      room.queue = reindex(next)
      return room
    })
  }

  selectTrack(roomId: string, participantId: string, itemId: string): Room {
    return this.update(roomId, (room) => {
      this.requireHost(room, participantId)
      const item = room.queue.find((entry) => entry.id === itemId)
      if (!item) throw new RoomServiceError('INVALID_MEDIA', 'That queue item is no longer available.')
      room.currentMediaId = item.mediaId
      return room
    })
  }

  private update(roomId: string, mutate: (room: Room) => Room): Room {
    const { active, expired } = this.load()
    if (expired.some((room) => room.id === roomId)) {
      throw new RoomServiceError('ROOM_EXPIRED', 'This room has expired.')
    }
    const index = active.findIndex((room) => room.id === roomId)
    if (index < 0) throw new RoomServiceError('ROOM_NOT_FOUND', NOT_FOUND)
    const next = mutate(structuredClone(active[index]))
    return this.commit(active, index, next)
  }

  private commit(active: Room[], index: number, room: Room): Room {
    room.lastActivityAt = this.now().toISOString()
    active[index] = room
    this.repository.writeAll(active)
    return room
  }

  private load(): { active: Room[]; expired: Room[] } {
    const now = this.now().getTime()
    const all = this.repository.readAll()
    const expired = all.filter((room) => Date.parse(room.expiresAt) <= now)
    const active = all.filter((room) => Date.parse(room.expiresAt) > now)
    if (expired.length > 0) this.repository.writeAll(active)
    return { active, expired }
  }

  private uniqueCode(rooms: Room[]): string {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = generateRoomCode()
      if (!rooms.some((room) => room.code === code)) return code
    }
    throw new RoomServiceError('INVALID_INPUT', 'Could not assign a room code. Try again.')
  }

  private requireName(value: string): string {
    const name = normalizeDisplayName(value)
    if (!name) {
      throw new RoomServiceError('INVALID_INPUT', `Enter a display name up to ${MAX_DISPLAY_NAME} characters.`)
    }
    return name
  }

  private requireSession(sessionId: string): string {
    if (!isUuid(sessionId)) throw new RoomServiceError('INVALID_INPUT', 'This browser session is invalid. Reload and try again.')
    return sessionId
  }

  private roomName(value: string, displayName: string): string {
    const cleaned = cleanText(value)
    if (!cleaned) {
      const fallback = `${displayName}'s room`
      return fallback.length > MAX_ROOM_NAME ? fallback.slice(0, MAX_ROOM_NAME) : fallback
    }
    if (cleaned.length > MAX_ROOM_NAME) {
      throw new RoomServiceError('INVALID_INPUT', `Room name must be ${MAX_ROOM_NAME} characters or fewer.`)
    }
    return cleaned
  }

  private queueTitle(value: string): string {
    const cleaned = cleanText(value)
    if (!cleaned) return 'YouTube video'
    if (cleaned.length > MAX_QUEUE_TITLE) {
      throw new RoomServiceError('INVALID_INPUT', `Title must be ${MAX_QUEUE_TITLE} characters or fewer.`)
    }
    return cleaned
  }

  private requireHost(room: Room, participantId: string): Participant {
    const participant = this.requireActive(room, participantId)
    if (participant.role !== 'host' || room.hostParticipantId !== participantId) {
      throw new RoomServiceError('UNAUTHORIZED', 'Only the host can do that.')
    }
    return participant
  }

  private requireQueueEditor(room: Room, participantId: string): Participant {
    const participant = this.requireActive(room, participantId)
    if (room.settings.queueEditing === 'host' && participant.role !== 'host') {
      throw new RoomServiceError('UNAUTHORIZED', 'Only the host can edit the queue in this room.')
    }
    return participant
  }

  private requireActive(room: Room, participantId: string): Participant {
    const participant = room.participants.find((item) => item.id === participantId)
    if (!participant || participant.membershipStatus !== 'active') {
      throw new RoomServiceError('UNAUTHORIZED', "You don't have permission to do that.")
    }
    return participant
  }

  private participant(input: {
    id: string
    sessionId: string
    displayName: string
    role: Participant['role']
    membershipStatus: Participant['membershipStatus']
    at: Date
  }): Participant {
    return {
      id: input.id,
      sessionId: input.sessionId,
      displayName: input.displayName,
      role: input.role,
      connectionState: input.membershipStatus === 'active' ? 'connected' : 'disconnected',
      membershipStatus: input.membershipStatus,
      joinedAt: input.at.toISOString(),
      lastSeenAt: input.at.toISOString(),
    }
  }
}

function reindex(queue: QueueItem[]): QueueItem[] {
  return queue.map((item, position) => ({ ...item, position }))
}
