import { serverNow } from '@/features/playback/clock'
import type { PlaybackState } from '@/types/room'

export function expectedPosition(playback: PlaybackState, nowMs = serverNow()): number {
  if (playback.status !== 'playing' || playback.anchorServerMs == null) return playback.positionSeconds
  return playback.positionSeconds + Math.max(0, (nowMs - playback.anchorServerMs) / 1000)
}
