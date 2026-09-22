/* A NAVIGÁCIÓS FELÜLET: minden cím, ami a böngésző URL-sávjában megjelenhet.

   Az endpoints.ts párja — és SZÁNDÉKOSAN külön fájl. A `/quotes` cím, amit a
   címsorban látsz, és a `/quotes` végpont, amitől a listát kérjük, ma véletlenül
   egyforma, de két külön szerződés: az egyiket a react-router route-fája tartja
   (components/routes.tsx), a másikat a backend routere. Ha egyszer a frontend
   címei átalakulnak (mondjuk /q/… lesz belőlük), a backend végpontjai attól nem
   mozdulnak — egy közös fájl ezt a két, egymástól független szerződést kötné
   össze hamisan.

   MIÉRT NEM ELÉG EGY KONSTANS-LISTA (mint az endpoints.ts-é). Ott a védelmet nem
   a lista adja, hanem a backend szerződés-tesztje: végigmegy az értékeken, és ami
   404-et ad, az nem létezik. Itt ilyen kapu NEM építhető. A react-router
   `matchRoutes`-a ugyan megmondaná, illeszkedik-e egy cím, de a dinamikus
   szegmensek elnyelik az elgépelést: a `/quotes/creat` nem hibázik, hanem
   beleesik a `/quotes/:author`-ba, és egy "creat" nevű szerző szűrt nézetét
   kapjuk — üresen, néma átirányítással a főlistára. Vagyis pont az idézet-
   névtérben lenne vak a kapu, ahol a route-rangsor a legtörékenyebb (mérve:
   2026-08-14). Egy fél kapu megtévesztő: zöldet mutat olyan területre, amit nem
   véd.

   EZÉRT ITT A TÍPUS A KAPU. Nem lista, hanem BUILDER-FÜGGVÉNYEK: az útvonalat
   nem összefűzni kell, hanem MEGHÍVNI. Egy elgépelt név (`PATHS.quoteCreat`) így
   fordítási hiba, nem futásidejű üres lista.

   NÉGY NÉMA HIBÁT SZÜNTET MEG:

   1. **Elgépelt út.** Ma egy rossz cím a `*`-ágra esik, ami átirányít — a
      felhasználó "csak" máshol köt ki, hibaüzenet nélkül.
   2. **Elfelejtett kódolás.** Az `encodeURIComponent` eddig hat helyen, kézzel
      szerepelt. Ahol lemarad, ott egy "Márai Sándor" szerzőnév szóköze vagy egy
      perjel szétszedi az útvonalat — de csak AZOKRA az értékekre, amikben van
      ilyen karakter, tehát a fejlesztés közben simán észrevétlen marad.
   3. **A záró perjel.** A FilterLink eddig ELŐTAGOT kapott ("/quotes/"), amihez
      hozzáfűzte a kódolt értéket. A záró perjelet semmi nem ellenőrizte: egy
      "/quotes" előtagból némán "/quotesKant" lett volna. Buildernél nincs miből
      lehagyni.
   4. **A MINTA és az ÚT elcsúszása.** Ez a legalattomosabb: a route-fa a MINTÁT
      ismeri ("/to-dos/update/:id"), a link az ÉPÍTETT utat ("/to-dos/update/abc").
      A kettő két külön helyen élt, és semmi nem kötötte őket össze — egy
      elgépelt minta mellett a builder tökéletes URL-t gyárt, ami sehova nem
      illeszkedik. Ez a CLAUDE.md "kézzel szinkronizált másolat" mintája. Ezért
      az alábbi `route()` MINDKETTŐT EGY ELŐTAGBÓL származtatja: nem tudnak
      elválni egymástól, mert nincs két forrásuk.

   MIT NEM VÉD. Attól, hogy a szám 25 helyett egy helyen van elírva, még el lehet
   írni — csak egyszer, láthatóan, és az összes hívás egyszerre romlik el (ami
   hangos), nem csak az egyik (ami néma). A tesztek ezért SZÁNDÉKOSAN megtartják a
   szó szerinti címeket (`renderRoutes("/to-dos/update/abc")`): ők a független
   második vélemény. Ha ők is innen vennék az utakat, egy elgépelés a fájlban
   együtt mozgatná a kódot és a tesztet — és zöld maradna. */

/* A szekció-gyökerek. Az itteni sorrend NEM route-rangsor: hogy melyik minta
   előzi meg a másikat, azt kizárólag a routes.tsx-beli sorrend dönti el (a
   statikus "create"/"search" szegmensnek a dinamikus ":author" ELŐTT kell
   állnia). Itt csak az ismétlődést kerüljük ki. */
