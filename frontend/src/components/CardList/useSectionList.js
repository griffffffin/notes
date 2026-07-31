import {useSortableCards} from "./useSortableCards";
import {useAuth} from "../../contexts/auth-context";
import {useRememberSection} from "../Navbar/useRememberSection";

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
   ismernie a darabjait. */
export function useSectionList({url, filter, reorderUrl, section}) {
    const {handleAxios} = useAuth();
    const {cards, isLoading, ...grid} = useSortableCards({url, filter, reorderUrl, handleAxios});

    // A gyökér-átirányítás ide tér vissza: a szűrt nézetek is a szekció GYÖKERÉT
    // jegyzik meg, nem az éppen aktív szűrőt.
    useRememberSection(section);

    return {cards, isLoading, grid};
}
