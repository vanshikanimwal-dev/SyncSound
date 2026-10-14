import { useState, type ReactNode } from 'react'
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { YoutubePlayer } from '@/components/music/YoutubePlayer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useRoomClient } from '@/features/rooms/room-client-context'
import { PLAYBACK_SYNC_DESCRIPTION, PLAYBACK_SYNC_LABEL } from '@/features/playback/status'
import { errorMessage } from '@/services/room-errors'
import type { PlaybackState, Room } from '@/types/room'

export function PlaybackPanel({ room, isHost = false }: { room: Room; isHost?: boolean }) {
  if (room.playback) return <SharedPlayback room={room} playback={room.playback} isHost={isHost} />
  const current = room.queue.find((item) => item.mediaId === room.currentMediaId) ?? null

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warn">{PLAYBACK_SYNC_LABEL}</Badge>
        <Badge>YouTube</Badge>
      </div>
      <div className="mt-4 flex gap-3">
        <div className="grid size-20 shrink-0 place-items-center rounded-md border border-line bg-elevated text-xs text-muted" aria-hidden="true">
          No image
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Current track</h2>
          <p className="truncate text-ink">{current ? current.title : 'No track selected'}</p>
          <p className="truncate text-sm text-muted">{current ? current.mediaId : 'Choose a queued video when you are the host.'}</p>
          <p className="text-sm text-muted">Channel and thumbnail metadata are unavailable until YouTube Data API is configured.</p>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted">
        <span>Current time unavailable</span>
        <span aria-hidden="true"> · </span>
        <span>Duration unavailable</span>
      </p>
      <div className="mt-3">
        <label className="grid gap-1 text-sm text-muted" htmlFor="seek">
          Seek
          <input id="seek" type="range" min={0} max={100} defaultValue={0} disabled className="w-full" />
        </label>
      </div>
      <div role="group" aria-label="Playback controls" aria-describedby="playback-unavailable" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TransportButton label="Previous">
          <SkipBack aria-hidden="true" className="size-4" />
        </TransportButton>
        <TransportButton label="Play">
          <Play aria-hidden="true" className="size-4" />
        </TransportButton>
        <TransportButton label="Pause">
          <Pause aria-hidden="true" className="size-4" />
        </TransportButton>
        <TransportButton label="Next">
          <SkipForward aria-hidden="true" className="size-4" />
        </TransportButton>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm text-muted" htmlFor="volume">
          Volume
          <input id="volume" type="range" min={0} max={100} defaultValue={100} disabled className="w-full" />
        </label>
        <button type="button" className="min-h-11 rounded-md border border-line px-3 text-sm text-muted" disabled>
          Mute
        </button>
      </div>
      <p id="playback-unavailable" className="mt-4 text-sm text-muted">
        {PLAYBACK_SYNC_DESCRIPTION} Volume stays with your phone and the YouTube player. SyncSound cannot pick a Bluetooth headset.
      </p>
    </Card>
  )
}

function TransportButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <button type="button" disabled className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-muted">
      {children}
      {label}
    </button>
  )
}

function SharedPlayback({ room, playback, isHost }: { room: Room; playback: PlaybackState; isHost: boolean }) {
  const { client, refresh } = useRoomClient()
  const [error, setError] = useState<string | null>(null)
  const current = room.queue.find((item) => item.mediaId === room.currentMediaId) ?? null
  const label = playback.status === 'playing' ? 'Playing on this phone' : playback.status === 'paused' ? 'Paused' : 'Playback unavailable'

  async function command(action: 'play' | 'pause') {
    if (!client.play || !client.pause) return
    try {
      if (action === 'play') await client.play(room.id, playback.revision)
      else await client.pause(room.id, playback.revision)
      setError(null)
      refresh()
    } catch (caught) {
      setError(errorMessage(caught, 'Could not update playback.'))
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={playback.status === 'playing' ? 'ok' : 'warn'}>{label}</Badge>
        <Badge>YouTube</Badge>
      </div>
      <div className="mt-4">
        <h2 className="text-lg font-semibold">Current track</h2>
        <p className="text-ink">{current ? current.title : 'No track selected'}</p>
        <p className="text-sm text-muted">{current ? current.mediaId : 'The host needs to set a video from the queue.'}</p>
      </div>
      {room.currentMediaId ? <div className="mt-4"><YoutubePlayer videoId={room.currentMediaId} playback={playback} /></div> : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button type="button" disabled={!isHost || !room.currentMediaId || playback.status === 'playing'} onClick={() => void command('play')}>
          <Play aria-hidden="true" className="size-4" />
          Play
        </Button>
        <Button type="button" variant="secondary" disabled={!isHost || playback.status !== 'playing'} onClick={() => void command('pause')}>
          <Pause aria-hidden="true" className="size-4" />
          Pause
        </Button>
      </div>
      <p className="mt-4 text-sm text-muted">
        Each phone plays this video through its own speaker or headphones. SyncSound cannot connect four Bluetooth headsets to one phone. Previous and next stay with the queue buttons.
      </p>
    </Card>
  )
}
