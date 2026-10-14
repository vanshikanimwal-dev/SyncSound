import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppRoutes } from '@/app/App'
import { RoomClientProvider } from '@/features/rooms/room-client-context'
import { rememberMembership } from '@/lib/session'
import { LocalRoomClient } from '@/services/local-room-client'
import { MemoryRoomRepository } from '@/services/room-repository'
import { usePreferences } from '@/stores/preferences'
import type { CreateRoomInput } from '@/types/room'
import { renderAt } from './helpers'

describe('landing page', () => {
  it('explains separate-phone listening and checks the room code', async () => {
    const user = userEvent.setup()
    renderAt('/')
    expect(screen.getByRole('heading', { name: /listen together/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create a room' })).toBeInTheDocument()
    expect(screen.getByText(/not sample-accurate/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Room code'), 'IIIII1')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/6-character/)
  })

  it('opens the join page with a normalized code', async () => {
    const user = userEvent.setup()
    renderAt('/')
    await user.type(screen.getByLabelText('Room code'), 'abc234')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Join a room' })).toBeInTheDocument()
    expect(screen.getByLabelText('Room code (required)')).toHaveValue('ABC234')
  })
})

describe('create and join', () => {
  beforeEach(() => {
    usePreferences.setState({ displayName: '' })
  })

  it('creates a local room and shows the host', async () => {
    const user = userEvent.setup()
    renderAt('/create')
    await user.type(screen.getByLabelText('Display name (required)'), 'Ava')
    await user.click(screen.getByRole('button', { name: 'Create room' }))
    expect(await screen.findByRole('heading', { name: "Ava's room" })).toBeInTheDocument()
    expect(screen.getByText(/local preview/i)).toBeInTheDocument()
    expect(screen.getByText('Host')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
  })

  it('shows a useful message for an unknown code', async () => {
    const user = userEvent.setup()
    renderAt('/join')
    await user.type(screen.getByLabelText('Room code (required)'), 'ABC234')
    await user.type(screen.getByLabelText('Display name (required)'), 'Bea')
    await user.click(screen.getByRole('button', { name: 'Join room' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/not saved in this browser/i)
  })

  it('requires a display name before creating a room', async () => {
    const user = userEvent.setup()
    renderAt('/create')
    await user.click(screen.getByRole('button', { name: 'Create room' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/display name/i)
  })
})

describe('room page', () => {
  function createRoom(overrides: Partial<CreateRoomInput> = {}) {
    const client = new LocalRoomClient(new MemoryRoomRepository())
    const created = client.create({
      displayName: 'Ava',
      roomName: 'Night drive',
      source: 'youtube',
      isPublic: true,
      requireApproval: false,
      queueEditing: 'everyone',
      maxParticipants: 4,
      ttlMinutes: 240,
      sessionId: crypto.randomUUID(),
      ...overrides,
    })
    rememberMembership(created.room.id, created.participantId)
    return { client, created }
  }

  it('adds a video id, selects it, and leaves playback unavailable', async () => {
    const user = userEvent.setup()
    const { client, created } = createRoom()
    render(
      <RoomClientProvider client={client}>
        <MemoryRouter initialEntries={[`/room/${created.room.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      </RoomClientProvider>,
    )
    expect(await screen.findByRole('heading', { name: 'Night drive' })).toBeInTheDocument()
    expect(screen.getByText('Playback unavailable')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/YouTube URL or video ID/i), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    await user.click(screen.getByRole('button', { name: 'Add to queue' }))
    expect(await screen.findByText('dQw4w9WgXcQ')).toBeInTheDocument()
    expect(screen.getByText('Added by Ava')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Set as current' }))
    expect(await screen.findByRole('button', { name: 'Current track' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
    expect(screen.getByLabelText('Seek')).toBeDisabled()
  })

  it('lets the host approve a waiting listener', async () => {
    const user = userEvent.setup()
    const { client, created } = createRoom({ requireApproval: true })
    client.join({ code: created.room.code, displayName: 'Bea', sessionId: crypto.randomUUID() })
    render(
      <RoomClientProvider client={client}>
        <MemoryRouter initialEntries={[`/room/${created.room.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      </RoomClientProvider>,
    )
    expect(await screen.findByText('Awaiting approval')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText('Listener')).toBeInTheDocument()
  })

  it('shows the headphone steps and can hide them', async () => {
    const user = userEvent.setup()
    usePreferences.setState({ showBluetoothHelp: true })
    const { client, created } = createRoom()
    render(
      <RoomClientProvider client={client}>
        <MemoryRouter initialEntries={[`/room/${created.room.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      </RoomClientProvider>,
    )
    expect(await screen.findByRole('heading', { name: 'Use your own headphones' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hide this help' }))
    expect(screen.queryByRole('heading', { name: 'Use your own headphones' })).not.toBeInTheDocument()
  })
})
