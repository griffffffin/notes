import {closestCenter, DndContext} from "@dnd-kit/core";
import {rectSortingStrategy, SortableContext, verticalListSortingStrategy} from "@dnd-kit/sortable";
import type {ReactNode} from "react";
import SortableCard from "../Todos/DragAndDrop/sortableCard";
/* Névütközés feloldása: a `SortableCard` ebben a fájlban a KOMPONENS (a húzható
   burkoló doboz), a hookból importált azonos nevű típus pedig a kártya ADATÁNAK
   alakja. Ezért kap az utóbbi külön nevet itt — a hook oldalán marad az eredeti. */
import type {CardGridControls, SortableCard as SortableCardData} from "./useSortableCards";
import {restrictToList} from "../Todos/DragAndDrop/restrictToList";

// Állandó tömb: rendernként újat adva a DndContext fölöslegesen dolgozna.
const MODIFIERS = [restrictToList];

/* A vízszintes auto-görgetés KIKAPCSOLVA (x: 0); a függőleges zóna az
   alapértelmezettnél (0.2) tágabb, hogy a görgetés HAMARABB induljon: az ujjnak
   nem kell a képernyő széléhez érnie (a magas kártyák túlnyúlnak rajta). A
   sebességet külön szám adja, hogy a "későn indul" hibát ne a "gyorsabban
   görgessen" válasszal kompenzáljuk. A vízszintes nullát a restrictToList amúgy
   is biztosítja; ez a némán-tartás kettős biztosítéka. */
const AUTO_SCROLL_THRESHOLD = {x: 0, y: 0.35};
const AUTO_SCROLL_ACCELERATION = 25;

/* A húzás-vezérlőket EGYBEN vesszük át (a hookból származtatott alakban), a
   kártyákat és a megjelenítőjüket pedig külön: az előbbi átmenő adat, az utóbbi
   kettő az, amiről ennek a komponensnek tudnia kell. */
type SortableCardGridProps<T extends SortableCardData> = CardGridControls & {
    cards: T[];
    renderCard: (card: T) => ReactNode;
};

/* A húzható kártyarács — szekciótól független VÁZ. A kártya TARTALMÁT a hívó
   adja a renderCard render-proppal (a to-do kártyája más, mint az idézeté), az
   átrendezés LOGIKÁJA a useSortableCards hookban van.

   A rendezési stratégia az oszlopszámtól függ: a rectSorting minden elemet a
   MÁSIK kártya eredeti téglalapjához igazít — ez csak egyforma méretnél helyes.
   A mi kártyáink változó magasak, ezért egy oszlopnál (telefon) a tényleges
   magasságokkal számoló verticalListSorting a pontos; rácsban a rectSorting
   marad (ott az oldalszomszédokat is kell). */
export default function SortableCardGrid<T extends SortableCardData>({
    cards, isSingleColumn, sensors, handleDragStart, handleDragEnd, handlePointerDownCapture, renderCard,
}: SortableCardGridProps<T>) {
    return (
        /* mt-3: a navbar és az ELSŐ kártyasor közötti levegő. Ez a rácson ül, nem a
           kártyán — a kártyáknak SEMMILYEN függőleges margójuk nincs (l. sortableCard),
           a sorok közti térközt a .todo-grid row-gapje adja (index.css).

           pb-1: egy csepp levegő az UTOLSÓ sor alatt is, hogy a legalsó kártya kerete
           ne érjen a lap aljához. Miért padding és nem margó (mb-1), pedig az azonos
           méret? Mert az utolsó elem alsó MARGÓJA összeolvadhat a szülőjével
           (margin collapsing), és akkor nem növelné a görgethető magasságot — a
           térköz némán elmaradna. A belső térköz (padding) sosem olvad össze. */
        <div className="container-fluid mt-3 pb-1">
            <DndContext sensors={sensors} collisionDetection={closestCenter}
                        onDragStart={handleDragStart} onDragEnd={handleDragEnd}
                        modifiers={MODIFIERS}
                        autoScroll={{acceleration: AUTO_SCROLL_ACCELERATION, threshold: AUTO_SCROLL_THRESHOLD}}>
                <SortableContext items={cards.map((card) => card._id)}
                                 strategy={isSingleColumn ? verticalListSortingStrategy : rectSortingStrategy}>
                    <div className="row justify-content-center todo-grid"
                         onPointerDownCapture={handlePointerDownCapture}>
                        {cards.map((card) =>
                            <SortableCard key={card._id} id={card._id}>
                                {renderCard(card)}
                            </SortableCard>,
                        )}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    );
}
