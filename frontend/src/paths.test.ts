import {describe, expect, it} from "vitest";
import {matchRoutes} from "react-router-dom";
import {PATHS} from "./paths";

/* A paths.ts két dolgot ígér, és ez a fájl mindkettőt külön kéri számon.

   1. A KÉSZ CÍMEK szó szerint azok, aminek lenniük kell. Ez NEM formaság: a
      `route()` a mintát és a buildert UGYANABBÓL az előtagból származtatja,
      tehát egymással mindig egyeznek — akkor is, ha az előtag maga el van írva.
      Ez a becsületes határa a konstrukciónak: az elcsúszást kizárja, a hibás
      értéket nem. Az alábbi elvárt címek ezért kézzel, a route-fától FÜGGETLENÜL
      vannak ideírva; ők a második vélemény.

   2. A MINTA ÉS AZ ÉPÍTETT CÍM ÖSSZEILLIK — és nem "szerintünk", hanem a
      react-router szerint: a `matchRoutes` ugyanaz a gépezet, ami élesben is
      eldönti, melyik route fogadja a címet. Ez fogja meg azt a fajta hibát, amit
      szemmel nézve senki: hogy a kódolt érték elbontja-e az útvonalat. Egy
      perjeles szerzőnév ("AC/DC") két szegmenssé esne szét, és a szűrt nézet
      helyett a publikus egy-idézet nézet nyílna meg — hibaüzenet nélkül, rossz
      tartalommal. A visszakapott paraméterek egyezése ezt zárja ki.

      MIÉRT a `matchRoutes`, és nem a kézre állóbb `matchPath`? Mert a `matchPath`
      a lánc KÖZEPE: nyers, kódolt címet vár, és a paramétereket kódoltan adja
      vissza. A dekódolást a `matchRoutes` végzi (előbb `decodePath`, aztán
      illesztés) — ez az, ami élesben is lefut, mielőtt a nézet a `useParams()`-ot
      olvassa. Mérve: `matchPath`-tal a szerző "M%C3%A1rai%20S%C3%A1ndor"-ként jött
      vissza, `matchRoutes`-szal "Márai Sándor"-ként. A kettő közül csak az utóbbi
      az, amit a komponens lát — a teszt annak a végét méri, ahol a valóság van. */

describe("PATHS — a kész címek", () => {
    it("a statikus utak", () => {
        expect(PATHS.root).toBe("/");
        expect(PATHS.signup).toBe("/signup");
        expect(PATHS.todos).toBe("/to-dos");
        expect(PATHS.todoCreate).toBe("/to-dos/create");
        expect(PATHS.quotes).toBe("/quotes");
        expect(PATHS.quoteCreate).toBe("/quotes/create");
    });

    it("a builderek egyszerű értékkel", () => {
        expect(PATHS.todoCategory("otthon")).toBe("/to-dos/category/otthon");
        expect(PATHS.todoColor("warning")).toBe("/to-dos/color/warning");
        expect(PATHS.todoUpdate("todo-1")).toBe("/to-dos/update/todo-1");
        expect(PATHS.quoteUpdate("quote-1")).toBe("/quotes/update/quote-1");
        expect(PATHS.quoteSearch("szeretet")).toBe("/quotes/search/szeretet");
        expect(PATHS.quotesByAuthor("Ady")).toBe("/quotes/Ady");
        expect(PATHS.publicQuote("Ady", "quote-1")).toBe("/quotes/Ady/quote-1");
    });

    it("a minták a route-fa alakjában", () => {
        expect(PATHS.todoCategory.pattern).toBe("/to-dos/category/:name");
        expect(PATHS.todoColor.pattern).toBe("/to-dos/color/:name");
        expect(PATHS.todoUpdate.pattern).toBe("/to-dos/update/:id");
        expect(PATHS.quoteUpdate.pattern).toBe("/quotes/update/:id");
        expect(PATHS.quoteSearch.pattern).toBe("/quotes/search/:term");
        expect(PATHS.quotesByAuthor.pattern).toBe("/quotes/:author");
        expect(PATHS.publicQuote.pattern).toBe("/quotes/:author/:id");
    });

    /* A kódolás korábban hat helyen, kézzel történt — ez a teszt azt rögzíti,
       hogy a builder mindenhol elvégzi. A szóköz %20, az "á" %C3%A1. */
    it("a szóközt és az ékezetet kódolja", () => {
        expect(PATHS.quotesByAuthor("Márai Sándor")).toBe("/quotes/M%C3%A1rai%20S%C3%A1ndor");
        expect(PATHS.todoCategory("ház és kert")).toBe("/to-dos/category/h%C3%A1z%20%C3%A9s%20kert");
    });
});

