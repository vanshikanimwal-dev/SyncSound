import { render, type RenderResult } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '@/app/App'
import { RoomClientProvider } from '@/features/rooms/room-client-context'
import { LocalRoomClient } from '@/services/local-room-client'
import { MemoryRoomRepository } from '@/services/room-repository'

export function renderAt(path: string, client = new LocalRoomClient(new MemoryRoomRepository())): RenderResult & { client: LocalRoomClient } {
  const view = render(
    <RoomClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </RoomClientProvider>,
  )
  return { client, ...view }
}
