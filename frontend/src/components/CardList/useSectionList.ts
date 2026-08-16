import {useSortableCards} from "./useSortableCards";
import type {SortableCard} from "./useSortableCards";
import type {Endpoint} from "../../endpoints";
import type {Validator} from "../../types/api";
import {useAuth} from "../../contexts/auth-context";
import {useRememberSection} from "../Navbar/useRememberSection";
import type {SectionPath} from "../Navbar/sections";

/* Egy SZEKCIÓ lista-nézetének adatoldala: betöltés, húzással átrendezés, és annak
   megjegyzése, hogy a felhasználó ebben a szekcióban járt. A to-do lista, az
   idézet-lista és a keresési találat is ezt hívja — a különbség csak a végpontokban
   és a szűrőben van.

   Miért van a `handleAxios` ITT, és nem a hívóban? Mert minden lista-nézet
   ugyanazt a hitelesített hívót használja; ha a hívó adná át, három helyen kellene
   ugyanazt a két sort leírni, és egy elfelejtett useAuth() csendben más példányt
   hozhatna be. A `filter`-t viszont a hívó adja: az szekció-specifikus (kategória,
   szín, szerző, keresőkifejezés), és MEMOIZÁLVA kell érkeznie — egy rendernként
   újragyártott objektum-literál a betöltő effektet végtelen ciklusba vinné.

   A visszaadott `grid` a húzás-vezérlés együttese (érzékelők, esemény-kezelők,
   oszlopszám) — egyben adjuk tovább a CardListView-nak, hogy a hívónak ne kelljen
   ismernie a darabjait.

   A `<T>` végigfut a hívótól a useSortableCards-ig: a nézet megmondja, milyen
   kártyákat vár (Todo, Quote…), és a `cards` pontosan azt adja vissza. A hook maga
   egyikről sem tud semmit — csak annyit, hogy van `_id`-je és `order`-e. */
export function useSectionList<T extends SortableCard>(
    {url, filter, reorderUrl, section, schema}: {
        url: Endpoint;
        filter?: Record<string, unknown> | null;
        reorderUrl: Endpoint;
        /* A válasz ellenőrzője, a hívótól — csak ő tudja, milyen kártyát kért. A
           `T` és a séma EGYÜTT érkezik, különben a típus ígéret maradna (a
           részletes indoklás és a memoizálási kényszer: useSortableCards.ts). */
        schema: Validator<T[]>;
        /* A `section` NEM végpont, hanem NAVIGÁCIÓS út: a szekció gyökere, amit a
           useRememberSection megjegyez, és ahová a gyökér-átirányítás visszatér.
           A két fogalom szándékosan külön (l. endpoints.ts) — ezért NEM `Endpoint`.

           De nem is `string`: a `SectionPath` a sections.ts listájából származik,
           tehát csak LÉTEZŐ szekció gyökere adható át. Egy szűrt út vagy egy
           elgépelés így fordítási hiba, nem néma emlékezet-vesztés. */
        section: SectionPath;
    },
) {
    const {handleAxios} = useAuth();
    const {cards, isLoading, ...grid} = useSortableCards<T>({url, filter, reorderUrl, handleAxios, schema});

    // A gyökér-átirányítás ide tér vissza: a szűrt nézetek is a szekció GYÖKERÉT
    // jegyzik meg, nem az éppen aktív szűrőt.
    useRememberSection(section);

    return {cards, isLoading, grid};
}
