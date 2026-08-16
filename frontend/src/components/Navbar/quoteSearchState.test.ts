import {describe, expect, it} from "vitest";
import {QUOTE_VIEWS, quoteSearchState} from "./quoteSearchState";
import {PATHS} from "../../paths";

describe("quoteSearchState — hol jelenjen meg a kereső és mi a kezdőértéke", () => {
    it("teljes lista (/quotes): megjelenik, üres mezővel", () => {
        expect(quoteSearchState("/quotes")).toEqual({show: true, term: ""});
    });

    it("szerző-szűrt (/quotes/:author): megjelenik, a szerző nevével (dekódolva)", () => {
        expect(quoteSearchState("/quotes/Ady")).toEqual({show: true, term: "Ady"});
        expect(quoteSearchState("/quotes/Ady%20Endre")).toEqual({show: true, term: "Ady Endre"});
    });

    it("a névtelen szűrt nézeten (/quotes/Anonymous) az 'Anonymous' jelölőt kiírja", () => {
        expect(quoteSearchState("/quotes/Anonymous")).toEqual({show: true, term: "Anonymous"});
    });

    it("találati nézet (/quotes/search/:term): megjelenik, a kifejezéssel (dekódolva)", () => {
        expect(quoteSearchState("/quotes/search/szeretet")).toEqual({show: true, term: "szeretet"});
        expect(quoteSearchState("/quotes/search/k%C3%B6nyv")).toEqual({show: true, term: "könyv"});
    });

    it("a szerkesztőkön NEM jelenik meg (create, update)", () => {
        expect(quoteSearchState("/quotes/create").show).toBe(false);
        expect(quoteSearchState("/quotes/update/507f1f77bcf86cd799439011").show).toBe(false);
    });

    it("a publikus egy-idézet nézeten (/quotes/:author/:id) NEM jelenik meg", () => {
        expect(quoteSearchState("/quotes/Ady/507f1f77bcf86cd799439011").show).toBe(false);
    });

    /* A csupasz /quotes/search (kifejezés nélkül) úgy viselkedik, mint BÁRMELY
       szerző-szűrt nézet — mert a router szerint az is: a /quotes/search/:term
       három szegmenst kíván, tehát a kétszegmenses cím a /quotes/:author-ra esik,
       author="search" értékkel. MÉRVE (matchRoutes a valódi mintákkal).

       Ez korábban MÁSKÉNT állt itt: a fájl külön kivételként rejtette el a
       keresőt, azzal az indoklással, hogy "a * elfogná". Ez az indoklás egyszerűen
       téves volt — a "*" ide sosem jutott el. A kivétel így egy olyan oldalon
       rejtette el a keresőt, ami valójában read-nézet (a QuoteRead renderelődik
       rajta), vagyis a navbar és a tartalom nem ugyanazt hitte az oldalról.

       A képernyőn ez alig látszik: a "search" nevű szerzőre nincs találat, tehát
       az üres szűrt nézet azonnal visszairányít a főlistára (l. Quotes/read.tsx
       emptyRedirect). A lényeg nem is a látvány, hanem hogy INNENTŐL NINCS KÉZI
       KIVÉTEL: a kereső sorsát ugyanaz a route-tábla dönti el, mint azt, hogy
       melyik nézet renderelődik. */
    it("a csupasz /quotes/search a szerző-szűrt nézet (a router szerint is), ezért keresőt mutat", () => {
        expect(quoteSearchState("/quotes/search")).toEqual({show: true, term: "search"});
    });

    it("nem-quotes úton NEM jelenik meg", () => {
        expect(quoteSearchState("/to-dos").show).toBe(false);
        expect(quoteSearchState("/to-dos/category/otthon").show).toBe(false);
    });

    /* KAPU: minden idézet-útvonalról nyilatkoznia KELL a táblának.

       A fenti tesztek arra felelnek, hogy a MEGLÉVŐ utak jól viselkednek-e. Ez a
       teszt másra: hogy egy ÚJ út ne tudjon kimaradni. Enélkül a
       `/quotes/favorites` (felvéve a paths.ts-be és a route-fába, de ide nem) a
       `/quotes/:author`-ra esne, és a navbarban megjelenne a kereső "favorites"
       szöveggel — semmi nem hibázna, csak rossz lenne. A CLAUDE.md ezt a mintát
       hívja "kézzel szinkronizált másolatnak"; a válasz rá gépi ellenőrzés.

       KÉTIRÁNYÚ, szándékosan: ami a PATHS-ban van, annak itt is kell lennie
       (nehogy kimaradjon), ÉS ami itt van, annak ott is (nehogy egy törölt út
       holt sorként ittmaradjon, azt a látszatot keltve, hogy védve van).

       Az összevetés a MINTÁKAT hasonlítja (":author", nem "Ady"), mert a tábla is
       azokkal dolgozik. A dinamikus utakat a `route()` függvény-objektumként adja
       (hívható builder + `pattern` mező), ezért kell a `typeof` — ez VALÓDI
       futásidejű vizsgálat, nem állítás az értékről. */
    it("a tábla pontosan a PATHS idézet-névterét fedi le (se több, se kevesebb)", () => {
        const quotePatterns = Object.values(PATHS)
            .map((value) => (typeof value === "string" ? value : value.pattern))
            .filter((pattern) => pattern === PATHS.quotes || pattern.startsWith(PATHS.quotes + "/"));

        /* Kontroll a hamis zöld ellen: ha a szűrő egyszer semmit nem találna (mert
           mondjuk a szekció gyökere átalakul), a két üres lista egyenlő lenne, és a
           kapu csöndben átengedne mindent. */
        expect(quotePatterns.length).toBeGreaterThan(1);
        expect(QUOTE_VIEWS.map((view) => view.path).sort()).toEqual(quotePatterns.sort());
    });
});
