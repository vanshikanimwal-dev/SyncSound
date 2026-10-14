export type RoomErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_EXPIRED'
  | 'ROOM_FULL'
  | 'UNAUTHORIZED'
  | 'INVALID_MEDIA'
  | 'INVALID_INPUT'
  | 'DUPLICATE_MEDIA'
  | 'STALE_REVISION'
  | 'RATE_LIMITED'
  | 'PLAYBACK_NOT_READY'
  | 'SERVER_UNAVAILABLE'

export class RoomServiceError extends Error {
  readonly code: RoomErrorCode

  constructor(code: RoomErrorCode, message: string) {
    super(message)
    this.name = 'RoomServiceError'
    this.code = code
  }
}

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof RoomServiceError) return error.message
  return fallback
}
