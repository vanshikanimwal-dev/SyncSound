let offsetMs = 0

export function noteServerTime(serverTimeMs: number): void {
  offsetMs = serverTimeMs - Date.now()
}

export function serverNow(): number {
  return Date.now() + offsetMs
}
