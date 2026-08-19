import {Navigate} from "react-router-dom";
import type {ReactNode} from "react";
import Spinner from "../spinner";
import LoadFailedNotice from "../loadFailedNotice";
import SortableCardGrid from "./SortableCardGrid";
import type {CardGridControls, SortableCard} from "./useSortableCards";

/* A `<T>` a KÁRTYA típusa: a nézet nem tudja, to-dót vagy idézetet mutat, csak
   annyit, hogy a kártyának van `_id`-je és `order`-e (ennyit követel a húzás). A
   hívó a saját teljes típusát adja meg, és a `renderCard` pontosan azt kapja
   vissza — nem egy megcsonkított alakot. */
type CardListViewProps<T extends SortableCard> = {
    /* A betöltés BEFEJEZTÉIG `undefined` — nem üres tömb. A kettő nem ugyanaz, és
       a különbség az `emptyRedirect` döntésén múlik (l. lentebb). */
    cards: T[] | undefined;
    isLoading: boolean;
    /* A betöltés elbukott (hálózat, időtúllépés vagy elcsúszott szerződés). Külön
       a `cards`-tól: az ÜRES lista és a SIKERTELEN betöltés két különböző dolog. */
    loadFailed: boolean;
    /* A bukott lekérés újraindítása (a hook `reload`-ja) — a hibajelzés „Újra"
       gombja hívja. */
    onRetry: () => void;
    grid: CardGridControls;
    emptyRedirect?: string | null;
    renderCard: (card: T) => ReactNode;
};

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
export default function CardListView<T extends SortableCard>({
    cards, isLoading, loadFailed, onRetry, grid, emptyRedirect, renderCard,
}: CardListViewProps<T>) {
    /* A HIBA ÁGA MINDEN MÁS ELŐTT. Két dolgot előz meg, és mindkettő némán
       félrevezetne:

       1. az ÁTIRÁNYÍTÁST — a sikertelen betöltés eddig üres listának látszott,
          amitől egy szűrt nézet (kategória, szerző, keresés) magától visszavitte a
          felhasználót a főlistára. Úgy nézett ki, mintha a szűrőhöz nem lenne
          egyetlen elem sem, pedig csak a válasz nem érkezett meg;
       2. az ÜRES NÉZETET — az azt ÁLLÍTJA, hogy nincs adat. Nem tudjuk, hogy
          nincs-e; azt tudjuk, hogy most nem tudtuk lekérni.

       A szöveg SZÁNDÉKOSAN semmitmondó a részletek felől: se végpont, se
       hibakód, se séma-üzenet. Az a fejlesztőnek szól, és a szerver naplójába
       megy (contractFault.ts → /client-error). A felhasználónak az a hasznos, hogy
       nem ő rontott el semmit, és mit tehet. */
    if (loadFailed) return <LoadFailedNotice message="Hiba az oldal betöltése közben." onRetry={onRetry}/>;

    if (emptyRedirect && Array.isArray(cards) && cards.length === 0)
        return <Navigate to={emptyRedirect} replace/>;

    /* A `!cards` ág eddig hallgatólagos feltevés volt: a hook az `isLoading`-ot
       PONTOSAN akkor kapcsolja hamisra, amikor a `cards` megérkezett, tehát a
       kettő ma sosem válik szét. Ez azonban a hook belügye — innen nézve semmi
       nem garantálja. A típus kényszerítette ki, hogy kimondjuk (a rács `T[]`-t
       vár, nem `undefined`-ot), és így az invariáns megsérülése is a helyes
       viselkedést adja: még egy kicsit pörög a karika, nem pedig elszáll a
       `cards.map`. */
    if (isLoading || !cards) return <Spinner class="min-vh-75"/>;

    return <SortableCardGrid cards={cards} {...grid} renderCard={renderCard}/>;
}
