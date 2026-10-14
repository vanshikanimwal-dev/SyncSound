import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { RoomClient } from '@/services/room-client'

interface RoomClientContextValue {
  client: RoomClient
  version: number
  refresh: () => void
}

const RoomClientContext = createContext<RoomClientContextValue | null>(null)

export function RoomClientProvider({ client, children }: { client: RoomClient; children: ReactNode }) {
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion((value) => value + 1), [])
  const value = useMemo(() => ({ client, version, refresh }), [client, version, refresh])
  return <RoomClientContext.Provider value={value}>{children}</RoomClientContext.Provider>
}

export function useRoomClient(): RoomClientContextValue {
  const value = useContext(RoomClientContext)
  if (!value) throw new Error('Room client is missing from the React tree.')
  return value
}
