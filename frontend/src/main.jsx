import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CookiesProvider } from 'react-cookie'
import { config } from '@fortawesome/fontawesome-svg-core'
// A FontAwesome alapból FUTÁSIDŐBEN injektálja a CSS-ét a <head>-be — addig az
// ikonok méretezés nélkül, natúr nagyságban jelennek meg, majd a helyükre
// ugranak. Statikusan importáljuk (a bundle része lesz), az injektálást pedig
// kikapcsoljuk; így az ikonok azonnal a végleges méretükben rajzolódnak ki.
import '@fortawesome/fontawesome-svg-core/styles.css'
// A sorrend kötött: az index.css és a Bootstrap !important-szabályai közti
// döntetleneket a később betöltött nyeri — a design a Bootstrap győzelmére épít
// (pl. a .no-focus transzparens színét a .text-* utility írja felül).
import './index.css'
import 'bootstrap/dist/css/bootstrap.min.css'
import App from './components/app.jsx'

config.autoAddCss = false

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CookiesProvider>
      <App />
    </CookiesProvider>
  </StrictMode>,
)