/* A dinamikus utak egy helyen felsorolva, hogy a lenti kör mindegyiket végigjárja.

   A típusa NEM az egyes builderek pontos alakja (azok más-más aritásúak), hanem a
   közös nevező: egy `pattern`-nel bíró függvény, ami stringeket vár. Egy szűkebb
   aritású függvény (mondjuk az egyparaméteres todoUpdate) EZ NÉLKÜL is
   beleillik — a TypeScript megengedi, hogy kevesebb paramétert váró függvényt
   adjunk oda többet elfogadó helyre. Így nem kell `as`-t írni: a lista típusos
   marad, és egy elgépelt név itt is fordítási hiba. */
type PathBuilder = {(...values: string[]): string; pattern: string};

/* A `values` a builder ARGUMENTUMAI (sorrendben), a `params` pedig az, amit a
   router visszaad belőlük. A kettő szándékosan külön, a látszólagos ismétlés
   ellenére: a `params` a paraméter NEVEIT is rögzíti, azokat pedig a nézetek
   olvassák (`useParams().author`, `.name`, `.id`, `.term`). Egy átkeresztelt
   route-paraméter némán `undefined`-ot adna a komponensben — a lista nem hibázna,
   csak üresen maradna. */
const DYNAMIC_PATHS: {name: string; build: PathBuilder; values: string[];
    params: Record<string, string>}[] = [
    {name: "todoCategory", build: PATHS.todoCategory,
        values: ["ház és kert"], params: {name: "ház és kert"}},
    {name: "todoColor", build: PATHS.todoColor,
        values: ["warning"], params: {name: "warning"}},
    {name: "todoUpdate", build: PATHS.todoUpdate,
        values: ["todo-1"], params: {id: "todo-1"}},
    {name: "quoteUpdate", build: PATHS.quoteUpdate,
        values: ["quote-1"], params: {id: "quote-1"}},
    /* Perjeles kifejezés és szerzőnév: pont ezek szedték volna szét az útvonalat
       kódolás nélkül. */
    {name: "quoteSearch", build: PATHS.quoteSearch,
        values: ["szeretet/remény"], params: {term: "szeretet/remény"}},
    {name: "quotesByAuthor", build: PATHS.quotesByAuthor,
        values: ["AC/DC"], params: {author: "AC/DC"}},
    {name: "publicQuote", build: PATHS.publicQuote,
        values: ["Márai Sándor", "quote-1"], params: {author: "Márai Sándor", id: "quote-1"}},
];

describe("PATHS — az épített cím illeszkedik a SAJÁT mintájára", () => {
    it.each(DYNAMIC_PATHS)("$name", ({build, values, params}) => {
        const path = build(...values);
        /* Egyelemű route-fa: csak a SAJÁT mintáját kínáljuk fel. Így az állítás
           tisztán az, hogy a builder és a minta összeillik — nem keveredik bele,
           hogy a valódi fában melyik route előzné meg a másikat (az a rangsor a
           routes.tsx dolga, l. az ottani kommenteket). */
        const matches = matchRoutes([{path: build.pattern}], path);

        /* Valódi ellenőrzés, nem `!`: a `matchRoutes` null-t ad, ha semmi nem
           illeszkedik, és a dobott hiba meg is mondja, mi nem illett mire. */
        const match = matches?.[0];
        if (!match)
            throw new Error(`A(z) "${path}" nem illeszkedik a saját mintájára (${build.pattern}).`);

        /* Nem elég, hogy illeszkedik: a router VISSZAADJA ugyanazokat az
           értékeket, dekódolva, a várt NEVEK alatt. Egy kódolatlan perjel itt
           bukna meg, mert extra szegmenst nyitna. */
        expect(match.params).toEqual(params);
    });
});