const TODOS = "/to-dos";
const QUOTES = "/quotes";

/* A LÉTREHOZÁS KÉT CÍME, EGY előtagból. A "+" gomb a CSUPASZ címre mutat; az
   azonosítót az odaérkező belépő-útvonal adja hozzá (l. routes.tsx). A kettő
   ugyanabból a konstansból származik, mert a `/create` szegmens elcsúszása
   pontosan az a néma hiba volna, ami ellen ez a fájl készült. */
const TODO_CREATE = `${TODOS}/create`;
const QUOTE_CREATE = `${QUOTES}/create`;

/* Egy DINAMIKUS útvonal — olyan, amiben route-paraméter van.

   Egyetlen előtagból ad vissza kettőt, ami eddig külön élt:
   - a `pattern`-t, amit a route-fa vár:      "/to-dos/update/:id"
   - magát a FÜGGVÉNYT, ami a címet építi:    build("abc") → "/to-dos/update/abc"

   A visszatérési érték maga a builder függvény, `pattern` tulajdonsággal
   (Object.assign) — így a hívás helyén nem kell egy mezőn átmenni:
   `PATHS.todoUpdate(id)` a cím, `PATHS.todoUpdate.pattern` a minta. A statikus
   utak sima stringek maradnak, mert azoknál a kettő UGYANAZ a szöveg: egy
   "/to-dos" mint minta és mint cím nem tud elcsúszni önmagától.

   A `Params` a paraméterNEVEK tuple-je ("id", vagy "author", "id"). A rest-
   paraméterből a TypeScript tuple-t következtet, nem sima tömböt, ezért tudja a
   DARABSZÁMÁT. A `{[K in keyof Params]: string}` ebből egy ugyanolyan hosszú,
   csupa-string tuple-t képez: a builder pontosan annyi értéket vár, ahány
   paraméter van. Egy elfelejtett argumentum így fordítási hiba — nem egy
   "/quotes/Ady/undefined" alakú cím. */
function route<Params extends readonly string[]>(prefix: string, ...params: Params) {
    const build = (...values: {[K in keyof Params]: string}) =>
        prefix + values.map((value) => "/" + encodeURIComponent(value)).join("");

    return Object.assign(build, {
        pattern: prefix + params.map((name) => "/:" + name).join(""),
    });
}

export const PATHS = {
    /* A gyökér és a regisztráció — szekciótól függetlenek. A gyökérnek nincs saját
       nézete: az utolsó megnyitott szekcióra irányít (l. routes.tsx). */
    root: "/",
    signup: "/signup",

    /* A to-do szekció. A `todos` maga a lista (a szekció gyökere), a `todoCategory`
       és a `todoColor` a szűrt nézetek, a `todoUpdate` a szerkesztő. */
    todos: TODOS,
    /* A "+" gomb célja: azonosító nélkül. Nem maga a szerkesztő, hanem a belépő,
       ami az új elem azonosítóját megadja és tovább irányít. */
    todoCreate: TODO_CREATE,
    /* MAGA A SZERKESZTŐ egy KONKRÉT új elemhez. Azért van az azonosító az
       útvonalban — ugyanúgy, mint a módosításnál —, mert a létrehozás
       idempotenciája ezen az azonosítón áll: F5, megosztott link vagy egy másik
       fülön megnyitott lap után is UGYANARRÓL az elemről van szó. */
    todoCreateItem: route(TODO_CREATE, "id"),
    todoCategory: route(`${TODOS}/category`, "name"),
    todoColor: route(`${TODOS}/color`, "name"),
    todoUpdate: route(`${TODOS}/update`, "id"),

    /* Az idézet-szekció. Szimmetrikus a to-dóéval, csak vékonyabb. VÉGPONTOK KÖZÖTTI
       TITKOSÍTÁS (E2EE) UTÁN a szerző-szűrt nézet (/quotes/:author), a keresés
       (/quotes/search/:term) és a publikus megosztott cím (/quotes/:author/:id)
       MEGSZŰNT: a szerver titkosított tartalomra nem tud szűrni/keresni (a kliens-oldali
       F3-ban jön), a publikus megosztás pedig a külön menetbe, a Shared táblára került.
       Így csak a lista, a create és az update marad — mind statikus szegmensű. */
    quotes: QUOTES,
    quoteCreate: QUOTE_CREATE,
    quoteCreateItem: route(QUOTE_CREATE, "id"),
    quoteUpdate: route(`${QUOTES}/update`, "id"),
} as const;
