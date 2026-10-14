import { describe, expect, it } from 'vitest'
import { createSessionUuid, getSessionId } from '@/lib/session'
import { isUuid } from '@/lib/validation'

describe('session ids on a phone address', () => {
  it('builds a uuid when randomUUID is missing', () => {
    const original = crypto.randomUUID
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined })
    try {
      const created = createSessionUuid()
      expect(isUuid(created)).toBe(true)
      expect(created).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: original })
    }
  })

  it('keeps the same session id for later joins', () => {
    const first = getSessionId()
    expect(getSessionId()).toBe(first)
  })
})
