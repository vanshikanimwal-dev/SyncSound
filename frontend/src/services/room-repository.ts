import type { Room } from '@/types/room'
import { RoomServiceError } from '@/services/room-errors'

export const LOCAL_ROOMS_STORAGE_KEY = 'syncsound.local.rooms.v1'

export interface RoomRepository {
  readAll(): Room[]
  writeAll(rooms: Room[]): void
}

function isRoom(value: unknown): value is Room {
  if (!value || typeof value !== 'object') return false
  const room = value as Partial<Room>
  return typeof room.id === 'string' && typeof room.code === 'string' && Array.isArray(room.participants) && Array.isArray(room.queue)
}

export class MemoryRoomRepository implements RoomRepository {
  private rooms: Room[] = []

  readAll(): Room[] {
    return structuredClone(this.rooms)
  }

  writeAll(rooms: Room[]): void {
    this.rooms = structuredClone(rooms)
  }
}

export class LocalStorageRoomRepository implements RoomRepository {
  readAll(): Room[] {
    try {
      const raw = localStorage.getItem(LOCAL_ROOMS_STORAGE_KEY)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isRoom)
    } catch {
      throw new RoomServiceError('INVALID_INPUT', 'This browser could not read saved rooms.')
    }
  }

  writeAll(rooms: Room[]): void {
    try {
      localStorage.setItem(LOCAL_ROOMS_STORAGE_KEY, JSON.stringify(rooms))
    } catch {
      throw new RoomServiceError('INVALID_INPUT', 'This browser could not save the room locally.')
    }
  }
}
