import {useCallback, useEffect, useRef, useState} from "react";
import {MouseSensor, TouchSensor, useSensor, useSensors} from "@dnd-kit/core";
import {arrayMove} from "@dnd-kit/sortable";
import {logRequestError} from "../../log";

/* Ujjal ennyit kell a kártyán tartani, mire a húzás elindul. Ez választja szét a
   GÖRGETÉST a húzástól: enélkül minden felfelé simítás megfogná a kártyát. A
   tolerancia pár pixel elmozdulást enged (ujj sosem áll teljesen). 300 ms: az
   Android hosszú-nyomása 500 ms, de az lomha — a kártya megfogása közvetlen
   mozdulat, nem menü-előhívás; 300 ms még bőven a görgetés fölött van. */
const TOUCH_HOLD_MS = 300;
const TOUCH_TOLERANCE_PX = 5;

/* Egérrel nem kell várni — ott a MOZGÁS választ szét: 8 pixel alatt kattintás
   (megnyit), fölötte húzás. */
const MOUSE_DRAG_START_PX = 8;

/* A kártyák Bootstrap-oszlopai 576 px alatt EGYETLEN oszlopba rendeződnek. Ez a
   határ dönti el, melyik rendezési stratégia helyes (a SortableCardGrid-ben). */
const SINGLE_COLUMN_QUERY = "(max-width: 575.98px)";

/* Egy húzással átrendezhető kártyalista LOGIKÁJA — kategóriától független. A
   to-do és az idézet lista ugyanezt a betöltés+húzás gépezetet használja; csak a
   végpont (`url`, `reorderUrl`), a `filter` és a kártya TARTALMA tér el (az
   utóbbi a SortableCardGrid render-propja). A `skip` a szűrő nélküli szűrt
   nézetet fedi: a hívó ilyenkor átirányít, addig ne induljon lekérés.

   A kártyák azonosítója egységesen a MongoDB `_id` (mindkét kategóriában az), a
   sorrend pedig az `order` mező — a húzás ezekre épül. */
export function useSortableCards({url, filter, reorderUrl, handleAxios, skip}) {
    const [cards, setCards] = useState();
    const [isLoading, setIsLoading] = useState(true);

    /* Versenyhelyzet ellen. Ez az effekt egy betöltésen belül többször is
       elindulhat (a törlés utáni navigáció két lekérést indít), és két
       párhuzamos válasz fordított sorrendben is visszaérhet — ilyenkor egy RÉGI
       válasz felülírná a frisset (éles buildben ez ragasztotta bent a törölt
       elem "szellemét"). A guard: minden lefutás saját `active` jelzőt kap, a
       cleanup false-ra állítja; csak a LEGUTÓBBI kérés írhat. */
    useEffect(() => {
        if (skip) return;
        let active = true;
        handleAxios(url, filter ?? {}, (response) => {
            if (active) setCards(response.data);
        }, (error) => {
            if (!active) return;
            logRequestError(error);
            // A pörgő karika azt ígéri, MINDJÁRT jön az adat — hiba után inkább
            // üres lista, mint örök várakozás.
            setCards([]);
        });
        return () => {active = false;};
    }, [url, filter, skip, handleAxios]);

    useEffect(() => {
        if (cards) setIsLoading(false);
    }, [cards]);

    /* Egy oszlopban van-e a lista? A rendezési stratégia ezen múlik (a
       SortableCardGrid használja): egy oszlopnál a tényleges magasságokkal
       számoló függőleges, rácsban a rectSorting. */
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

    /* Volt-e húzás a mostani lenyomás óta? Enélkül nem tudnánk különbséget tenni
       a húzást lezáró kattintás (elnyelendő) és a szándékos kattintás
       (átengedendő) között — a kettő ugyanúgy néz ki. Ref, mert a változása nem
       járhat újrarajzolással. */
    const draggedSincePress = useRef(false);

    const handleDragStart = useCallback(() => {
        draggedSincePress.current = true;
    }, []);

    // Minden új lenyomás tiszta lappal indul, különben egy húzás után a
    // KÖVETKEZŐ, jogos kattintást is elnyelnénk.
    const handlePointerDownCapture = useCallback(() => {
        draggedSincePress.current = false;
    }, []);

    /* A húzást lezáró kattintás elnyelése. A kártya tartalma link, tehát enélkül
       minden áthelyezés végén megnyílna a szerkesztő/nézet.

       A DOKUMENTUMON és a felépüléskor felkötve: a dnd-kit is tesz fel egy
       dokumentum-szintű, capture-fázisú click-kezelőt, ami stopPropagation-t hív
       — onnantól az esemény el sem jut egy rács-szintű kezelőig. Azonos elemen a
       capture-kezelők a felkötés sorrendjében futnak: a dnd-kit a lenyomáskor
       köti a magáét, mi a felépüléskor — így mi vagyunk előbb.

       preventDefault (nem csak stopPropagation): a dnd-kit stopPropagation-je a
       React-kezelőket (a router-navigációt) némítja, de az <a> ALAPÉRTELMEZETT
       viselkedését nem — a böngésző emiatt teljes oldalbetöltéssel ment a linkre.
       Ezt CSAK a preventDefault állítja meg. */
    useEffect(() => {
        const swallowClickAfterDrag = (event) => {
            if (!draggedSincePress.current) return;
            draggedSincePress.current = false;
            event.preventDefault();
            event.stopPropagation();
        };
        document.addEventListener("click", swallowClickAfterDrag, true);
        return () => document.removeEventListener("click", swallowClickAfterDrag, true);
    }, []);

    const handleDragEnd = useCallback((event) => {
        const {active, over} = event;
        if (!over || active.id === over.id) return;

        const from = cards.findIndex((card) => card._id === active.id);
        const to = cards.findIndex((card) => card._id === over.id);
        if (from === -1 || to === -1) return;

        /* A szervernek NEM az új indexet küldjük, hanem a célhelyen álló kártya
           TÉNYLEGES sorszámát. Az index csak a szűretlen listán egyezne a
           sorszámmal; egy szűrt nézetben a lista részhalmaz, ott a 3. helyre
           húzott elem nem a 3. sorszámot kapja. A "tedd oda, ahol ez a kártya
           áll" viszont mindkét esetben ugyanazt jelenti. */
        const targetOrder = cards[to].order;
        const previous = cards;

        // Optimista: azonnal a helyére ugrik. Ha a mentés megbukik, visszaállunk
        // — a néma elcsúszás rosszabb lenne, mert csak legközelebbi töltéskor
        // derülne ki.
        setCards(arrayMove(cards, from, to));

        handleAxios(reorderUrl, {id: active.id, order: targetOrder},
            () => {},
            (error) => {
                logRequestError(error);
                setCards(previous);
            });
    }, [cards, reorderUrl, handleAxios]);

    return {
        cards, isLoading, isSingleColumn, sensors,
        handleDragStart, handleDragEnd, handlePointerDownCapture,
    };
}
