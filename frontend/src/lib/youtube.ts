const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const HOSTS = new Set([
  'youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
])

export function isYouTubeVideoId(value: string): boolean {
  return VIDEO_ID.test(value)
}

export function parseYouTubeVideoId(raw: string): string | null {
  const input = raw.trim()
  if (!input || input.length > 300) return null
  if (VIDEO_ID.test(input)) return input

  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.replace(/^www\./, '').toLowerCase()
  if (!HOSTS.has(host)) return null

  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0] ?? ''
    return VIDEO_ID.test(id) ? id : null
  }

  if (url.pathname === '/watch') {
    const id = url.searchParams.get('v') ?? ''
    return VIDEO_ID.test(id) ? id : null
  }

  const parts = url.pathname.split('/').filter(Boolean)
  if ((parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') && parts[1] && VIDEO_ID.test(parts[1])) {
    return parts[1]
  }

  return null
}
