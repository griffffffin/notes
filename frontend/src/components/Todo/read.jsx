import {useCallback, useEffect, useRef, useState} from "react";
import {Navigate, useLocation} from "react-router-dom";
import {
    AutoScrollActivator, closestCenter, DndContext, MouseSensor, TouchSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import {
    arrayMove, rectSortingStrategy, SortableContext, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import Spinner from "../spinner";
import LinkTodoUpdate from "../Link/todoUpdate";
import LinkCategory from "../Link/category";
import SortableCard from "./DragAndDrop/sortableCard";
import {useAuth} from "../../contexts/auth";

/* Ujjal ennyit kell a kártyán tartani, mire a húzás elindul.

   Ez az érték választja szét a GÖRGETÉST a húzástól: enélkül minden felfelé
   simítás megfogná a kártyát a lista görgetése helyett. A tolerancia azt
   engedi meg, hogy közben pár pixelt elmozdulj (ujj sosem áll teljesen).

   300 ms: az Android rendszerszintű hosszú-nyomás küszöbe 500 ms, de az itt
   lomhának bizonyult — a kártya megfogása nem menü-előhívás, hanem közvetlen
   mozdulat. 300 ms még bőven a görgetés fölött van (a simítás pár tíz ms alatt
   elindul), de nem várakoztat. */
const TOUCH_HOLD_MS = 300;
const TOUCH_TOLERANCE_PX = 5;

/* Egérrel nem kell várni — ott a MOZGÁS választja szét a kettőt: 8 pixel alatt
   kattintásnak számít (megnyitja a szerkesztőt), fölötte húzásnak. */
const MOUSE_DRAG_START_PX = 8;

/* A kártyák Bootstrap-oszlopai: col-12 col-sm-6 col-xl-4 col-xxl-3 — vagyis
   576 px alatt EGYETLEN oszlop, fölötte 2-4. Ez a határ dönti el, melyik
   rendezési stratégia a helyes (lásd lent). A szám a col-sm töréspontja; ha az
   osztályok változnak, ezt is át kell írni. */
const SINGLE_COLUMN_QUERY = "(max-width: 575.98px)";

/* A vízszintes auto-görgetés KIKAPCSOLVA (x: 0); a függőleges marad az
   alapértelmezett ötödén (y: 0.2).

   Nem ízlés kérdése: a lapunk vízszintesen SOHA nem görgethető — nincs hova. De
   ha a kártyát jobbra húzod, kilóg, amitől a böngésző túlcsordulást csinál, és
   HIRTELEN lesz mit görgetni. Az auto-görgetés erre jobbra indul, amitől még
   több hely lesz, a kártya még kijjebb megy — és elszabadul a semmibe. Balra ez
   nem fordulhat elő: negatív irányba a böngésző nem hoz létre görgethető
   területet. (A user vette észre pont ezt az aszimmetriát.) */
const AUTO_SCROLL_THRESHOLD = {x: 0, y: 0.2};

/* A görgetés sebesség-szorzója — a lenti érték a felhasználó választása, kézzel
   kipróbálva. (A könyvtár alapértelmezése 10; a számot itt szándékosan nem
   ismételem meg prózában, hogy ne tudjon elcsúszni a kódtól.)

   Azért hihető érték, mert TISZTA feltételek közt született. A szorzó
   emelgetése ugyanis sokáig csak a tünetet kezelte volna: a Bootstrap animált
   görgetése nyelte el a kért görgetés 99,5%-át (lásd index.css:
   scroll-behavior). Amíg ez az ok élt, semmilyen szorzó nem volt igazán
   "helyes" — utána viszont már az alapértelmezés is bőven elég lett, és innen
   lehetett érzésre hangolni. */
const AUTO_SCROLL_ACCELERATION = 15;

/* A kártya ne hagyhassa el a listát.

   Miért kell: a húzott kártya CSS-eltolással mozog, az eltolt elem pedig
   MEGNÖVELI a lap görgethető területét. Ha a lista alá húzod, a böngésző
   hirtelen ad még görgethető helyet, az auto-görgetés követi, attól még több
   hely lesz — és a kártya elszabadul a "semmibe". Ugyanez oldalra. Fölfelé és
   balra ez nem fordulhat elő: negatív irányba a böngésző NEM hoz létre
   görgethető területet. (A user mindkét irányban észrevette pont ezt az
   aszimmetriát.)

   Egy módosító nem több, mint egy függvény: megkapja a húzás eltolását, és
   visszaadja a MEGENGEDETTET. A konténer a kártya szülője, vagyis a lista sora
   — a kártya azon belül bárhova mehet, azon kívülre nem. Egy oszlopban ez
   ingyen adja a "csak függőlegesen" viselkedést is: ott a kártya kitölti a sor
   szélességét, tehát vízszintesen nincs hova mozdulnia.

   Az auto-görgetést NEM akadályozza: a sor a képernyőnél magasabb, tehát a
   kártya bőven kilóghat a látható rész fölé/alá — csak a listán túlra nem. */
const restrictToList = ({transform, draggingNodeRect, containerNodeRect}) => {
    if (!draggingNodeRect || !containerNodeRect) return transform;
    const limited = {...transform};

    if (draggingNodeRect.top + transform.y <= containerNodeRect.top)
        limited.y = containerNodeRect.top - draggingNodeRect.top;
    else if (draggingNodeRect.bottom + transform.y >= containerNodeRect.top + containerNodeRect.height)
        limited.y = containerNodeRect.top + containerNodeRect.height - draggingNodeRect.bottom;

    if (draggingNodeRect.left + transform.x <= containerNodeRect.left)
        limited.x = containerNodeRect.left - draggingNodeRect.left;
    else if (draggingNodeRect.right + transform.x >= containerNodeRect.left + containerNodeRect.width)
        limited.x = containerNodeRect.left + containerNodeRect.width - draggingNodeRect.right;

    return limited;
};

// Állandó tömb: rendernként újat adva a DndContext fölöslegesen dolgozna.
const MODIFIERS = [restrictToList];

export default function Read(props) {
    const [isLoading, setIsLoading] = useState(true);
    const location = useLocation();
    const [todos, setTodos] = useState();
    const {handleAxios} = useAuth();

    /* A szűrő (kategória vagy szín) a navigációs állapotból jön. A felhasználó
       azonosítója NEM: azt a szerver a tokenből tudja.

       A szűrt nézetek NEM állnak meg a szűrő nélkül: a /category-nek tudnia
       kell, MELYIK kategóriát kérdezze. A navigációs state viszont csak
       navigációval együtt érkezik — közvetlen URL-beírásnál vagy F5-nél üres.
       Ilyenkor üres szűrőt küldenénk, amit a szerver joggal utasít el, a lista
       sosem érkezne meg, és a betöltő-jelző ÖRÖKRE bent ragadna — a felhasználó
       egy pörgő karikát bámulna, amiből nincs kiút. Ezért lentebb inkább
       visszavisszük a főoldalra, ahogy a /update is teszi id nélkül.

       (Ez a rés a navigációs state-re épülő tervezésből fakad. A gyökeres
       megoldás az URL-alapú útvonal — /category/:name —, ami a kategória-
       bővítéssel jön; addig ez az őr fedez.) */
    const needsFilter = props.url === "/category" || props.url === "/color";
    const filter = location.state ?? null;
    const missingFilter = needsFilter && !filter;

    useEffect(() => {
        if (missingFilter) return;
        handleAxios(props.url, filter ?? {}, (response) => setTodos(response.data),
            (error) => {
                console.log(error.response?.data ?? error.message);
                /* A pörgő karika azt ígéri, hogy MINDJÁRT jön az adat. Ha a
                   kérés elbukott, ez hazugság: inkább üres listát mutatunk,
                   mint egy örökké tartó várakozást. */
                setTodos([]);
            });
    }, [props.url, filter, missingFilter, handleAxios]);

    useEffect(() => {
        if (todos) setIsLoading(false);
    }, [todos]);

    /* Egy oszlopban VAN-e a lista? A stratégia ezen múlik.

       A rectSortingStrategy úgy tolja el a kártyákat, hogy mindegyiket a
       helyére kerülő MÁSIK kártya eredeti téglalapjához igazítja — ez csak
       akkor helyes, ha minden elem EGYFORMA méretű. A mi kártyáink változó
       magasak (annyi listaelem van rajtuk, amennyit a felhasználó írt), ezért
       eltérő magasságú szomszédoknál a kártyák elcsúsznak: rés vagy átfedés
       keletkezik. (A user vette észre a pontos mintát: 0 és 1 listaelemű kártya
       között romlik el, 0-0 vagy 1-1 között soha — mert ott a magasságok
       egyeznek.)

       A verticalListSortingStrategy a TÉNYLEGES magasságokkal számol, tehát
       változó méretnél is pontos — de csak egyetlen oszlopban értelmes. Rácsban
       nem tudja, hogy oldalra is van szomszéd.

       Ezért: egy oszlopnál (telefon) a függőleges, rácsban a rectSorting. Így a
       hiba ott szűnik meg, ahol tényleg jelentkezik, és a rács is marad. */
    const [isSingleColumn, setIsSingleColumn] = useState(
        () => typeof window !== "undefined" && window.matchMedia(SINGLE_COLUMN_QUERY).matches);

    useEffect(() => {
        const query = window.matchMedia(SINGLE_COLUMN_QUERY);
        const update = (event) => setIsSingleColumn(event.matches);
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);

    const sensors = useSensors(
        useSensor(MouseSensor, {activationConstraint: {distance: MOUSE_DRAG_START_PX}}),
        useSensor(TouchSensor, {activationConstraint: {delay: TOUCH_HOLD_MS, tolerance: TOUCH_TOLERANCE_PX}}),
    );

    /* Volt-e húzás a mostani lenyomás óta — EGY jelző az egész rácsra.

       A dnd-kit (a react-beautiful-dnd-vel ellentétben) nem nyeli el a húzás
       utáni kattintást, a böngésző viszont küld egyet a felengedéskor. A kártya
       kattintásra a szerkesztőt nyitja, tehát enélkül minden áthelyezés
       megnyitná a szerkesztőt — épp azt, amit nem akartunk.

       Miért a rácson, és nem kártyánként? Mert a kattintás nem feltétlenül azon
       a kártyán landol, amit húztunk: a lista közben átrendeződik, így a kurzor
       alá a szomszéd is kerülhet. Kártyánkénti jelzővel a szomszéd átengedte
       volna a kattintást (ő maga nem volt húzva) — és hogy melyik szomszéd kerül
       oda, az attól függ, FELFELÉ vagy lefelé húztunk. Innen jött, hogy a
       sorszám növelése hibátlan volt, a csökkentése viszont elnavigált. */
    const draggedSincePress = useRef(false);

    const handleDragStart = useCallback(() => {
        draggedSincePress.current = true;
    }, []);

    // Minden új lenyomás tiszta lappal indul, különben egy húzás után a
    // KÖVETKEZŐ, jogos kattintást is elnyelnénk.
    const handlePointerDownCapture = useCallback(() => {
        draggedSincePress.current = false;
    }, []);

    // Capture fázis: a kártya saját kattintás-kezelője ELÉ kell kerülnünk —
    // a capture a gyökértől halad lefelé, tehát mi vagyunk előbb.
    const handleClickCapture = useCallback((event) => {
        if (!draggedSincePress.current) return;
        draggedSincePress.current = false;
        event.preventDefault();
        event.stopPropagation();
    }, []);

    const handleDragEnd = useCallback((event) => {
        const {active, over} = event;
        if (!over || active.id === over.id) return;

        const from = todos.findIndex((todo) => todo._id === active.id);
        const to = todos.findIndex((todo) => todo._id === over.id);
        if (from === -1 || to === -1) return;

        /* A szervernek NEM az új indexet küldjük, hanem a célhelyen álló kártya
           TÉNYLEGES sorszámát. Az index csak a szűretlen főoldalon egyezne a
           sorszámmal; egy kategória-nézetben a lista részhalmaz, ott a 3. helyre
           húzott elem nem a 3. sorszámot kapja. A "tedd oda, ahol ez a kártya
           áll" viszont mindkét esetben ugyanazt jelenti. */
        const targetOrder = todos[to].order;
        const previous = todos;

        // Optimista: azonnal a helyére ugrik, nem várunk a szerverre. Ha a
        // mentés mégis megbukik, visszaállunk — a néma elcsúszás rosszabb lenne,
        // mint a visszaugrás, mert legközelebbi töltéskor derülne csak ki.
        setTodos(arrayMove(todos, from, to));

        handleAxios("/reorder", {id: active.id, order: targetOrder},
            () => {},
            (error) => {
                console.log(error.response?.data ?? error.message);
                setTodos(previous);
            });
    }, [todos, handleAxios]);

    // Szűrő nélküli szűrt nézet: nincs mit listázni, vissza a főoldalra. A
    // replace azért kell, hogy a zsákutca ne kerüljön az előzményekbe.
    if (missingFilter) return <Navigate to="/" replace/>;

    return (
        isLoading ? <Spinner class="min-vh-75"/> :
            <div className="container-fluid">
                {/* activator: a görgetés a HÚZOTT KÁRTYA helyzetét nézze, ne az ujjét.

                    A dnd-kit alapból az ujjat figyeli (AutoScrollActivator.Pointer), és
                    abból számol, milyen közel van a képernyő széléhez. A kártya viszont
                    MAGAS, és fölfelé túlnyúlik az ujjon: mire a kártya látszólag a lap
                    tetejére ér, az ujj még a képernyő harmadánál jár (mérve: 245 px,
                    miközben a kártya teteje már −85-nél volt). Az alapértelmezett zóna a
                    képernyő 20%-a — oda az ujj így EL SEM ÉRNE, tehát a görgetés meg sem
                    indulna. A kártya téglalapjával azt mérjük, amit a felhasználó LÁT.

                    A sebesség-szorzót lásd az AUTO_SCROLL_ACCELERATION-nél. */}
                <DndContext sensors={sensors} collisionDetection={closestCenter}
                            onDragStart={handleDragStart} onDragEnd={handleDragEnd}
                            modifiers={MODIFIERS}
                            autoScroll={{activator: AutoScrollActivator.DraggableRect,
                                         acceleration: AUTO_SCROLL_ACCELERATION,
                                         threshold: AUTO_SCROLL_THRESHOLD}}>
                    <SortableContext items={todos.map((todo) => todo._id)}
                                     strategy={isSingleColumn ? verticalListSortingStrategy : rectSortingStrategy}>
                        <div className="row justify-content-center todo-grid"
                             onPointerDownCapture={handlePointerDownCapture}
                             onClickCapture={handleClickCapture}>
                            {todos.map((todo) =>
                                <SortableCard key={todo._id} id={todo._id}>
                                    <div className={"card bg-transparent border-2 border-" + todo.color}>
                                        <LinkTodoUpdate todo={todo} handleLinkClicked={props.handleLinkClicked}/>
                                        <LinkCategory category={todo.category} color={todo.color}
                                                      onClick={props.handleLinkClicked}
                                                      class={"card-footer small text-center bg-transparent mx-2 border-" +
                                                          todo.color}/>
                                    </div>
                                </SortableCard>
                            )}
                        </div>
                    </SortableContext>
                </DndContext>
            </div>
    );
}
