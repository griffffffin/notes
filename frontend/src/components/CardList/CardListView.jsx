import {Navigate} from "react-router-dom";
import Spinner from "../spinner";
import SortableCardGrid from "./SortableCardGrid";

/* Egy szekció lista-nézetének MEGJELENÍTŐ oldala: a betöltő, az üres nézet
   kezelése és maga a kártyarács. Az adatot a useSectionList adja, a kártya
   TARTALMÁT a hívó (renderCard) — így ez a komponens semmit nem tud arról, hogy
   to-dót, idézetet vagy keresési találatot mutat.

   `emptyRedirect`: hova menjünk, ha a lista ÜRESEN érkezett — vagy null, ha az
   üresség legitim.

   Miért nem mindig irányítunk át? Mert a kétféle üresség mást jelent. Egy SZŰRT
   nézet (kategória, szín, szerző, keresés) üresen zsákutca: az utolsó ilyen elemet
   átsorolták vagy törölték, nincs mit mutatni és nincs honnan visszajutni — ezért
   a szekció főlistájára visszük a felhasználót. A FŐLISTA viszont legitimen lehet
   üres (még nincs egyetlen elem sem); onnan átirányítani végtelen körré válna.

   Az `Array.isArray` őr nem díszítés: a `cards` betöltés közben `undefined`, arra
   a hossz-vizsgálat hamis eredményt adna — enélkül minden szűrt nézet átirányítana
   a saját betöltése közben, még mielőtt az adat megérkezne. */
export default function CardListView({cards, isLoading, grid, emptyRedirect, renderCard}) {
    if (emptyRedirect && Array.isArray(cards) && cards.length === 0)
        return <Navigate to={emptyRedirect} replace/>;

    if (isLoading) return <Spinner class="min-vh-75"/>;

    return <SortableCardGrid cards={cards} {...grid} renderCard={renderCard}/>;
}
