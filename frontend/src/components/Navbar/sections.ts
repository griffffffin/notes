/* A szekciók: az alkalmazás felső szintű területei, mindegyik SAJÁT collectionnel
   (to-dos, idézetek, később film, jegyzet). A bővítés ide ír majd új sort. Az első
   egyben a fallback (ismeretlen úton).

   FONTOS a szóhasználat: ez a "szekció" NEM azonos a to-do SAJÁT, szekción belüli
   "category" mezőjével (a színes chipek, /to-dos/category/:name). Az egy elemek
   osztályozása egy szekción belül; ez itt maga a tartalomtípus. A két szint
   szándékosan külön nevet kap, hogy a kód ne mossa össze őket.

   Külön (nem-komponens) fájlban, hogy a sectionSwitcher.tsx csak komponenst
   exportáljon (Vite fast-refresh, react/only-export-components), és a "+" gomb
   (logoAndCreate) is innen vehesse a currentSection-t. */

import {PATHS} from "../../paths";

/* A `Section` típus NEM exportált: kifelé senki nem kéri NÉVEN — a fogyasztók a
   `currentSection` visszatérési értékét használják, amit a fordító magától is
   ismer. Amint egy komponens néven akarja nevezni, exportálttá válik; addig a knip
   halott exportként jelentené. L. a src/types/api.ts növekedési szabályát.
   (A `SectionPath` külön ügy: azt a lenti kapuk és a fogyasztók IS kérik.) */
/* A `createPath` azért tartozik a szekcióhoz, mert a navbar "+" gombja EDDIG
   összefűzéssel állította elő (`section.path + "/create"`). Az összefűzés néma
   feltevés volt: hogy minden szekció létrehozó-oldala pont így néz ki. Amelyiké
   egyszer nem — mondjuk a könyvjelzőké /bookmarks/new lesz —, ott a "+" egy nem
   létező címre vitt volna, és a `*`-ág némán visszadobja a listára. Így viszont
   minden szekció KIMONDJA a saját létrehozó-útját, a paths.ts értékeivel. */
type Section = {path: string; label: string; createPath: string};

/* EXPORTÁLVA A KAPUK KEDVÉÉRT. Ez a lista két, egymástól független dolgot köt
   össze, és egyiket sem látja semmilyen eszköz:

     - a benne álló UTAKNAK LÉTEZNIE KELL a route-fában (components/routes.tsx).
       Ha egy szekció ide bekerül, de route-ot nem kap, a felület NEM hibázik: a
       szekció-váltó kirajzolja, a rákattintás pedig némán visszadob (MÉRVE
       2026-08-16: az emlékezett szekcióra), vagy — ha épp ő az emlékezett — egy
       ÜRES oldalt ad, csak a navbarral. Őre: components/routes.test.tsx.
     - egyik út SEM lehet a másik ELŐTAGJA, mert a `currentSection` `startsWith`-
       csel keres (l. lentebb). Őre: sections.test.ts.

   A `Section` típus továbbra sem exportált: a tesztek a lista ELEMEIT használják,
   nevet nem adnak neki (l. fent a növekedési szabályt).

   AZ `as const satisfies` KETTŐT AD EGYSZERRE, és ezért nem `: Section[]` áll itt:
     - a `satisfies` ELLENŐRZI, hogy minden elem valódi Section (elgépelt mezőnév
       fordítási hiba) — ezt az annotáció is tudta;
     - az `as const` viszont MEGŐRZI a literál típusokat, tehát a `path` nem
       `string`, hanem `"/to-dos" | "/quotes"`. Ebből származik lentebb a
       `SectionPath`, és ez teszi fordítási hibává a rossz szekció-utat.
   Az `as const` itt NEM a tiltott „állítás" fajtából való (l. CLAUDE.md): nem
   mond semmit az értékről, csak nem felejti el, amit a fordító amúgy is lát. */
export const SECTIONS = [
    {path: PATHS.todos, label: "To-dos", createPath: PATHS.todoCreate},
    {path: PATHS.quotes, label: "Quotes", createPath: PATHS.quoteCreate},
] as const satisfies readonly Section[];

/* A LÉTEZŐ szekció-utak uniója — a listából SZÁRMAZTATVA, nem külön felsorolva.
   Egy új szekció felvétele automatikusan bővíti; egy párhuzamos, kézzel írt lista
   előbb-utóbb elcsúszna tőle. */
export type SectionPath = (typeof SECTIONS)[number]["path"];

// Az aktuális szekció az URL ELSŐ szegmenséből (/to-dos/category/... → /to-dos).
export function currentSection(pathname: string): Section {
    return SECTIONS.find((section) => pathname.startsWith(section.path)) ?? SECTIONS[0];
}

/* Az UTOLSÓ megnyitott szekció emlékezete. A gyökér (/) ide tér vissza: aki
   legutóbb az idézeteket nézte, annak a /quotes nyíljon, ne a to-do.

   Eszközönként külön, mert localStorage — ez szándékos: a telefonon és az
   asztali gépen más-más szekcióban dolgozhat a felhasználó.

   A kulcs-STRING egyetlen helyen él (itt). Korábban négy helyen volt beírva
   (három lista-nézet + a gyökér-átirányítás a routes.tsx-ben); egy elgépelés
   bármelyikben némán elrontotta volna az emlékezetet: nem hibázik, csak mindig
   a to-do nyílna. */
const LAST_SECTION_KEY = "lastSection";

/* MIÉRT NEM ELLENŐRZI AZ ÍRÁS, AMIT AZ OLVASÁS IGEN? Ez az aszimmetria szándékos,
   és a két oldal KÉT KÜLÖNBÖZŐ hibát véd ki:

     - ÍRÁSKOR az egyetlen elképzelhető rossz érték PROGRAMOZÓI hiba: egy
       lista-nézet olyan utat ad át, ami nincs a listában. Az ilyet nem futásidőben
       kell elkapni, hanem le sem szabad fordulnia — ezért `SectionPath` a
       paraméter típusa, nem `string`. Egy futásidejű őr itt HOLT KÓD lenne: jól
       tipizált hívó nem tudja elsütni, rosszul tipizált pedig nincs.
     - OLVASÁSKOR viszont az érték a programon KÍVÜLRŐL jön: a localStorage a
       felhasználó gépén él, és TÚLÉLI a kódot. Ami íráskor érvényes volt, az egy
       átnevezés vagy egy megszűnt szekció után már nem az. Ezt semmilyen típus nem
       tudja megfogni — oda VALÓDI futásidejű vizsgálat kell (l. lentebb, és
       CLAUDE.md: ami kívülről jön, azt ellenőrizni kell).

   Röviden: az írás oldala KÓD-kérdés (fordítási időben eldől), az olvasásé
   ADAT-kérdés (csak futásidőben dőlhet el). Ezért nem redundáns a kettő, és ezért
   nem is cserélhető fel. */
export function rememberSection(path: SectionPath): void {
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
   akkor nem lehet null — a fordító ezt az összefüggést magától követi.

   A VISSZATÉRÉSI TÍPUS `SectionPath`, nem `string`: a `find` valódi futásidejű
   vizsgálat, tehát ami innen kijön, az bizonyítottan létező szekció-út. Így a
   hívó (a `*`-ág átirányítása) sem tud véletlenül máshova vinni — a keresés
   eredményét a típus is továbbviszi, nem hígul vissza sima szöveggé. */
export function lastSectionPath(): SectionPath {
    const stored = localStorage.getItem(LAST_SECTION_KEY);
    const known = SECTIONS.find((section) => section.path === stored);
    return known ? known.path : SECTIONS[0].path;
}
