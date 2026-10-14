import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { serverNow } from '@/features/playback/clock'
import { expectedPosition } from '@/features/playback/sync'
import type { PlaybackState } from '@/types/room'

interface YTPlayer {
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  getCurrentTime: () => number
  getDuration: () => number
  getPlayerState: () => number
  destroy: () => void
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string
      playerVars?: Record<string, string | number>
      events?: { onReady?: () => void; onError?: (event: { data?: number }) => void }
    },
  ) => YTPlayer
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<void> | null = null

function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve()
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => reject(new Error('youtube'))
    document.head.appendChild(script)
  })
  return apiPromise
}

export function YoutubePlayer({ videoId, playback }: { videoId: string; playback: PlaybackState }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const playbackRef = useRef(playback)
  const [needsGesture, setNeedsGesture] = useState(false)
  const [error, setError] = useState<string | null>(null)
  playbackRef.current = playback

  useEffect(() => {
    let cancelled = false
    const mount = hostRef.current
    if (!mount) return
    loadYouTubeApi()
      .then(() => {
        if (cancelled || !window.YT || !hostRef.current) return
        const player = new window.YT.Player(hostRef.current, {
          videoId,
          playerVars: playerVars(),
          events: {
            onReady: () => {
              playerRef.current = player
              stampYouTubeFrame(player)
              applyPlayback(player, playbackRef.current, setNeedsGesture)
            },
            onError: (event) => setError(embedErrorMessage(event?.data)),
          },
        })
      })
      .catch(() => {
        if (!cancelled) setError('The YouTube player could not load. Check the connection and try again.')
      })
    return () => {
      cancelled = true
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [videoId])

  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    return applyPlayback(player, playback, setNeedsGesture)
  }, [playback])

  useEffect(() => {
    if (playback.status !== 'playing') return
    let lastSeek = 0
    const timer = window.setInterval(() => {
      const player = playerRef.current
      if (!player || player.getPlayerState() === 3) return
      const expected = expectedPosition(playback)
      const duration = player.getDuration()
      if (duration > 0 && expected > duration - 0.25) return
      const actual = player.getCurrentTime()
      if (Math.abs(expected - actual) > 0.75 && Date.now() - lastSeek > 3000) {
        lastSeek = Date.now()
        player.seekTo(expected, true)
      }
    }, 2000)
    return () => window.clearInterval(timer)
  }, [playback])

  function syncNow() {
    const player = playerRef.current
    if (!player) return
    player.seekTo(expectedPosition(playbackRef.current), true)
    player.playVideo()
    setNeedsGesture(false)
  }

  return (
    <div className="grid gap-3">
      <div ref={hostRef} className="aspect-video w-full overflow-hidden rounded-md bg-black" />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {playback.status === 'playing' ? (
        <Button type="button" onClick={syncNow}>
          {needsGesture ? 'Tap to sync and listen' : 'Sync this phone'}
        </Button>
      ) : null}
      <p className="text-sm text-muted">
        Sound comes from this phone’s selected output, including headphones paired in the phone’s Bluetooth settings. Timing is close, not sample-accurate.
      </p>
    </div>
  )
}

function playerVars(): Record<string, string | number> {
  const vars: Record<string, string | number> = { rel: 0 }
  const { hostname, origin, protocol } = window.location
  const local = hostname === 'localhost' || hostname === '127.0.0.1'
  if (protocol === 'https:' || local) vars.origin = origin
  return vars
}

function stampYouTubeFrame(player: YTPlayer & { getIframe?: () => HTMLIFrameElement }): void {
  const frame = player.getIframe?.()
  frame?.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
}

function embedErrorMessage(code: number | undefined): string {
  if (code === 101 || code === 150) {
    return 'YouTube will not play this video inside SyncSound. Pick another one from the queue.'
  }
  if (code === 2 || code === 100) {
    return 'YouTube cannot find this video. Check the link and try another one.'
  }
  return 'YouTube could not start this video. Reload the page, or pick another one from the queue.'
}

function applyPlayback(player: YTPlayer, playback: PlaybackState, setNeedsGesture: (value: boolean) => void): () => void {
  let timer = 0
  let gestureTimer = 0
  if (playback.status === 'playing') {
    const wait = (playback.anchorServerMs ?? serverNow()) - serverNow()
    const start = () => {
      player.seekTo(expectedPosition(playback), true)
      player.playVideo()
      gestureTimer = window.setTimeout(() => {
        if (player.getPlayerState() !== 1) setNeedsGesture(true)
      }, 900)
    }
    if (wait > 80) timer = window.setTimeout(start, wait)
    else start()
  } else {
    player.pauseVideo()
    if (playback.status === 'paused') player.seekTo(playback.positionSeconds, true)
  }
  return () => {
    window.clearTimeout(timer)
    window.clearTimeout(gestureTimer)
  }
}
