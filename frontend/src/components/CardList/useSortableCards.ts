import {useCallback, useEffect, useRef, useState} from "react";
import {MouseSensor, TouchSensor, useSensor, useSensors} from "@dnd-kit/core";
import type {DragEndEvent} from "@dnd-kit/core";
import {arrayMove} from "@dnd-kit/sortable";
import {logRequestError} from "../../log";
import type {HandleAxios} from "../../contexts/auth-context";
import type {Endpoint} from "../../endpoints";
import type {Id, Validator} from "../../types/api";
import {parseResponse} from "../../contractFault";

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

/* Amit egy kártyától MEGKÖVETELÜNK — és pontosan csak azt. A hook nem tudja (és
   nem is akarja tudni), hogy to-dót vagy idézetet rendezünk: neki két dolog kell,
   az azonosító a húzáshoz és a sorszám az átrendezéshez. A `T extends SortableCard`
   ezt mondja ki: bármi jöhet, ami legalább ennyit tud, és a hívó a SAJÁT teljes
   típusát kapja vissza a `cards`-ban — nem egy megcsonkított alakot. */
export type SortableCard = {_id: Id; order: number};

type SortableCardsOptions<T> = {
    // A lista LEKÉRÉSÉNEK végpontja (nem a böngésző címe) — l. endpoints.ts.
    url: Endpoint;
    /* A szűrő szekció-specifikus (kategória, szín, szerző, keresőkifejezés), ezért a
       hívó adja. MEMOIZÁLVA kell érkeznie: egy rendernként újragyártott
       objektum-literál a betöltő effektet végtelen ciklusba vinné. */
    filter?: Record<string, unknown> | null | undefined;
    reorderUrl: Endpoint;
    handleAxios: HandleAxios;
    /* A VÁLASZ ELLENŐRZŐJE — a hívótól, mert csak ő tudja, MILYEN kártyát kért.
       A hook szándékosan nem ismeri a `T`-t (to-dót és idézetet is listáz), egy
       ismeretlen alakot pedig nem lehet ellenőrizni: aki a típust megadja, annak
       kell a hozzá tartozó sémát is adnia. Enélkül a `T` puszta ígéret maradna —
       pontosan az, amit ezzel az átállással megszüntettünk (l. types/api.ts).

       MODUL SZINTŰ KONSTANS kell ide (todoListSchema, quoteListSchema), nem a
       renderben összerakott `v.array(...)`: a séma a betöltő effekt függősége,
       és egy rendernként újragyártott objektum végtelen ciklusba vinné —
       ugyanaz a kényszer, mint a `filter`-nél. */
    schema: Validator<T[]>;
};

/* Egy húzással átrendezhető kártyalista LOGIKÁJA — szekciótól független. A
   to-do és az idézet lista ugyanezt a betöltés+húzás gépezetet használja; csak a
   végpont (`url`, `reorderUrl`), a `filter` és a kártya TARTALMA tér el (az
   utóbbi a SortableCardGrid render-propja).

   A kártyák azonosítója egységesen a MongoDB `_id` (mindkét szekcióban az), a
   sorrend pedig az `order` mező — a húzás ezekre épül. */
