import { Route, Routes } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import { AppProviders } from '@/app/providers'
import { CreateRoomPage } from '@/routes/CreateRoomPage'
import { JoinRoomPage } from '@/routes/JoinRoomPage'
import { LandingPage } from '@/routes/LandingPage'
import { NotFoundPage } from '@/routes/NotFoundPage'
import { PrivacyPage } from '@/routes/PrivacyPage'
import { RoomPage } from '@/routes/RoomPage'
import { SettingsPage } from '@/routes/SettingsPage'
import { TermsPage } from '@/routes/TermsPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PageShell />}>
        <Route index element={<LandingPage />} />
        <Route path="create" element={<CreateRoomPage />} />
        <Route path="join" element={<JoinRoomPage />} />
        <Route path="room/:roomId" element={<RoomPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="terms" element={<TermsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  )
}
