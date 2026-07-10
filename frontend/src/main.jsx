import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CookiesProvider } from 'react-cookie'
// A sorrend kötött: az index.css és a Bootstrap !important-szabályai közti
// döntetleneket a később betöltött nyeri — a design a Bootstrap győzelmére épít
// (pl. a .no-focus transzparens színét a .text-* utility írja felül).
import './index.css'
import 'bootstrap/dist/css/bootstrap.min.css'
import App from './components/app.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CookiesProvider>
      <App />
    </CookiesProvider>
  </StrictMode>,
)
