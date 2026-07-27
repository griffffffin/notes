/* A Quotes-navbar keresőjének állapota az AKTUÁLIS URL-ből: megjelenjen-e a
   kereső, és mi legyen a mező kezdőértéke. Egy helyen, tesztelhetően — a navbar
   csak felhasználja.

   A kereső CSAK a "read-jellegű" idézet-oldalakon jelenik meg (teljes lista,
   szerző-szűrt nézet, találati nézet), a szerkesztőkön (create/update) és az
   egyetlen megosztott idézet publikus nézetén NEM. A mező kezdőértéke az URL-t
   tükrözi (folytonosság + F5-biztos): szerző-szűrtnél a szerző neve (az
   "Anonymous" jelölőt is beleértve), találatnál a keresett kifejezés, a teljes
   listán üres.

   Külön (nem-komponens) fájl, mint a sections.js — így a navbar egy sima
   segédfüggvényt importál, és a Vite fast-refresh sem esik el a
   react/only-export-components miatt. */
export function quoteSearchState(pathname) {
    const segments = pathname.split("/").filter(Boolean);
    if (segments[0] !== "quotes") return {show: false, term: ""};

    // /quotes — teljes lista, üres mezővel.
    if (segments.length === 1) return {show: true, term: ""};

    // /quotes/search/<kifejezés> — találati nézet. A csupasz /quotes/search (nincs
    // kifejezés) nem valódi útvonal (a "*" elfogná), ezért ott nem mutatunk keresőt.
    if (segments[1] === "search")
        return segments.length === 3
            ? {show: true, term: decodeURIComponent(segments[2])}
            : {show: false, term: ""};

    // /quotes/create — szerkesztő, nincs kereső. /quotes/<szerző> — szerző-szűrt
    // nézet, a mező a szerző nevével (az "Anonymous" jelölővel is).
    if (segments.length === 2)
        return segments[1] === "create"
            ? {show: false, term: ""}
            : {show: true, term: decodeURIComponent(segments[1])};

    // /quotes/update/:id (szerkesztő) és /quotes/:author/:id (publikus, egy idézet)
    // — egyiken sincs kereső.
    return {show: false, term: ""};
}
