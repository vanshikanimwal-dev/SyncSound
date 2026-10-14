import { describe, expect, it } from 'vitest'
import { generateRoomCode, isValidRoomCode, normalizeRoomCode, roomCodeError } from '@/lib/room-code'

describe('room codes', () => {
  it('normalizes spaces, dashes, and case', () => {
    expect(normalizeRoomCode(' ab-c234 ')).toBe('ABC234')
  })

  it('rejects ambiguous characters', () => {
    expect(isValidRoomCode('ABC23O')).toBe(false)
    expect(isValidRoomCode('ABC231')).toBe(false)
    expect(roomCodeError('nope')).toMatch(/6-character/)
  })

  it('accepts a generated code', () => {
    const code = generateRoomCode()
    expect(isValidRoomCode(code)).toBe(true)
    expect(code).toHaveLength(6)
  })
})
