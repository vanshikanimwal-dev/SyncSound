import { describe, expect, it } from 'vitest'
import { LocalRoomClient } from '@/services/local-room-client'
import { RoomServiceError } from '@/services/room-errors'
import { MemoryRoomRepository } from '@/services/room-repository'
import type { CreateRoomInput, JoinResult } from '@/types/room'

function makeClient(start = new Date('2026-10-13T12:00:00Z')) {
  let current = start
  const repository = new MemoryRoomRepository()
  const client = new LocalRoomClient(repository, () => current)
  return {
    client,
    repository,
    setNow(date: Date) {
      current = date
    },
  }
}

function createInput(overrides: Partial<CreateRoomInput> = {}): CreateRoomInput {
  return {
    displayName: 'Ava',
    roomName: 'Listening',
    source: 'youtube',
    isPublic: true,
    requireApproval: false,
    queueEditing: 'everyone',
    maxParticipants: 4,
    ttlMinutes: 240,
    sessionId: crypto.randomUUID(),
    ...overrides,
  }
}

function catchError(run: () => void): RoomServiceError {
  try {
    run()
  } catch (error) {
    if (error instanceof RoomServiceError) return error
    throw error
  }
  throw new Error('Expected a room error')
}

function joined(result: JoinResult): Extract<JoinResult, { status: 'joined' }> {
  if (result.status !== 'joined') throw new Error('Expected an active join')
  return result
}

