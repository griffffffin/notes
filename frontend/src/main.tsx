import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CookiesProvider } from 'react-cookie'
import { config } from '@fortawesome/fontawesome-svg-core'
// A FontAwesome alapból FUTÁSIDŐBEN injektálja a CSS-ét a <head>-be — addig az
// ikonok méretezés nélkül, natúr nagyságban jelennek meg, majd a helyükre
// ugranak. Statikusan importáljuk (a bundle része lesz), az injektálást pedig
// kikapcsoljuk; így az ikonok azonnal a végleges méretükben rajzolódnak ki.
import '@fortawesome/fontawesome-svg-core/styles.css'
// Ugyanez a react-tooltipnél: ő is futásidőben injektálná a CSS-ét (késve, és a
// saját z-index-ével). Statikusan importáljuk — az injektálást a Tooltip
// komponens disableStyleInjection propja kapcsolja ki.
import 'react-tooltip/dist/react-tooltip.css'
// A sorrend kötött: az index.css és a Bootstrap !important-szabályai közti
// döntetleneket a később betöltött nyeri — a design a Bootstrap győzelmére épít
// (pl. a .no-focus transzparens színét a .text-* utility írja felül).
import './index.css'
import 'bootstrap/dist/css/bootstrap.min.css'
import App from './components/app'
import ErrorBoundary from './components/errorBoundary'
import { AuthProvider } from './contexts/auth'
import { ThemeProvider } from './contexts/theme'

config.autoAddCss = false

/* A gyökér-elem hiánya nem "elvi lehetetlenség", hanem az index.html és ez a
   fájl közti KÉTOLDALI KÖTÉS: ha ott átnevezik a div azonosítóját, itt semmi nem
   szól — a React csak annyit mondana, hogy null-ra nem lehet rendert kötni.
   A kimondott hiba megnevezi, mi hiányzik és hol. */
const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Hiányzik a #root elem az index.html-ből.')

createRoot(rootElement).render(
  <StrictMode>
    {/* A hibahatár legkívül: így a Providerek hibáit is elkapja (pl. a hiányzó
        CookiesProvider annak idején néma, üres képernyőt adott). */}
    <ErrorBoundary>
      <CookiesProvider>
        {/* A Theme- és az AuthProvider is sütiből olvas, ezért a CookiesProvider
            ALATT kell lenniük. */}
        <ThemeProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ThemeProvider>
      </CookiesProvider>
    </ErrorBoundary>
  </StrictMode>,
)
