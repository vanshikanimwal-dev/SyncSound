import { MAX_DISPLAY_NAME } from '@/lib/config'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

export function cleanText(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim()
}

export function normalizeDisplayName(value: string, allowEmpty = false): string | null {
  const cleaned = cleanText(value)
  if (!cleaned) return allowEmpty ? '' : null
  if (cleaned.length > MAX_DISPLAY_NAME) return null
  return cleaned
}
