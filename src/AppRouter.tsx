import { Route, Routes } from 'react-router-dom'
import LandingApp from './App'
import { LoginPage, SetupPage } from './pages/AuthPages'
import { ClientDetailPage, DashboardPage, LedgerPage } from './pages/DashboardPage'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingApp />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/app" element={<DashboardPage />} />
      <Route path="/app/ledger" element={<LedgerPage />} />
      <Route path="/app/clients/:id" element={<ClientDetailPage />} />
    </Routes>
  )
}
