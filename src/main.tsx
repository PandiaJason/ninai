import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './components/workspace/Workspace.css'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { ToastProvider } from './components/ui/Toast.tsx'

// macOS uses a hidden-inset title bar, so the shell reserves space for the
// traffic lights. Every other platform gets a compact, edge-to-edge sidebar.
const isMac = /mac/i.test(navigator.userAgent)
document.documentElement.classList.toggle('is-mac', isMac)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AuthProvider>
  </StrictMode>,
)
