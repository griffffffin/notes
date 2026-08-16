/* MINDEN CSS-VÁLTOZÓ, AMIT EZ AZ APP JS-BŐL ÍR — a nevük egy helyen.

   A `cookies.ts` testvére, ugyanabból az okból: ezek KÉTOLDALI kötések, és a
   másik oldal nem TypeScript. Itt a JS `setProperty`-vel ír, az index.css pedig
   `var(--…)`-ral olvas — a kettő között semmilyen eszköz nem lát összefüggést.
   Egy átnevezés az egyik oldalon NEM HIBÁZIK: a böngésző az ismeretlen változót
   elfogadja, a rá hivatkozó szabály viszont érvénytelen lesz, és az öröklött
   értékre esik vissza. A képernyőn ez annyit jelent, hogy egy szín "majdnem jó" —
   pont az a fajta romlás, amit senki nem vesz észre időben. (Mérve: az index.css
   SEMMILYEN tartalék definíciót nem ad ezekre, tehát tényleg nincs mibe
   kapaszkodni.)

   MIÉRT NEM ELÉG, HOGY EGY HELYEN VANNAK. Önmagában ez csak azt éri el, hogy egy
   elgépelés az összes hívást egyszerre rontja el (ami hangos), nem csak az
   egyiket (ami néma). A VALÓDI kaput a cssVariables.test.ts adja: az mindkét
   irányban összeveti ezt a listát az index.css-szel — amit a JS ír, azt a CSS
   olvassa is, és amit a CSS olvas, azt valaki be is állítja.

   KÉT MECHANIZMUS, KÉT FÁJL. A `--` változókat kétféleképp adjuk át, és a kettőt
   más védi:

     - `element.style.setProperty(név, érték)` — futásidejű DOM-hívás, a neve sima
       string. EZEK ÁLLNAK ITT: a fordító a `CssVariable` unióval köti meg őket.
     - `style={{"--quote-fs": …}}` — JSX style-objektum. Azokat a nevet a
       `types/cssVariables.d.ts` modul-kiegészítése engedélyezi (egy elgépelés ott
       már ma is fordítási hiba), ezért ITT nem ismételjük meg őket. A teszt
       viszont ONNAN IS beolvassa a neveket, hogy a CSS-szel való összevetés
       teljes legyen. */

export const CSS_VARIABLES = {
    /* A téma színei. Mindet a ThemeProvider írja a <html> elemre (contexts/theme.tsx),
       és az index.css .text-theme / .btn.btn-theme / .border-theme szabályai olvassák.
       Az ÉRTÉKÜK a THEMES táblából jön (contexts/theme-context.ts) — ez a fájl csak
       a NEVEKET mondja ki, a színeket nem. */
    pageBackground: "--theme-page-bg",
    text: "--theme-text",
    accent: "--theme-accent",
    accentContrast: "--theme-accent-contrast",
    focusBorder: "--theme-focus-border",
    focusRing: "--theme-focus-ring",

    /* A gördítősáv nyilai: kész SVG-képek (url(...)), nem színek. Azért JS-ből
       születnek, mert a beágyazott SVG egy SZÖVEG, ami nem lát CSS-változót —
       tehát a téma színét sem; l. a theme.tsx indoklását. */
    scrollbarArrowUp: "--scrollbar-arrow-up",
    scrollbarArrowDown: "--scrollbar-arrow-down",
} as const;

/* A nevek UNIÓJA mint típus — ugyanaz a fogás, mint az endpoints.ts `Endpoint`-ja.
   Az `as const` nélkül minden érték `string` volna, és ez a típus sem jelentene
   többet a `string`-nél. */
export type CssVariable = (typeof CSS_VARIABLES)[keyof typeof CSS_VARIABLES];

/* A DOM `setProperty`-je bármilyen szöveget elfogad — nem tudjuk átírni, de be
   tudjuk csomagolni. Ez a burkolat teszi a NEVET ellenőrizhetővé: innentől oda
   nem lehet akármit adni, csak a fenti lista egy elemét. Ugyanaz az elv, ami a
   `handleAxios` url-paraméterét `Endpoint`-ra szűkíti. */
export function setCssVariable(style: CSSStyleDeclaration, name: CssVariable, value: string): void {
    style.setProperty(name, value);
}