export function useSortableCards<T extends SortableCard>(
    {url, filter, reorderUrl, handleAxios, schema}: SortableCardsOptions<T>,
) {
    const [cards, setCards] = useState<T[]>();
    const [isLoading, setIsLoading] = useState(true);
    /* A BETÖLTÉS ELBUKOTT-e. Külön a `cards`-tól, mert az üres lista és a
       sikertelen betöltés KÉT KÜLÖNBÖZŐ dolog, és eddig ugyanúgy néztek ki: hiba
       esetén üres tömböt tettünk be, amitől a képernyő azt mondta, "még nincs
       egyetlen elemed sem". A felhasználó a hibát nem tudta megkülönböztetni a
       hiánytól, a szűrt nézetek pedig némán át is irányítottak a főlistára (l.
       CardListView emptyRedirect). */
    const [loadFailed, setLoadFailed] = useState(false);
    /* ÚJRAPRÓBÁLKOZÁS-SZÁMLÁLÓ. A betöltő effekt függőségei közt szerepel, tehát a
       léptetése újra lefuttatja a lekérést — anélkül, hogy az egész oldalt
       újratöltenénk (az minden állapotot elvesztene: nyitott legördülők, görgetés,
       a szerkesztőben beírt szöveg). A `reload` a nézetnek szól: a hibajelzés
       „Újra" gombja hívja. */
    const [retryCount, setRetryCount] = useState(0);
    const reload = useCallback(() => setRetryCount((count) => count + 1), []);

    /* Versenyhelyzet ellen. Ez az effekt egy betöltésen belül többször is
       elindulhat (a törlés utáni navigáció két lekérést indít), és két
       párhuzamos válasz fordított sorrendben is visszaérhet — ilyenkor egy RÉGI
       válasz felülírná a frisset (éles buildben ez ragasztotta bent a törölt
       elem "szellemét"). A guard: minden lefutás saját `active` jelzőt kap, a
       cleanup false-ra állítja; csak a LEGUTÓBBI kérés írhat. */
    useEffect(() => {
        let active = true;
        setLoadFailed(false);
        setIsLoading(true);
        handleAxios(url, filter ?? {}, (response) => {
            /* A séma a hívóé, a `T` is az övé — a kettő ugyanonnan jön, tehát a
               `cards` most már ELLENŐRZÖTT adatot tart, nem ígéretet. A bukó
               ellenőrzés dob, és a lenti hibaágon köt ki, mint egy időtúllépés. */
            const loaded = parseResponse(schema, response.data, url);
            if (active) setCards(loaded);
        }, (error) => {
            if (!active) return;
            logRequestError(error);
            /* A pörgő karika azt ígéri, MINDJÁRT jön az adat — hiba után tehát
               nem várakoztatunk tovább. De üres listát sem mutatunk: az azt
               ÁLLÍTANÁ, hogy nincs egyetlen elem sem. A `loadFailed` a kettő
               közti különbség; a nézet ebből tud a hiányzó adatról szólni.

               Mindegy, MIÉRT bukott: hálózati hiba, időtúllépés vagy elcsúszott
               szerződés (séma-bukás) — a felhasználó számára ugyanaz a tény, hogy
               most nem tudjuk megmutatni a listát. A szerződés-hiba külön útja a
               szerver naplója felé megy (contractFault.ts), nem a képernyőre. */
            setLoadFailed(true);
            setCards([]);
        });
        return () => {active = false;};
    }, [url, filter, handleAxios, schema, retryCount]);

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
        const update = (event: MediaQueryListEvent) => setIsSingleColumn(event.matches);
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
        const swallowClickAfterDrag = (event: MouseEvent) => {
            if (!draggedSincePress.current) return;
            draggedSincePress.current = false;
            event.preventDefault();
            event.stopPropagation();
        };
        document.addEventListener("click", swallowClickAfterDrag, true);
        return () => document.removeEventListener("click", swallowClickAfterDrag, true);
    }, []);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const {active, over} = event;
        if (!over || active.id === over.id) return;
        /* A lista hiánya itt elvi lehetetlenség (kártyák nélkül nincs mit húzni),
           de a fordító nem tudhatja: a `cards` a betöltésig `undefined`. A korai
           visszatérés kimondja azt, ami eddig hallgatólagos feltevés volt. */
        if (!cards) return;

        const from = cards.findIndex((card) => card._id === active.id);
        const to = cards.findIndex((card) => card._id === over.id);
        if (from === -1 || to === -1) return;

        /* A szervernek NEM az új indexet küldjük, hanem a célhelyen álló kártya
           TÉNYLEGES sorszámát. Az index csak a szűretlen listán egyezne a
           sorszámmal; egy szűrt nézetben a lista részhalmaz, ott a 3. helyre
           húzott elem nem a 3. sorszámot kapja. A "tedd oda, ahol ez a kártya
           áll" viszont mindkét esetben ugyanazt jelenti. */
        /* A `to` a `findIndex`-ből jön, és a -1 esetet fentebb kizártuk — a
           fordító viszont ezt nem tudja végigvezetni, és jól teszi: az
           `Array.prototype[i]` bármelyik indexre adhat `undefined`-ot (ritka
           tömb, közben módosított lista). A valódi vizsgálat olcsó, és ha valaha
           mégis bekövetkezik, itt áll meg, nem a szervernek küldött
           `undefined` sorszámnál. */
        const target = cards[to];
        if (!target) return;
        const targetOrder = target.order;
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
        cards, isLoading, loadFailed, reload, isSingleColumn, sensors,
        handleDragStart, handleDragEnd, handlePointerDownCapture,
    };
}

/* A húzás-vezérlés együttese: amit a hook a kártyák MELLETT ad vissza, és ami
   érintetlenül jut el a rácsig (a hívó csak továbbadja, `grid` néven).

   SZÁRMAZTATOTT típus, nem kézzel írt mezőlista. Ha a hook egy új vezérlővel
   bővül, ez magától követi; egy kézzel másolt alak viszont némán elcsúszna tőle,
   és a rács egy sosem érkező propot várna (l. CLAUDE.md, "kézzel szinkronizált
   másolat").

   A behelyettesített `SortableCard` itt tetszőleges: a vezérlők EGYIKE SEM függ a
   kártya konkrét típusától — a húzás azonosítókkal dolgozik. Egyedül a `cards`
   függ tőle, azt pedig épp kihagyjuk, ahogy a betöltés-jelzőt is (mindkettőt
   külön propként kapja a nézet). */
export type CardGridControls =
    Omit<ReturnType<typeof useSortableCards<SortableCard>>, "cards" | "isLoading" | "loadFailed" | "reload">;
