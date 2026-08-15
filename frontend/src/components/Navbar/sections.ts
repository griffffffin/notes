/* A szekciók: az alkalmazás felső szintű területei, mindegyik SAJÁT collectionnel
   (to-dos, idézetek, később film, jegyzet). A bővítés ide ír majd új sort. Az első
   egyben a fallback (ismeretlen úton).

   FONTOS a szóhasználat: ez a "szekció" NEM azonos a to-do SAJÁT, szekción belüli
   "category" mezőjével (a színes chipek, /to-dos/category/:name). Az egy elemek
   osztályozása egy szekción belül; ez itt maga a tartalomtípus. A két szint
   szándékosan külön nevet kap, hogy a kód ne mossa össze őket.

   Külön (nem-komponens) fájlban, hogy a sectionSwitcher.jsx csak komponenst
   exportáljon (Vite fast-refresh, react/only-export-components), és a "+" gomb
   (logoAndCreate) is innen vehesse a currentSection-t. */

import {PATHS} from "../../paths";

/* A típus egyelőre NEM exportált: kifelé még senki nem kéri (a fogyasztói .jsx-ek),
   a `currentSection` visszatérési értékét pedig a fordító magától is ismeri. Amint
   egy .tsx komponens néven akarja nevezni, exportálttá válik — addig a knip halott
   exportként jelentené. L. a src/types/api.ts növekedési szabályát. */
/* A `createPath` azért tartozik a szekcióhoz, mert a navbar "+" gombja EDDIG
   összefűzéssel állította elő (`section.path + "/create"`). Az összefűzés néma
   feltevés volt: hogy minden szekció létrehozó-oldala pont így néz ki. Amelyiké
   egyszer nem — mondjuk a könyvjelzőké /bookmarks/new lesz —, ott a "+" egy nem
   létező címre vitt volna, és a `*`-ág némán visszadobja a listára. Így viszont
   minden szekció KIMONDJA a saját létrehozó-útját, a paths.ts értékeivel. */
type Section = {path: string; label: string; createPath: string};

const SECTIONS: Section[] = [
    {path: PATHS.todos, label: "To-dos", createPath: PATHS.todoCreate},
    {path: PATHS.quotes, label: "Quotes", createPath: PATHS.quoteCreate},
];

// Az aktuális szekció az URL ELSŐ szegmenséből (/to-dos/category/... → /to-dos).
export function currentSection(pathname: string): Section {
    return SECTIONS.find((section) => pathname.startsWith(section.path)) ?? SECTIONS[0];
}

/* Az UTOLSÓ megnyitott szekció emlékezete. A gyökér (/) ide tér vissza: aki
   legutóbb az idézeteket nézte, annak a /quotes nyíljon, ne a to-do.

   Eszközönként külön, mert localStorage — ez szándékos: a telefonon és az
   asztali gépen más-más szekcióban dolgozhat a felhasználó.

   A kulcs-STRING egyetlen helyen él (itt). Korábban négy helyen volt beírva
   (három lista-nézet + a gyökér-átirányítás a routes.jsx-ben); egy elgépelés
   bármelyikben némán elrontotta volna az emlékezetet: nem hibázik, csak mindig
   a to-do nyílna. */
const LAST_SECTION_KEY = "lastSection";

export function rememberSection(path: string): void {
    localStorage.setItem(LAST_SECTION_KEY, path);
}

/* A gyökér-átirányítás célja: az emlékezett szekció, első alkalommal az első
   (SECTIONS[0], ma a to-dos).

   Csak ISMERT szekció-utat fogadunk el. A tárolt érték a felhasználó
   böngészőjében él, ezért TÚLÉLI az átnevezéseket: a "/to-do" → "/to-dos"
   váltás után a régi érték egy nem létező útra irányítana. A `*` route ugyan
   visszadobná a főlistára, de csak egy fölösleges ugrás árán — és ha egyszer egy
   szekció megszűnik, ugyanez a csapda újra elsülne. Ismeretlen érték esetén
   tehát az első szekcióra esünk vissza, mintha még sosem jártál volna itt.

   A `stored` típusa `string | null` (a localStorage nem talált kulcsra null-t ad).
   Az `isKnown` ág ezt szűkíti le stringre: ha a tárolt érték szerepel a listában,
   akkor nem lehet null — a fordító ezt az összefüggést magától követi. */
export function lastSectionPath(): string {
    const stored = localStorage.getItem(LAST_SECTION_KEY);
    const known = SECTIONS.find((section) => section.path === stored);
    return known ? known.path : SECTIONS[0].path;
}
