import {closestCenter, DndContext} from "@dnd-kit/core";
import {rectSortingStrategy, SortableContext, verticalListSortingStrategy} from "@dnd-kit/sortable";
import SortableCard from "../Todo/DragAndDrop/sortableCard";
import {restrictToList} from "../Todo/DragAndDrop/restrictToList";

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

/* A húzható kártyarács — kategóriától független VÁZ. A kártya TARTALMÁT a hívó
   adja a renderCard render-proppal (a to-do kártyája más, mint az idézeté), az
   átrendezés LOGIKÁJA a useSortableCards hookban van.

   A rendezési stratégia az oszlopszámtól függ: a rectSorting minden elemet a
   MÁSIK kártya eredeti téglalapjához igazít — ez csak egyforma méretnél helyes.
   A mi kártyáink változó magasak, ezért egy oszlopnál (telefon) a tényleges
   magasságokkal számoló verticalListSorting a pontos; rácsban a rectSorting
   marad (ott az oldalszomszédokat is kell). */
export default function SortableCardGrid({
    cards, isSingleColumn, sensors, handleDragStart, handleDragEnd, handlePointerDownCapture, renderCard,
}) {
    return (
        <div className="container-fluid">
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
