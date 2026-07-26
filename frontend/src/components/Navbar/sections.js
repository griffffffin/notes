/* A szekciók: az alkalmazás felső szintű területei, mindegyik SAJÁT collectionnel
   (to-do, idézetek, később film, jegyzet). A bővítés ide ír majd új sort. Az első
   egyben a fallback (ismeretlen úton).

   FONTOS a szóhasználat: ez a "szekció" NEM azonos a to-do SAJÁT, szekción belüli
   "category" mezőjével (a színes chipek, /to-do/category/:name). Az egy elemek
   osztályozása egy szekción belül; ez itt maga a tartalomtípus. A két szint
   szándékosan külön nevet kap, hogy a kód ne mossa össze őket.

   Külön (nem-komponens) fájlban, hogy a sectionSwitcher.jsx csak komponenst
   exportáljon (Vite fast-refresh, react/only-export-components), és a "+" gomb
   (logoAndCreate) is innen vehesse a currentSection-t. */
const SECTIONS = [
    {path: "/to-do", label: "To-do"},
    {path: "/quotes", label: "Quotes"},
];

// Az aktuális szekció az URL ELSŐ szegmenséből (/to-do/category/... → /to-do).
export function currentSection(pathname) {
    return SECTIONS.find((section) => pathname.startsWith(section.path)) ?? SECTIONS[0];
}
