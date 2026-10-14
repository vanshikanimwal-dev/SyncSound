import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { usePreferences } from '@/stores/preferences'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  usePreferences.setState({
    displayName: '',
    rememberDisplayName: true,
    theme: 'dark',
    showBluetoothHelp: true,
  })
})
