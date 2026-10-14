import { isUuid } from '@/lib/validation'

const SESSION_KEY = 'syncsound.session.v1'
const MEMBERSHIP_KEY = 'syncsound.memberships.v1'

export function createSessionUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function getSessionId(): string {
  const existing = sessionStorage.getItem(SESSION_KEY)
  if (existing && isUuid(existing)) return existing
  const created = createSessionUuid()
  sessionStorage.setItem(SESSION_KEY, created)
  return created
}

function readMemberships(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(MEMBERSHIP_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const entries = Object.entries(parsed).filter((entry): entry is [string, string] => {
      return typeof entry[0] === 'string' && typeof entry[1] === 'string'
    })
    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}

export function rememberMembership(roomId: string, participantId: string): void {
  const memberships = readMemberships()
  memberships[roomId] = participantId
  sessionStorage.setItem(MEMBERSHIP_KEY, JSON.stringify(memberships))
}

export function membershipFor(roomId: string): string | null {
  return readMemberships()[roomId] ?? null
}

export function forgetMembership(roomId: string): void {
  const memberships = readMemberships()
  delete memberships[roomId]
  sessionStorage.setItem(MEMBERSHIP_KEY, JSON.stringify(memberships))
}

const TOKEN_KEY = 'syncsound.tokens.v1'

function readTokens(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  } catch {
    return {}
  }
}

export function rememberToken(roomId: string, token: string): void {
  const tokens = readTokens()
  tokens[roomId] = token
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(tokens))
}

export function tokenFor(roomId: string): string | null {
  return readTokens()[roomId] ?? null
}

export function forgetToken(roomId: string): void {
  const tokens = readTokens()
  delete tokens[roomId]
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(tokens))
}