describe('local room client', () => {
  it('creates a room with a host and a code', () => {
    const { client } = makeClient()
    const created = client.create(createInput({ isPublic: false, queueEditing: 'host' }))
    expect(created.room.code).toHaveLength(6)
    expect(created.room.hostParticipantId).toBe(created.participantId)
    expect(created.room.settings.isPublic).toBe(false)
    expect(created.room.settings.queueEditing).toBe('host')
    expect(created.room.participants[0]?.role).toBe('host')
  })

  it('rejects a blank display name and an invalid room code', () => {
    const { client } = makeClient()
    expect(catchError(() => client.create(createInput({ displayName: '   ' }))).code).toBe('INVALID_INPUT')
    expect(catchError(() => client.join({ code: 'NO', displayName: 'Bea', sessionId: crypto.randomUUID() })).code).toBe('INVALID_INPUT')
    expect(catchError(() => client.join({ code: 'ABC234', displayName: 'Bea', sessionId: crypto.randomUUID() })).code).toBe('ROOM_NOT_FOUND')
  })

  it('expires a room and removes it', () => {
    const { client, repository, setNow } = makeClient()
    const created = client.create(createInput({ ttlMinutes: 60 }))
    setNow(new Date('2026-10-13T13:00:00Z'))
    expect(catchError(() => client.getById(created.room.id)).code).toBe('ROOM_EXPIRED')
    expect(repository.readAll()).toHaveLength(0)
    expect(catchError(() => client.join({ code: created.room.code, displayName: 'Bea', sessionId: crypto.randomUUID() })).code).toBe('ROOM_NOT_FOUND')
  })

  it('rejects joins past the participant limit and reconnects the same session', () => {
    const { client } = makeClient()
    const created = client.create(createInput({ maxParticipants: 2 }))
    const sessionId = crypto.randomUUID()
    const first = joined(client.join({ code: created.room.code, displayName: 'Bea', sessionId }))
    const again = joined(client.join({ code: created.room.code, displayName: 'Bea', sessionId }))
    expect(again.participantId).toBe(first.participantId)
    expect(again.room.participants.filter((participant) => participant.membershipStatus === 'active')).toHaveLength(2)
    expect(catchError(() => client.join({ code: created.room.code, displayName: 'Cam', sessionId: crypto.randomUUID() })).code).toBe('ROOM_FULL')
  })

  it('keeps a listener pending until the host approves', () => {
    const { client } = makeClient()
    const created = client.create(createInput({ requireApproval: true, queueEditing: 'everyone' }))
    const pending = client.join({ code: created.room.code, displayName: 'Bea', sessionId: crypto.randomUUID() })
    expect(pending.status).toBe('pending')
    expect(
      catchError(() =>
        client.addQueueItem({
          roomId: created.room.id,
          participantId: pending.participantId,
          mediaId: 'dQw4w9WgXcQ',
          title: '',
        }),
      ).code,
    ).toBe('UNAUTHORIZED')
    const approved = client.approve(created.room.id, created.participantId, pending.participantId)
    expect(approved.participants.find((participant) => participant.id === pending.participantId)?.membershipStatus).toBe('active')
  })

  it('rejects listener queue edits when the host keeps the queue', () => {
    const { client } = makeClient()
    const created = client.create(createInput({ queueEditing: 'host' }))
    const listener = joined(client.join({ code: created.room.code, displayName: 'Bea', sessionId: crypto.randomUUID() }))
    expect(
      catchError(() =>
        client.addQueueItem({
          roomId: created.room.id,
          participantId: listener.participantId,
          mediaId: 'dQw4w9WgXcQ',
          title: 'Song',
        }),
      ).code,
    ).toBe('UNAUTHORIZED')
  })

  it('orders the queue, rejects duplicates and invalid ids, and clears the selection on remove', () => {
    const { client } = makeClient()
    const created = client.create(createInput())
    const first = client.addQueueItem({ roomId: created.room.id, participantId: created.participantId, mediaId: 'aaaaaaaaaaa', title: 'A' })
    const second = client.addQueueItem({ roomId: created.room.id, participantId: created.participantId, mediaId: 'bbbbbbbbbbb', title: 'B' })
    const third = client.addQueueItem({ roomId: created.room.id, participantId: created.participantId, mediaId: 'ccccccccccc', title: 'C' })
    expect(third.queue.map((item) => item.title)).toEqual(['A', 'B', 'C'])
    const moved = client.moveQueueItem(created.room.id, created.participantId, third.queue[2]!.id, 'up')
    expect(moved.queue.map((item) => item.title)).toEqual(['A', 'C', 'B'])
    expect(moved.queue.map((item) => item.position)).toEqual([0, 1, 2])
    expect(
      catchError(() =>
        client.addQueueItem({ roomId: created.room.id, participantId: created.participantId, mediaId: 'bbbbbbbbbbb', title: 'Again' }),
      ).code,
    ).toBe('DUPLICATE_MEDIA')
    expect(
      catchError(() =>
        client.addQueueItem({ roomId: created.room.id, participantId: created.participantId, mediaId: 'not-an-id', title: 'Bad' }),
      ).code,
    ).toBe('INVALID_MEDIA')
    const selected = client.selectTrack(created.room.id, created.participantId, second.queue[1]!.id)
    expect(selected.currentMediaId).toBe('bbbbbbbbbbb')
    const removed = client.removeQueueItem(created.room.id, created.participantId, second.queue[1]!.id)
    expect(removed.currentMediaId).toBeNull()
    expect(removed.queue).toHaveLength(2)
    expect(first.queue[0]?.addedByParticipantId).toBe(created.participantId)
  })

  it('rejects a listener selecting the current track', () => {
    const { client } = makeClient()
    const created = client.create(createInput())
    const queued = client.addQueueItem({ roomId: created.room.id, participantId: created.participantId, mediaId: 'dQw4w9WgXcQ', title: 'Song' })
    const listener = joined(client.join({ code: created.room.code, displayName: 'Bea', sessionId: crypto.randomUUID() }))
    expect(catchError(() => client.selectTrack(created.room.id, listener.participantId, queued.queue[0]!.id)).code).toBe('UNAUTHORIZED')
    expect(catchError(() => client.close(created.room.id, listener.participantId)).code).toBe('UNAUTHORIZED')
    expect(catchError(() => client.removeParticipant(created.room.id, created.participantId, created.participantId)).code).toBe('UNAUTHORIZED')
  })

  it('transfers the host when the host leaves and closes an empty room', () => {
    const { client, repository } = makeClient()
    const created = client.create(createInput())
    const listener = joined(client.join({ code: created.room.code, displayName: 'Bea', sessionId: crypto.randomUUID() }))
    const transferred = client.leave(created.room.id, created.participantId)
    expect(transferred.closed).toBe(false)
    expect(transferred.room?.hostParticipantId).toBe(listener.participantId)
    expect(transferred.room?.participants.find((participant) => participant.id === listener.participantId)?.role).toBe('host')
    const closed = client.leave(created.room.id, listener.participantId)
    expect(closed.closed).toBe(true)
    expect(repository.readAll()).toHaveLength(0)
  })
})
