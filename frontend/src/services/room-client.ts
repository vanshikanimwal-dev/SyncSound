import type { CreateRoomInput, JoinResult, JoinRoomInput, Room } from '@/types/room'

export type Maybe<T> = T | Promise<T>

export interface RoomClient {
  readonly mode: 'local' | 'remote'
  readonly connection?: 'offline' | 'connecting' | 'live' | 'reconnecting'
  create(input: CreateRoomInput): Maybe<{ room: Room; participantId: string; token?: string }>
  join(input: JoinRoomInput): Maybe<JoinResult & { token?: string }>
  getById(roomId: string): Maybe<Room>
  touch(roomId: string, participantId: string): Maybe<Room>
  leave(roomId: string, participantId: string): Maybe<{ closed: boolean; room: Room | null }>
  close(roomId: string, participantId: string): Maybe<void>
  approve(roomId: string, hostParticipantId: string, targetParticipantId: string): Maybe<Room>
  deny(roomId: string, hostParticipantId: string, targetParticipantId: string): Maybe<Room>
  removeParticipant(roomId: string, hostParticipantId: string, targetParticipantId: string): Maybe<Room>
  addQueueItem(input: { roomId: string; participantId: string; mediaId: string; title: string }): Maybe<Room>
  removeQueueItem(roomId: string, participantId: string, itemId: string): Maybe<Room>
  moveQueueItem(roomId: string, participantId: string, itemId: string, direction: 'up' | 'down'): Maybe<Room>
  selectTrack(roomId: string, participantId: string, itemId: string): Maybe<Room>
  play?(roomId: string, revision: number): Maybe<Room>
  pause?(roomId: string, revision: number): Maybe<Room>
  seek?(roomId: string, revision: number, positionSeconds: number): Maybe<Room>
  subscribe?(roomId: string, onChange: () => void): () => void
}
