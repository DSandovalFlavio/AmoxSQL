import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Self-hosted fonts (bundled, offline — no external CDN calls)
import '@fontsource/manrope/400.css'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/600.css'
import '@fontsource/manrope/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/lato/400.css'
import '@fontsource/lato/700.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/lora/400.css'
import '@fontsource/lora/500.css'
import '@fontsource/lora/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'

import './index.css'
import App from './App.jsx'
import { ToastProvider } from './components/ToastProvider.jsx'
import { DialogProvider } from './components/dialogs/DialogProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <DialogProvider>
        <App />
      </DialogProvider>
    </ToastProvider>
  </StrictMode>,
)
