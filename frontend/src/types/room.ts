export type QueueEditing = 'host' | 'everyone'
export type MembershipStatus = 'active' | 'pending'
export type ParticipantRole = 'host' | 'listener'
export type ConnectionState = 'connected' | 'disconnected'

export interface Participant {
  id: string
  sessionId: string
  displayName: string
  role: ParticipantRole
  connectionState: ConnectionState
  membershipStatus: MembershipStatus
  joinedAt: string
  lastSeenAt: string
}

export interface QueueItem {
  id: string
  provider: 'youtube'
  mediaId: string
  title: string
  addedByParticipantId: string
  addedAt: string
  position: number
  error: string | null
}

export interface RoomSettings {
  isPublic: boolean
  requireApproval: boolean
  queueEditing: QueueEditing
  maxParticipants: number
  source: 'youtube'
  ttlMinutes: number
}

export interface PlaybackState {
  status: 'idle' | 'playing' | 'paused'
  positionSeconds: number
  anchorServerMs: number | null
  revision: number
}

export interface Room {
  id: string
  code: string
  name: string
  hostParticipantId: string
  settings: RoomSettings
  participants: Participant[]
  queue: QueueItem[]
  currentMediaId: string | null
  playback?: PlaybackState
  createdAt: string
  lastActivityAt: string
  expiresAt: string
}

export interface CreateRoomInput {
  displayName: string
  roomName: string
  source: 'youtube'
  isPublic: boolean
  requireApproval: boolean
  queueEditing: QueueEditing
  maxParticipants: number
  ttlMinutes: number
  sessionId: string
}

export interface JoinRoomInput {
  code: string
  displayName: string
  sessionId: string
}

export type JoinResult =
  | { status: 'joined'; room: Room; participantId: string }
  | { status: 'pending'; room: Room; participantId: string }
