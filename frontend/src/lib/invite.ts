export function invitePath(code: string): string {
  return `/join?code=${encodeURIComponent(code)}`
}

export function inviteUrl(code: string): string {
  return `${window.location.origin}${invitePath(code)}`
}

export function youTubePlaybackUrl(): string | null {
  const { protocol, hostname, port, pathname, search } = window.location
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)) return null
  const suffix = port ? `:${port}` : ''
  return `${protocol}//${hostname}.sslip.io${suffix}${pathname}${search}`
}
