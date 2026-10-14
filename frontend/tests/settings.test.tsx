import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { usePreferences } from '@/stores/preferences'
import { renderAt } from './helpers'

describe('settings', () => {
  it('saves a display name and theme on this device', async () => {
    const user = userEvent.setup()
    renderAt('/settings')
    await user.type(screen.getByLabelText('Display name'), 'Ava')
    await user.click(screen.getByRole('button', { name: 'Save preferences' }))
    expect(await screen.findByText('Saved on this device.')).toBeInTheDocument()
    expect(usePreferences.getState().displayName).toBe('Ava')
    await user.click(screen.getByLabelText('Light'))
    expect(usePreferences.getState().theme).toBe('light')
    expect(screen.getByText(/Spotify: not connected/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /disconnect/i })).not.toBeInTheDocument()
  })
})
