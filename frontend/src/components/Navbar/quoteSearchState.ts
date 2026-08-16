import {matchRoutes} from "react-router-dom";
import {PATHS} from "../../paths";

/* A Quotes-navbar keresőjének állapota az AKTUÁLIS URL-ből: megjelenjen-e a
   kereső, és mi legyen a mező kezdőértéke. Egy helyen, tesztelhetően — a navbar
   csak felhasználja.

   A kereső CSAK a "read-jellegű" idézet-oldalakon jelenik meg (teljes lista,
   szerző-szűrt nézet, találati nézet), a szerkesztőkön (create/update) és az
   egyetlen megosztott idézet publikus nézetén NEM. A mező kezdőértéke az URL-t
   tükrözi (folytonosság + F5-biztos): szerző-szűrtnél a szerző neve (az
   "Anonymous" jelölőt is beleértve), találatnál a keresett kifejezés, a teljes
   listán üres.

   EZ A FÁJL EDDIG MAGA DARABOLTA AZ URL-T, és ez volt a baja: kézzel ismerte az
   útvonal-nyelvtant ("quotes", "search", "create" mint szó szerinti szegmensek),
   miközben ugyanezt a nyelvtant a paths.ts és a routes.tsx is kimondja. Három
   hely, egy igazság — és a harmadik NEM mozdult a másik kettővel. Egy átnevezés
   (mondjuk /quotes/create → /quotes/new) itt némán rossz ágat választott volna:
   a "new"-t SZERZŐNEK véve a szerkesztő oldalán megjelent volna a kereső, "new"
   szöveggel a mezőben. Semmi nem hibázik, csak rossz. Ráadásul a saját tesztje is
   szó szerinti címekkel dolgozik, tehát ZÖLD MARADT volna mellette.

   Innentől ugyanaz a route-tábla dönt, mint amit a böngésző lát: a mintákat a
   paths.ts adja, a rangsort pedig a react-router SAJÁT `matchRoutes`-a — nem egy
   kézzel sorba rakott if-lánc. Ez azért fontos, mert a rangsor nem magától
   értetődő: a statikus "create"/"search" szegmens megelőzi a dinamikus
   ":author"-t, és eddig ezt a sorrendet itt kézzel kellett eltalálni. Most
   ugyanaz az algoritmus dönti el, ami élesben is — az alábbi tömb SORRENDJE
   tehát csak olvashatóság (a routes.tsx-ét követi), nem rangsor.

   A dekódolás is a routeré lett (a `matchRoutes` a paramétereket dekódolva
   adja), ezért a korábbi kézi `decodeURIComponent` hívások elmaradnak.

   Külön (nem-komponens) fájl, mint a sections.ts — így a navbar egy sima
   segédfüggvényt importál, és a Vite fast-refresh sem esik el a
   react/only-export-components miatt. */

// Egyelőre nem exportált típus — l. a sections.ts-ben ugyanezt az indoklást.
type QuoteSearchState = {show: boolean; term: string};

/* Az idézet-névtér nézetei: melyiken van kereső, és mi tölti ki a mezőt.

   A `termParam` a route-paraméter NEVE, nem az értéke — a `matchRoutes` ezen a
   néven adja vissza a kitöltött szegmenst. Szűk unió (`"term" | "author"`), nem
   `string`: egy elgépelt paraméternév így fordítási hiba, nem néma üres mező.
   (Magukat a neveket a paths.ts mondja ki, és a paths.test.ts rögzíti is őket —
   ez a kötés másik fele.) */
type QuoteView = {
    path: string;
    show: boolean;
    termParam?: "term" | "author";
};

/* EXPORTÁLVA A KAPU KEDVÉÉRT (l. quoteSearchState.test.ts). A `matchRoutes`-ra
   állás az ÁTNEVEZÉS ellen véd — a paths.ts-ben átírt út idekint is átáll —, de
   az ÚJ ÚTVONAL ellen magától nem: egy `/quotes/favorites`, amit valaki felvesz
   a paths.ts-be és a route-fába, de ide nem, csöndben a `/quotes/:author`-ra
   esne, és a navbarban megjelenne a kereső "favorites" szöveggel. Ugyanaz a
   hibaosztály, csak arrébb tolva. Ezért a teszt kétirányúan összeveti ezt a
   táblát a PATHS idézet-névterével: ami ott van, annak itt is lennie kell, és
   fordítva. Így egy új idézet-útvonal nem tud némán bekerülni. */
export const QUOTE_VIEWS: QuoteView[] = [
    {path: PATHS.quotes, show: true},
    {path: PATHS.quoteCreate, show: false},
    {path: PATHS.quoteUpdate.pattern, show: false},
    {path: PATHS.quoteSearch.pattern, show: true, termParam: "term"},
    {path: PATHS.quotesByAuthor.pattern, show: true, termParam: "author"},
    {path: PATHS.publicQuote.pattern, show: false},
];

export function quoteSearchState(pathname: string): QuoteSearchState {
    /* Nem-quotes út (vagy bármi, ami egyik mintára sem illik) → nincs kereső.
       Ezt eddig egy külön `segments[0] !== "quotes"` őr intézte; most abból
       következik, hogy semmi nem illeszkedik. */
    const match = matchRoutes(QUOTE_VIEWS, pathname)?.[0];
    if (!match?.route.show) return {show: false, term: ""};

    const {termParam} = match.route;
    /* A `?? ""` nem a hiányzó paraméterre készül (egy illeszkedő dinamikus
       szegmens mindig ki van töltve), hanem arra, hogy a params típusa
       `string | undefined` — az üres mező a helyes visszaesés. */
    return {show: true, term: termParam === undefined ? "" : match.params[termParam] ?? ""};
}
