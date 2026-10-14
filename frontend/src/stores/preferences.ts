import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemePreference = 'dark' | 'light' | 'system'

type PreferencesState = {
  displayName: string
  rememberDisplayName: boolean
  theme: ThemePreference
  showBluetoothHelp: boolean
  setDisplayName: (displayName: string) => void
  setRememberDisplayName: (rememberDisplayName: boolean) => void
  setTheme: (theme: ThemePreference) => void
  setShowBluetoothHelp: (showBluetoothHelp: boolean) => void
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      displayName: '',
      rememberDisplayName: true,
      theme: 'dark',
      showBluetoothHelp: true,
      setDisplayName: (displayName) => set({ displayName }),
      setRememberDisplayName: (rememberDisplayName) => set({ rememberDisplayName }),
      setTheme: (theme) => set({ theme }),
      setShowBluetoothHelp: (showBluetoothHelp) => set({ showBluetoothHelp }),
    }),
    {
      name: 'syncsound.preferences.v1',
      partialize: (state) => ({
        displayName: state.rememberDisplayName ? state.displayName : '',
        rememberDisplayName: state.rememberDisplayName,
        theme: state.theme,
        showBluetoothHelp: state.showBluetoothHelp,
      }),
    },
  ),
)
