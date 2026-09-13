/* A REACT-TOOLTIP FUTÁSIDEJŰ STÍLUS-INJEKTÁLÁSÁNAK KIKAPCSOLÁSA — a CSP miatt.

   Miért külön modul, és miért ELSŐ importként. A react-tooltip a CSS-ét egy
   <style> ELEMbe injektálja, és a CORE réteg kikapcsolását a
   `process.env.REACT_TOOLTIP_DISABLE_CORE_STYLES` flag mögé zárja — amit `typeof
   process !== "undefined"` őriz. Egy Vite-SPA-ban nincs `process`, ezért a flag
   build-idejű `define`-nal sem hat: kell egy valódi `process` glóbusz. A flaget a
   react-tooltip a MODUL BETÖLTÉSEKOR olvassa ki (mérve: a main.tsx törzsében,
   az importok UTÁN beállított shim már KÉSŐ volt — az ES-importok hoistolódnak,
   így a react-tooltip modul a törzs előtt kiértékelődik). Ezért a shimnek egy
   olyan modulban kell állnia, amely a react-tooltip BÁRMELY importja ELŐTT lefut:
   a main.tsx legelső `import`-ja ez a fájl.

   Miért nem veszít vele a felület: a react-tooltip teljes CSS-ét (core + base)
   statikusan importáljuk (main.tsx), tehát a tooltipek a bundle-ölt <link>-ből
   stílusozottak — az injektált <style> mindig is REDUNDÁNS volt. A CSP
   `style-src-elem 'self'`-je viszont ezt a redundáns, hash nélküli <style>-t
   blokkolná, és minden betöltéskor néma CSP-jogsértést hagyna a konzolon.

   A shim SZŰK: csak a két flaget adja meg, `process.versions` nélkül — így a
   „böngésző vagy Node?" könyvtári vizsgálatok (amik `process.versions.node`-ot
   néznek) továbbra is böngészőt látnak. */
/* A `process`-t a @types/node globálisan LÉTEZŐNEK tünteti fel (NodeJS.Process),
   holott böngészőben nincs — ezért futásidőben hozzuk létre, nem a típusra bízva.
   A `globalThis` szűkebb, OPCIONÁLIS `process`-t leíró típusra rendelése `as`
   nélkül megy (a meglévő, kötelező mező hozzárendelhető az opcionálishoz), és így
   a lenti `??=` sem lesz „mindig igaz" — a típus végre a valóságot mondja. Az env
   típusa `NodeJS.ProcessEnv` (nem `Record<string,string>`), hogy a `globalThis`
   értéke illeszkedjen. */
const globalScope: {process?: {env: NodeJS.ProcessEnv}} = globalThis
const proc = (globalScope.process ??= {env: {}})
proc.env['REACT_TOOLTIP_DISABLE_CORE_STYLES'] = 'true'
proc.env['REACT_TOOLTIP_DISABLE_BASE_STYLES'] = 'true'
