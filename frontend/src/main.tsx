// fetch for iOS < 10.3 / old Android WebView (no-op when the browser already has it).
import 'whatwg-fetch'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
