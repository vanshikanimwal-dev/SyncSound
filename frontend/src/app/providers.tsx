import { useEffect, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiRoomClient } from '@/services/api-room-client'
import { RoomClientProvider } from '@/features/rooms/room-client-context'
import { usePreferences } from '@/stores/preferences'

function ThemeSync() {
  const theme = usePreferences((state) => state.theme)

  useEffect(() => {
    const apply = () => {
      const resolved =
        theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
    }
    apply()
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  return null
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  const [roomClient] = useState(() => new ApiRoomClient())

  return (
    <QueryClientProvider client={queryClient}>
      <RoomClientProvider client={roomClient}>
        <ThemeSync />
        {children}
      </RoomClientProvider>
    </QueryClientProvider>
  )
}
