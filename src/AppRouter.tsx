import { useAuth } from '@clerk/clerk-react'
import { Navigate, Route, Routes } from 'react-router-dom'
import LandingApp from './App'
import {
  AcceptInvitationPage,
  InvitationCompletePage,
  OnboardingPage,
  ProviderSettingsPage,
  SignInPage,
  SignUpPage,
  TeamPage,
} from './pages/AuthPages'
import { ClientDetailPage, DashboardPage, LedgerPage } from './pages/DashboardPage'

function RequireAccount({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, orgId } = useAuth()
  if (!isLoaded) return <div className="auth-shell"><p className="auth-copy">Loading…</p></div>
  if (!isSignedIn) return <Navigate to="/sign-in" replace />
  if (!orgId) return <Navigate to="/onboarding" replace />
  return children
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingApp />} />
      <Route path="/login" element={<Navigate to="/sign-in" replace />} />
      <Route path="/setup" element={<Navigate to="/onboarding" replace />} />
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="/sign-up/*" element={<SignUpPage />} />
      <Route path="/accept-invitation/complete" element={<InvitationCompletePage />} />
      <Route path="/accept-invitation/*" element={<AcceptInvitationPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/app" element={<RequireAccount><DashboardPage /></RequireAccount>} />
      <Route path="/app/ledger" element={<RequireAccount><LedgerPage /></RequireAccount>} />
      <Route path="/app/clients/:id" element={<RequireAccount><ClientDetailPage /></RequireAccount>} />
      <Route path="/app/team/*" element={<RequireAccount><TeamPage /></RequireAccount>} />
      <Route path="/app/settings" element={<RequireAccount><ProviderSettingsPage /></RequireAccount>} />
    </Routes>
  )
}
