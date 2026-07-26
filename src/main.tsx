import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider, useAuth } from '@clerk/clerk-react'
import { BrowserRouter } from 'react-router-dom'
import { AppRouter } from './AppRouter'
import { configureAuthTokenProvider } from './api'
import './styles.css'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined

function AuthenticatedRouter() {
  const { getToken } = useAuth()
  configureAuthTokenProvider(() => getToken())
  return (
    <BrowserRouter>
      <AppRouter />
    </BrowserRouter>
  )
}

if (!publishableKey) {
  throw new Error('VITE_CLERK_PUBLISHABLE_KEY is required')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={publishableKey}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
    >
      <AuthenticatedRouter />
    </ClerkProvider>
  </StrictMode>,
)
