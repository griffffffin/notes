import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // a dev szerver a helyi hálózaton is elérhető legyen (a Pi-n fut,
    // a böngésző egy másik gépen), ne csak localhost-on
    host: true,
  },
  build: {
    /* Az alap 4 kB-os küszöb fölötti assetek külön fájlba kerülnének, amit a
       böngésző csak a komponens kirajzolásakor tölt le — az ikonok későn,
       "bevillanva" jelennének meg. A mi legnagyobb ikonunk az optimalizált
       szem-SVG (6,4 kB), ezért a küszöb 8 kB: így minden ikon a bundle része
       lesz (data URI), nincs értük külön kérés, és nem kell <link rel="preload">
       kerülőút sem. A bundle ~9 kB-tal nő — elhanyagolható. */
    assetsInlineLimit: 8192,
    // Source map az éles buildhez: enélkül a böngészőkonzol hibái a minifikált
    // kódra mutatnak (index-B7v.js:1:48211), ami használhatatlan. Ezzel a
    // valódi forrásfájlra és sorszámra vezet vissza.
    // Ára: a forráskód böngészőből visszafejthető — nálunk ez nem gond, a repo
    // publikus lesz. (Zárt forrású projektnél ez tudatos döntést igényelne.)
    sourcemap: true,
  },
  test: {
    // A tesztek böngésző nélkül futnak: a jsdom egy JavaScriptben megírt,
    // "papírmasé" DOM — van benne document, elemek, események, de nincs
    // tényleges megjelenítés. Gyors, és a logika teszteléséhez elég.
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})
