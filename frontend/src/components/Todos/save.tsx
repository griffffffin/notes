import {useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent} from "react";
import {useBlocker, useLocation, useNavigate, useParams} from "react-router-dom";
import Spinner from "../spinner";
import NoFocusInput from "../Input/noFocusInput";
import Order from "./order";
import DragAndDrop from "./DragAndDrop/dragAndDrop";
import MoreTask from "./moreTask";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import NoFocusButton from "../Button/noFocusButton";
import Category from "./category";
import SubmitButton from "../Button/submitButton";
import DeleteAndModal from "./deleteAndModal";
import ColorButtonGroup from "../Button/colorButtonGroup";
import {useTheme} from "../../contexts/theme-context";
import {useAuth} from "../../contexts/auth-context";
import {logRequestError} from "../../log";
import {responseStatus} from "../../httpError";
import {ENDPOINTS} from "../../endpoints";
import {fieldAnchor, type FieldAnchor} from "../Editor/fieldAnchor";
import ValidationTooltip from "../Editor/validationTooltip";
import {useEscapeSubmit} from "../Editor/useEscapeSubmit";
import {useIdleTimer} from "../Editor/useIdleTimer";
import {isTodoColor} from "../../todoColors";
import {todoSchema, lastOrderSchema, tasksSchema} from "../../types/api";
import type {TodoDraft, SetTask, SetTaskOrder} from "./todoDraft";
import {PATHS} from "../../paths";
import {parseResponse} from "../../contractFault";
import LoadFailedNotice from "../loadFailedNotice";
import * as v from "valibot";
import {clearDraft, draftKey, readDraft, saveDraft} from "../../drafts";
import {saveWithRetry} from "../../saveRetry";
import {registerPendingSave} from "../../pendingSave";

/* A Mentés gomb azonosítója. Konstans, mert két helyen kell (a gombon és a bukás
   utáni fókuszálásnál) — pontosan úgy, ahogy a törlés-modal DELETE_BUTTON_ID-je.
   A szín-osztály itt sem volna alkalmas horgonynak: ugyanazt a színt viselheti a
   Törlés gomb is, ha a szerkesztett to-do színe épp piros. */
const SAVE_BUTTON_ID = "todoSaveButton";

/* A szerkesztő és a szerver közti ÖSSZEHASONLÍTHATÓ pillanatkép: az a hat mező,
   amit a "változott-e?" ellenőrzés néz. A `loadedTodo` ref ezt tárolja (a szerver
   adta állapot), és a currentData() is ebbe az alakba gyűjti a jelenlegi mezőket. */
const snapshotSchema = v.object({
    /* A négy egyszerű mező a SZERVER SÉMÁJÁBÓL származik (`v.pick`), nem kézi
       másolatból: egy szín-lista bővítés vagy mező-átnevezés így egy helyen
       történik. A `tasks`/`taskOrder` itt KÖTELEZŐ (a szerkesztő mindig kitölti,
       akár üresen), míg a szerver válaszában opcionális. */
    ...v.pick(todoSchema, ["title", "category", "color", "order"]).entries,
    tasks: tasksSchema,
    taskOrder: v.array(v.number()),
});
type TodoSnapshot = v.InferOutput<typeof snapshotSchema>;

/* A MENTENDŐ adat: a pillanatkép + update-nél a szerkesztett elem id-je. A három
   mentési útvonal (blocker, leváláskori mentés, autosave) ezt küldi. */
type TodoPayload = TodoSnapshot & {id?: string};

/* A PISZKOZAT ugyanaz, mint a pillanatkép — ezért UGYANAZ a séma áll mögötte,
   nem egy második leírás. A piszkozat a böngésző tárolójából jön VISSZA, tehát
   kívülről érkező érték: sémával olvassuk, nem hittel (l. drafts.ts). A típus is
   innen származik, így a kettő nem tud elcsúszni egymástól. */
const draftSchema = snapshotSchema;
type StoredDraft = TodoSnapshot;

/* A propokat a routes.tsx TodosSaveRoute wrapperje adja (a categoriest + a két
   handlert az App-tól). A `handleLinkClicked`/`handleCategoryChange` paraméter
   nélküli (l. app.tsx). */
type SaveProps = {
    isUpdate: boolean;
    handleLinkClicked: () => void;
    handleCategoryChange: () => void;
    categories: string[];
    /* JELENTÉS FELFELÉ, hogy fut-e mentés — a navbar ebből tudja, hogy a linkjei
       most nem visznek sehova (l. RoutesProps). Külön prop, nem a belső state:
       a szerkesztő állapotát az App tárolja, mert a navbar is olvassa. */
    setIsSaving: (isSaving: boolean) => void;
};

/* Változatlan-e az űrlap ahhoz képest, amit a szerver adott? */
const isUnchanged = (current: TodoSnapshot, loaded: TodoSnapshot) =>
    current.title === loaded.title &&
    current.category === loaded.category &&
    current.color === loaded.color &&
    current.order === loaded.order &&
    JSON.stringify(current.taskOrder) === JSON.stringify(loaded.taskOrder) &&
    JSON.stringify(current.tasks) === JSON.stringify(loaded.tasks);

export default function Save(props: SaveProps) {
    /* A to-do SAJÁT színe (a felhasználó választja kártyánként) — nem a témáé.
       A téma csak a KEZDŐÉRTÉKET adja, ezért useState-kezdőérték, nem effekt:
       effektként minden témaváltáskor újra lefutott, és szerkesztés közben
       felülírta a to-do mentett színét a téma alapértékére. */
    const theme = useTheme();
    const [isLoading, setIsLoading] = useState(true);
    const [color, setColor] = useState(theme.todoDefaultColor);
    const [isColorAngleClicked, setIsColorAngleClicked] = useState(false);
    const [title, setTitle] = useState("");
    const [isTitleValid, setIsTitleValid] = useState(false);
    const [order, setOrder] = useState(1);
    const [todo, setTodo] = useState<TodoDraft>({
        tasks: {},
        columns: {"createColumn": {id: "createColumn", taskOrder: []}},
        columnOrder: ["createColumn"]
    });
    const [category, setCategory] = useState("");
    const [isCategoryValid, setIsCategoryValid] = useState(false);
    const [isDisabled, setIsDisabled] = useState(true);
    const {id} = useParams();
    const location = useLocation();
    const [lastOrder, setLastOrder] = useState<number | null>(null);
    /* A BETÖLTÉS ELBUKOTT-e. A karika eltűnése a `lastOrder` megérkezéséhez van
       kötve, tehát a lekérés bukása után magától SOSEM tűnne el — a felület
       örökké várakozna valamire, ami nem jön (a /create ágon ez az EGYETLEN
       kérés, ott tehát az egész szerkesztő használhatatlan maradna). */
    const [loadFailed, setLoadFailed] = useState(false);
    /* ÚJRAPRÓBÁLKOZÁS-SZÁMLÁLÓ: a betöltő effekt függőségei közt áll, tehát a
       léptetése újrafuttatja a lekéréseket — oldalfrissítés nélkül, ami a
       szerkesztőben már beírt szöveget is elvinné. */
    const [retryCount, setRetryCount] = useState(0);
    const [isCategoryAngleClicked, setIsCategoryAngleClicked] = useState(false);
    const navigate = useNavigate();
    const {handleAxios, token} = useAuth();
    const formRef = useRef<HTMLFormElement>(null);
    /* A kötelező mezők SAJÁT hibabuborékja a natív böngésző-buborék helyett (azt
       nem lehet stílusozni). null = nincs hiba; egyébként a fieldAnchor visszatérése:
       a hibás mező CSS-szelektora (a tooltip horgonya) és a NEVE (a placeholderből, kis
       kezdőbetűvel). A névből áll össze az "A/Az <név> kitöltése kötelező." szöveg,
       így egy új mező (pl. idézet) esetén a felirat magától helyes lesz. */
    const [validation, setValidation] = useState<FieldAnchor | null>(null);

    /* isUpdate és url NEM state: a propból egyértelműen adódnak, tehát minden
       renderben kiszámolhatók. Korábban useEffect másolta őket state-be — így
       egy renderrel LEMARADTAK a prop mögött, és a /update → /create váltáskor
       a még "true" isUpdate-tel futott le a lenti lekérdezés a már üres
       navigációs state-en (TypeError: reading 'id' of null). */
    const isUpdate = Boolean(props.isUpdate);
    const url = isUpdate ? ENDPOINTS.todoUpdate : ENDPOINTS.todoCreate;

    /* Melyik to-do-t szerkesztjük. Az azonosító az URL /update/:id szegmenséből
       jön, így F5 és közvetlen link után is megvan (szemben a régi navigációs
       state-tel, ami csak linken át érkezett). A route-ban a :id kötelező, tehát
       update-nél mindig megvan; a csupasz /update-et a "*"-ág fogja el (a listára
       irányítja), ide már nem jut el. Create-nél nincs szerkesztett elem: null. */
    const todoId = isUpdate ? id : null;

    /* A PISZKOZAT kulcsa a szerkesztett ELEMHEZ tartozik (create-nél a szekció
       közös "create" piszkozatához) — l. drafts.ts. */
    const draftStorageKey = draftKey("to-dos", todoId ?? null);
    /* EGYSZER olvassuk ki, a legelső renderben (lusta kezdőérték). A típus
       kimondva, mert a kezdőérték `null` is lehet. */
    const [draft, setDraft] = useState<{payload: StoredDraft; base: StoredDraft | null; savedAt: Date;
        itemId: string | null} | null>(
        () => readDraft(draftStorageKey, draftSchema));
    /* A piszkozat legfrissebb értéke REFBEN is (l. Quotes/save.tsx azonos pontját):
       a betöltő effekt zárványa különben a mountkori állapotot látná. */
    const draftRef = useRef(draft);
    draftRef.current = draft;

    /* A MENTENDŐ ELEM AZONOSÍTÓJA — mostantól MINDKÉT módban az URL-ből.

       A módosításnál ez mindig így volt. A létrehozásnál azért került oda, mert a
       létrehozás idempotenciája ezen az azonosítón áll (l.
       backend/src/controllers/createOnce.js): amíg az azonosító csak a lap
       memóriájában élt, egy F5 újat gyártott volna, és a visszatöltött szöveg
       mentése ÚJ elemként ment volna át. Az útvonalban viszont túléli az
       újratöltést, a megosztott linket és a másik fülön megnyitást is.

       Az azonosítót a létrehozás BELÉPŐ útvonala adja (components/routes.tsx):
       vagy egy függő piszkozatból veszi át, vagy frisset gyárt. */
    const savedItemId = id ?? null;

    /* A szerverről betöltött állapot — a beküldéskor ehhez mérjük, változott-e
       bármi. Ref és nem state: senki nem jeleníti meg, és a változása nem
       járhat újrarajzolással. */
    const loadedTodo = useRef<TodoSnapshot | null>(null);
    /* Igaz, ha a mentés MÁR elintézte a távozást (a blocker mentés+proceed ága, vagy a
       Törlés) — ilyenkor a leváláskori (unmount) mentés NEM fut le újra (create-nél
       nehogy duplán hozzon létre). A blocker shouldBlock-ja is ezt nézi: ha igaz, nem
       blokkol (a törlés-navigáció és a már-elintézett proceed szabadon átmehet). */
    const leftViaForm = useRef(false);
    /* FUT-E ÉPP MENTÉS. Két példányban, mert két különböző fogyasztója van:
       a `savingRef` a shouldBlock-é (az stabil, üres deps-ű függvény, tehát csak
       refből tud friss értéket olvasni), az `isSaving` state pedig a gomb feliratáé
       és tiltásáé (ahhoz újrarajzolás kell). A kettőt a markSaving tartja együtt.

       MIÉRT KÜLÖN A leftViaForm-TÓL? Korábban egyetlen jelző jelentette azt is,
       hogy "most mentek", és azt is, hogy "a mentés kész, megyek" — a shouldBlock
       pedig ezt nézte. Emiatt a mentés TELJES ideje alatt bárki navigációja
       átment (logó, "+", Vissza, Escape): a szerkesztő eltűnt, a mentés utána
       bukott el, és a beírt szöveg nyomtalanul elveszett (mérve, 2026-08-20).
       Innentől: mentés alatt BLOKKOLUNK, és csak a befejezett mentés enged tovább. */
    const savingRef = useRef(false);
    const [isSaving, setIsSaving] = useState(false);
    /* A FUTÓ MENTÉS ÍGÉRETE — hogy a KIJELENTKEZÉS MEGVÁRHASSA.

       A pendingSave.ts szabálya: "előbb a mentés, aztán a kilépés". A leváláskori
       mentés ezt eddig úgy teljesítette, hogy ő MAGA indított egy mentést és azt
       adta vissza. Csakhogy a hasSilentWork() mostantól hamisat ad, amíg fut egy
       mentés (különben mellé indítana egy másodikat, l. ott) — így a kijelentkezés
       ÜRES ígéretet kapott volna, és a token törlése megelőzhette volna a választ.
       A megoldás nem az őr gyengítése: itt a MÁR FUTÓ mentés ígéretét adjuk oda. */
    const inFlightRef = useRef<Promise<void> | null>(null);

    /* A MENTÉS ELBUKOTT — csak a fókusz-visszajelzéshez kell (l. lentebb az
       effektet). Új mentés indulásakor visszaáll, hogy a KÖVETKEZŐ bukás is
       lefuttassa az effektet. */
    const [saveFailed, setSaveFailed] = useState(false);
    const setIsSavingUp = props.setIsSaving;
    const markSaving = useCallback((value: boolean) => {
        savingRef.current = value;
        setIsSaving(value);
        setIsSavingUp(value);
        if (value) setSaveFailed(false);
        else inFlightRef.current = null;
    }, [setIsSavingUp]);
    /* A FELFELÉ JELENTETT ÁLLAPOTOT LEVÁLÁSKOR VISSZA KELL VONNI. Az App state-je
       túléli ezt a komponenst: ha a szerkesztő mentés KÖZBEN tűnik el (tipikusan
       kijelentkezéskor), a jelző igazon ragadna, és a navbar linkjei örökre a
       "nem visz sehova" egérmutatót viselnék — némán, egészen az oldal
       újratöltéséig. Üres deps: ez CSAK unmountkor fut. */
    useEffect(() => () => setIsSavingUp(false), [setIsSavingUp]);
    /* A leváláskor futtatandó mentés legfrissebb változata — minden renderben frissül,
       hogy az unmount az aktuális állapotot mentse (l. lentebb). */
    /* A típus KIMONDVA: a kezdőérték egy üres függvény volna, amiből a fordító
       `() => void`-ot következtetne — a mentés viszont PROMISE-t ad vissza, hogy a
       kijelentkezés megvárhassa (l. pendingSave.ts). */
    const saveOnLeaveRef = useRef<() => Promise<void>>(() => Promise.resolve());
    /* A "van-e mentenivaló?" (dirty) legfrissebb értéke — a useBlocker shouldBlock-ja
       ref-ből olvassa, hogy stabil (üres deps) függvény lehessen, mégis a friss
       állapotot lássa. */
    const isDirtyRef = useRef(false);
    /* Egy blokkolt navigációt EGYSZER dolgozunk fel — a StrictMode (dev) kétszer
       futtatja az effekteket, enélkül a mentés duplázódna. */
    const handledBlockRef = useRef(false);

    /* A szerkesztőből kilépés célja. Update esetén VISSZA oda, ahonnan indult
       (a listáról, akár szűrt nézetből) — a böngésző-előzményen keresztül, hogy
       a szűrő ne vesszen el. Ha nincs app-on belüli előzmény (F5 vagy közvetlen
       link: a location kulcsa "default"), vagy ha új to-do-t hoztunk létre, a
       to-do listára megyünk. A navigációt a blocker kapja el, ha van mentenivaló. */
    const leaveEditor = useCallback(() => {
        if (isUpdate && location.key !== "default") void navigate(-1);
        else void navigate(PATHS.todos);
    }, [isUpdate, location.key, navigate]);

    /* A színválasztó gomb `value`-ja DOM-szinten sima string; az isTodoColor VALÓDI
       futásidejű őr (nem `as`) szűkíti TodoColorra, mielőtt beállítjuk. A gombokat
       a paletta rendereli, tehát az érték mindig érvényes — az őr a típust teszi
       őszintévé (l. todoColors.ts). A currentTarget (nem target) a kezelőt viselő
       gomb; a MouseEvent targetje csak EventTarget, azon nincs value. */
    const handleColorChange = useCallback((event: MouseEvent<HTMLButtonElement>) => {
        setIsColorAngleClicked(false);
        const value = event.currentTarget.value;
        if (isTodoColor(value)) setColor(value);
    }, []);

    const handleTitleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        setTitle(event.target.value);
        setIsTitleValid(event.target.value.length > 0);
    }, []);

    /* Versenyhelyzet-őr: az effekt a todoId változásakor újrafut (pl. /update/:id1 →
       /update/:id2 ugyanazon a szerkesztő-példányon, a route key="update"), és két
       párhuzamos válasz fordított sorrendben is visszaérhet — a RÉGI id válasza
       felülírhatná a frisset (a state-eket ÉS a loadedTodo pillanatképet is). Az
       `active` zászló a leszereléskor és minden újrafutáskor hamisra vált, így a
       lejárt kérés callbackje már nem ír semmit. Minta: CardList/useSortableCards.ts. */
    useEffect(() => {
        let active = true;
        if (todoId) {
            handleAxios(ENDPOINTS.todoById, {id: todoId}, (response) => {
                if (!active) return;
                /* Az ELLENŐRZÉS AZ ELSŐ, minden state-írás ELŐTT: ha a válasz nem
                   to-do alakú, a v.parse dob, és a hibaágon a szerkesztő kilép a
                   listára. Fordított sorrendben (előbb írni, aztán ellenőrizni) a
                   szerkesztő félig kitöltött, felemás állapotban maradna. */
                const loaded = parseResponse(todoSchema, response.data, ENDPOINTS.todoById);
                // Pillanatkép arról, AMIT a szerver adott — a beküldéskor ehhez
                // hasonlítunk, hogy egy változatlan űrlap ne írjon feleslegesen.
                loadedTodo.current = {
                    title: loaded.title,
                    category: loaded.category,
                    color: loaded.color,
                    order: loaded.order,
                    tasks: loaded.tasks ?? {},
                    taskOrder: loaded.taskOrder ?? [],
                };
                setColor(loaded.color);
                setTitle(loaded.title);
                setIsTitleValid(true);
                setOrder(loaded.order);
                setTodo({
                    tasks: loaded.tasks ? loaded.tasks : {},
                    // A taskOrder a Todo-n OPCIONÁLIS: hiányában üres tömb (a fenti
                    // pillanatkép is így őrzi) — enélkül a draft taskOrder-je undefined
                    // lenne, amin a húzható lista végigmenne.
                    columns: {"createColumn": {id: "createColumn", taskOrder: loaded.taskOrder ?? []}},
                    columnOrder: ["createColumn"]
                });
                setCategory(loaded.category);
                setIsCategoryValid(true);
                setIsDisabled(false);

                /* A PISZKOZAT MAGÁTÓL VISSZAÁLL, ha nincs mivel ütköznie — a
                   feltétel és az indoklás a Quotes/save.tsx azonos pontján. Az
                   összevetés az `isUnchanged`, ugyanaz, amivel a "változott-e az
                   űrlap" kérdést is eldöntjük. */
                if (loadedTodo.current) decideDraftRef.current(loadedTodo.current);
            }, (error) => {
                if (!active) return;
                logRequestError(error);
                /* A SZERVER VÁLASZA DÖNT, nem a hiba puszta ténye — ugyanaz a
                   szabály, mint a publikus idézetnél (Quotes/public.tsx).

                   403: az elem nem érhető el nekünk. A backend ezt adja a nem
                   létezőre ÉS az idegenre is (ownership.js, szándékosan
                   megkülönböztethetetlenül), a szerkesztőt viszont csak a SAJÁT
                   elemünkre lehet megnyitni — a gyakorlatban tehát az elem
                   időközben megszűnt (pl. másik eszközön törölted). Ilyenkor a
                   listára megyünk: nincs mit betölteni, és az újrapróbálás is
                   ugyanezt a 403-at kapná.

                   MINDEN MÁS: nem tudjuk, hogy az elem eltűnt-e, tehát nem is
                   állítunk róla semmit. Státusz nélkül (időtúllépés, megszakadt
                   kapcsolat, séma-bukás) el sem jutottunk a szerverig; 500-nál
                   (serverError.js) a szerver akadt meg, nem az elem szűnt meg.
                   A kinavigálás ilyenkor AZT ÁLLÍTANÁ, hogy az elem odalett —
                   holott csak egy wifi-váltás vagy egy épp újrainduló szerver
                   jött közbe, és a felhasználó a szerkesztőjét veszíti el egy
                   múló zökkenőért. Maradunk, és felkínáljuk az újrapróbálást.

                   A betöltő ettől sem pörög örökké (ez volt a navigáció eredeti
                   indoka): a `loadFailed` a spinner ELŐTT térít el a renderben,
                   tehát a karika helyett a jelzés látszik. */
                if (responseStatus(error) === 403) leaveEditor();
                else setLoadFailed(true);
            });
        }
        // CREATE: nincs betöltendő elem, tehát a piszkozatnak nincs mivel ütköznie.
        if (!todoId) decideDraftRef.current(null);
        handleAxios(ENDPOINTS.todoLastOrder, {},
            (response) => {
                if (!active) return;
                const lastOrder = parseResponse(lastOrderSchema, response.data, ENDPOINTS.todoLastOrder);
                setLastOrder(lastOrder === 0 ? 0 : (isUpdate ? lastOrder - 1 : lastOrder));
            },
            (error) => {
                if (!active) return;
                logRequestError(error);
                /* NEM navigálunk el (mint a to-do betöltésének hibaágán): itt a
                   felhasználó lehet, hogy már gépel is. A karika helyett
                   kimondjuk, mi történt — a szöveg a helyén marad. */
                setLoadFailed(true);
            });
        return () => { active = false; };
    }, [isUpdate, todoId, handleAxios, leaveEditor, retryCount, draftStorageKey]);

    const setTask = useCallback<SetTask>((key, content, isDone) => {
        return {
            ...todo, tasks: {
                ...todo.tasks,
                [key]: {id: key.toString(), content: content, done: isDone}
            }
        }
    }, [todo]);

    const setTaskOrder = useCallback<SetTaskOrder>((taskOrder) => {
        return {
            ...todo, columns: {
                ...todo.columns,
                "createColumn": {id: "createColumn", taskOrder: taskOrder}
            }
        }
    }, [todo]);

    const handleCategoryAngleClick = useCallback(() => setIsCategoryAngleClicked(!isCategoryAngleClicked),
        [isCategoryAngleClicked]);

    useEffect(() => setIsDisabled(!(isTitleValid && isCategoryValid)), [isTitleValid, isCategoryValid]);

    /* A hibabuborék eltűnik, amint az ÉPP JELZETT mező kitöltötté válik — nem kell
       kézzel bezárni, a kitöltés maga oldja fel. */
    useEffect(() => {
        if (validation?.anchor === "#createColumn" && isTitleValid) setValidation(null);
        else if (validation?.anchor?.includes("Kategória") && isCategoryValid) setValidation(null);
    }, [validation, isTitleValid, isCategoryValid]);

    /* …és a buborékon KÍVÜLI kattintásra is: aki nem gépel tovább, csak félretenné
       a hibajelzést, ne ragadjon a képernyőn. Stabil (üres deps), mert a tooltip
       ebből köti a dokumentum-szintű figyelőjét. */
    const dismissValidation = useCallback(() => setValidation(null), []);

    const handleColorAngleClick = useCallback(() => setIsColorAngleClicked(!isColorAngleClicked),
        [isColorAngleClicked]);

    /* A piszkozat mezőinek beírása a szerkesztőbe. */
    const applyDraft = (payload: StoredDraft) => {
        setTitle(payload.title);
        setCategory(payload.category);
        /* A KÖTELEZŐ MEZŐK ÉRVÉNYESSÉGÉT IS BE KELL ÁLLÍTANI, különben a
           visszatöltött piszkozatot NEM LEHET MENTENI.

           A jelzőket amúgy a felhasználó gépelése (handleTitleChange, Category
           setIsValid) és update-nél a szerver-betöltés állítja igazra. Create-nél
           viszont nincs betöltés, a piszkozat pedig PROGRAMBÓL tölti ki a mezőket
           — a jelzők hamisak maradtak, és a Mentés gomb a kitöltött mezők fölé írt
           "kitöltése kötelező" buborékot. A hiba a mentés-idempotencia tesztjeinek
           írása közben bukott ki, 2026-08-21.

           A SZABÁLYOK a mezők saját szabályai (cím: nem üres; kategória:
           Todos/category.tsx `value.length > 0`) — itt megismételve, mert a
           programból töltött mezőnek nincs eseménye, ami elsütné őket. */
        setIsTitleValid(payload.title.length > 0);
        setIsCategoryValid(payload.category.length > 0);
        setColor(payload.color);
        setOrder(payload.order);
        setTodo((current) => ({
            ...current,
            tasks: payload.tasks,
            columns: {createColumn: {...current.columns["createColumn"], taskOrder: payload.taskOrder}},
        }));
    };

    /* MI LEGYEN A PISZKOZATTAL a betöltés után — a szabály és az indoklás a
       Quotes/save.tsx `decideDraft`-jánál: változatlan szerver → visszaáll,
       megváltozott szerver → a FRISSEBB (szerver-oldali) változat nyer, a
       piszkozatot eldobjuk. */
    const decideDraft = (fromServer: TodoSnapshot | null) => {
        const pending = draftRef.current;
        if (!pending) return;
        /* HÁROM ESET, és mindet a TARTALOM dönti el:

           1. a szerver ugyanaz, mint a betöltéskori állapot (`base`) → azóta
              senki nem mentett, a piszkozat az egyetlen újabb változat → VISSZA;
           2. a szerver MÁR A PISZKOZAT TARTALMÁT mutatja → a mi mentésünk
              valójában átment (a válasz veszett el útközben, ezért hittük
              bukásnak). Külön ág NEM kell hozzá: a visszaállítás úgyis ugyanazt
              a szöveget írná be, ami már ott van — a piszkozat egyszerűen
              okafogyott, és törlődik;
           3. a szerver mást mutat, mint bármelyik → egy MÁSIK eszközön mentettek
              → a frissebb, mentett változat marad, a piszkozat elvész.

           A 2. és a 3. eset viselkedése tehát azonos (törlés), de az OKUK más —
           és a 2. nem adatvesztés: a tartalom a szerveren van. */
        const restore = fromServer === null
            || (pending.base !== null && isUnchanged(pending.base, fromServer));
        if (restore) applyDraft(pending.payload);
        clearDraft(draftStorageKey);
        setDraft(null);
    };

    /* A döntés REFEN át hívódik a betöltő effektből: a függvény minden renderben
       újra elkészül, tehát függőségként a lekérést is minden renderben
       újraindítaná. A ref mindig a legfrissebb változatra mutat. */
    const decideDraftRef = useRef(decideDraft);
    decideDraftRef.current = decideDraft;

    /* Az AKTUÁLIS űrlap adata egy objektumban — a mentés és a "változott-e"
       ellenőrzés is ezt használja. A user-azonosítót NEM küldjük: a szerver a
       tokenből veszi (a régi app itt hitt a kliensnek — ez volt a fő gyengesége). */
    const currentData = (): TodoPayload => ({
        title: title,
        tasks: todo.tasks,
        taskOrder: todo.columns["createColumn"].taskOrder,
        category: category,
        color: color,
        order: order,
    });

    /* Van-e mentenivaló? ÉRINTETLEN űrlapot nem mentünk. Create-nél ez az üres
       űrlap (se cím, se kategória, se listaelem); update-nél a betöltöttel egyező
       tartalom (a mentés updatedAt-et is írna, tehát egy üres "Mentés" hazudná, hogy
       hozzányúltunk). Ha még nincs betöltve (loadedTodo null), szintén pristine —
       nincs mit menteni, és a betöltés-hiba leaveEditor()-ja se akadjon a blockerbe. */
    const isPristine = () => isUpdate
        ? (loadedTodo.current == null || isUnchanged(currentData(), loadedTodo.current))
        : (!title.trim() && !category.trim() && Object.keys(todo.tasks ?? {}).length === 0);
    isDirtyRef.current = !isPristine();

    /* Van-e CSENDBEN mentendő munka? A két néma mentési útvonal (leváláskori mentés
       kijelentkezéskor, illetve a tétlenségi autosave) UGYANEZT a három feltételt
       nézi: a mentés/törlés még nem intézte el a távozást, a kötelező mezők megvannak,
       és tényleg változott valami.

       A blocker SZÁNDÉKOSAN nem ezt használja: ott a hiányzó kötelező mező nem "nincs
       mit menteni", hanem HIBA — hibabuborékot kap és a szerkesztőben maradunk. Itt
       nincs kinek visszajelezni, ezért a hiányos munkát csendben eldobjuk. (Az
       idézet-szerkesztőben ugyanez a függvény, ugyanezzel a névvel — a harmadik
       szerkesztőnél a két mentési útvonal közös hookba kerül.) */
    /* A `!savingRef.current` KÖTELEZŐ ELEM: enélkül egy kijelentkezés a MÁR FUTÓ
       mentés mellé indítana egy másodikat, ami create-nél két to-dót hozna létre.
       (Korábban ezt a `leftViaForm` fedte, de az most már csak a BEFEJEZETT
       mentést jelöli — l. a savingRef bevezetését.) */
    const hasSilentWork = () =>
        !leftViaForm.current && !savingRef.current && isTitleValid && isCategoryValid && !isPristine();

    /* A useBlocker DATA ROUTERT kér (l. routes.tsx). shouldBlock: akkor blokkoljuk a
       navigációt, ha ÉPP MENTÜNK (savingRef) VAGY van mentenivaló (dirty) — és nem a
       befejezett mentés/törlés maga navigál (leftViaForm). Üres deps-szel stabil, de
       refekből olvas, így friss állapotot lát.

       A `savingRef` ág a lényegi újdonság: amíg a kérés úton van, a logó, a "+", az
       Escape és a böngésző Vissza gombja sem visz ki innen. Enélkül a szerkesztő
       eltűnhetett a mentés alól, és a bukó mentés szövegét nem volt hova visszatenni. */
    const shouldBlock = useCallback(() => !leftViaForm.current && (savingRef.current || isDirtyRef.current), []);
    const blocker = useBlocker(shouldBlock);

    /* A NAVIGÁCIÓ-ELKAPÓ mentés magja: a blocker akkor billen "blocked"-ba, ha van
       mentenivaló ÉS navigálni próbálnak (Mentés, Escape, logó, "+", Vissza gomb,
       szekció-váltás). Ilyenkor: hiányzó kötelező mezőnél (cím/kategória) hibabuborék
       + MARADÁS (reset), NEM enged tovább; érvényesnél MENT, majd a mentés
       BEFEJEZŐDÉSE UTÁN folytatja a blokkolt navigációt (proceed) — így a cél-lista
       friss. A proceed() a felhasználó EREDETI céljára navigál (a logó a listára, a
       "+" a create-re, a Vissza az előző oldalra). */
    useEffect(() => {
        if (blocker.state !== "blocked") { handledBlockRef.current = false; return; }
        if (handledBlockRef.current) return;
        handledBlockRef.current = true;

        // A cím az első, aztán a kategória — a hiányzó mezőnél a saját hibabuborékot
        // mutatjuk (a nem stílusozható natív helyett), és maradunk.
        if (!isTitleValid) { setValidation(fieldAnchor("#createColumn")); blocker.reset(); return; }
        if (!isCategoryValid) {
            setValidation(fieldAnchor("input[placeholder='Kategória']"));
            blocker.reset();
            return;
        }
        setValidation(null);

        // Innentől mentünk; a mentés sikeréig NEM navigálunk. Az adatot itt INLINE
        // építjük (nem a currentData() helperrel), hogy az effekt függőségei — amiket
        // amúgy is figyel (title, todo, category…) — pontosan lefedjék a felhasznált
        // értékeket (exhaustive-deps).
        markSaving(true);
        /* A PILLANATKÉP és a KÉRÉS TÖRZSE külön: a piszkozatba a pillanatkép megy
           (azonosító nélkül, mert a piszkozat séma szerint az elem TARTALMA), a
           szerverre az azonosítóval kiegészített törzs. Külön néven, nem utólagos
           mezőhozzáadással: a bukás-ág visszahívása később fut, és egy közben
           módosított objektumon már a kiegészített alakot látná. */
        const snapshot: TodoSnapshot = {
            title: title,
            tasks: todo.tasks,
            taskOrder: todo.columns["createColumn"].taskOrder,
            category: category,
            color: color,
            order: order,
        };
        /* AZ AZONOSÍTÓ MINDIG MEGY — create-nél is: a szerver ebből ismeri fel a
           megismételt létrehozást (createOnce.js), és a végpont meg is követeli. */
        const data: TodoPayload = {...snapshot, ...(savedItemId ? {id: savedItemId} : {})};
        /* A BUKÁS ÁGA. Maradunk a szerkesztőben (reset), és HÁROM dolgot teszünk:
           (1) a mentés-állapotot lezárjuk, tehát a gomb felirata "Mentés…"-ről
               visszaáll "Mentés"-re — ez maga a visszajelzés, hogy gikszer volt;
           (2) PISZKOZATOT írunk. Enélkül, ha a szerkesztő ezután mégis eltűnik
               (kijelentkezés, lap-bezárás), a beírt szöveg sehol nem maradna meg;
           (3) jelezzük a bukást, amire a fókusz a Mentés gombra ugrik (l. az
               effektet) — a NAVIGÁCIÓVAL indított mentésnél (logó, "+", Vissza)
               ez az egyetlen jel, ami a felhasználó szeme elé kerül. */
        const failSave = (error: unknown) => {
            markSaving(false);
            setSaveFailed(true);
            logRequestError(error);
            saveDraft(draftStorageKey, snapshot, loadedTodo.current ?? undefined, savedItemId ?? undefined);
            blocker.reset();
        };
        /* A FUTÓ MENTÉS ÍGÉRETE (l. inFlightRef): a `settled` a promise saját
           resolve-ja, amit a Promise-konstruktor SZINKRON futó törzse állít be —
           mire a kérés elindul, már megvan. Így a kijelentkezés meg tudja várni
           ezt a mentést anélkül, hogy egy másodikat indítanánk mellé. */
        let settled: () => void = () => undefined;
        inFlightRef.current = new Promise<void>((resolve) => { settled = resolve; });
        handleAxios(url, data, (response) => {
            settled();
            if (response.status !== 200) return failSave(new Error("HTTP " + response.status));
            // A tartalom a szerveren van: a helyi másolat okafogyott.
            clearDraft(draftStorageKey);
            props.handleLinkClicked();
            props.handleCategoryChange();
            /* A SORREND KÖTÖTT: előbb a mentés-állapot lezárása és a "megyünk"
               jelző, csak azután a proceed(). Fordítva a shouldBlock még mentésben
               hinné magát, és a saját folytatásunkat blokkolná. */
            markSaving(false);
            leftViaForm.current = true;
            blocker.proceed();
        }, (error) => { settled(); failSave(error); });
    }, [blocker, isTitleValid, isCategoryValid, title, category, color, order, todo,
        isUpdate, todoId, url, handleAxios, props, draftStorageKey, markSaving, savedItemId]);

    /* A BUKÁS UTÁN A MENTÉS GOMBRA KERÜL A FÓKUSZ — ugyanaz a fogás, amit a
       törlés-modal használ a hibája után (Todos/modal.tsx).

       Miért kell egyáltalán? A mentést nem csak a Mentés gomb indítja: a logó, a
       "+", az Escape és a böngésző Vissza gombja is (a blockeren át). Ilyenkor a
       felhasználó nem a gombot nézi, tehát a "Mentés…" → "Mentés" visszaváltás
       elkerülné a figyelmét, és annyit látna, hogy a logó nem csinál semmit. A
       fókuszgyűrű odaviszi a szemet, billentyűzetről ingyen jár, a képernyőolvasó
       pedig ki is mondja a gombot — és mindezt ÚJ elem nélkül, elrendezés-tolás
       nélkül (a user kifejezett kérése volt, hogy ne ugorjon fel semmi).

       KÜLÖN EFFEKT, nem a bukás-ágban hívott focus(): a gomb a mentés alatt
       `disabled`, arra pedig nem lehet fókuszt tenni. Az effekt a bukást követő
       ÚJRARAJZOLÁS után fut, amikor a gomb már újra él. */
    useEffect(() => {
        if (!saveFailed) return;
        const button = formRef.current?.querySelector("#" + SAVE_BUTTON_ID);
        if (button instanceof HTMLElement) button.focus();
    }, [saveFailed]);

    /* A Mentés gomb (és az Escape) már csak NAVIGÁL — az ellenőrzést+mentést a
       fenti blocker intézi, ha van mentenivaló. Érintetlen űrlapnál a blocker nem
       blokkol, tehát egyszerűen visszalépünk. */
    const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        leaveEditor();
    }, [leaveEditor]);

    /* A LEVÁLÁSKORI (unmount) mentés — a KIJELENTKEZÉSre, ami NEM router-navigáció
       (a removeCookie React-újrarendert vált ki), ezért a blocker nem látja. Ilyenkor
       CSENDES mentés történik: navigáció és visszajelzés nélkül, mert nincs hova
       "maradni" és nincs kinek szólni. A closure-t minden renderben frissítjük, hogy
       az unmount a LEGFRISSEBB állapotot mentse — és hogy a legutóbbi render (még
       érvényes) `token`-jét zárványolja: a kijelentkezés a hívás pillanatára már
       törli az ÉLŐ tokent, ezért azt EXPLICIT átadjuk a handleAxios-nak, különben a
       mentés token nélkül, 401-gyel elveszne. */
    saveOnLeaveRef.current = () => {
        /* MÁR FUT EGY MENTÉS: nem indítunk másikat, hanem MEGVÁRATJUK vele a
           kijelentkezést. (A pendingSave felső korlátja 3 másodperc, tehát ez nem
           tud beragadni.) */
        if (savingRef.current && inFlightRef.current) return inFlightRef.current;
        if (!hasSilentWork()) return Promise.resolve();
        // L. a Quotes/save.tsx azonos pontját: a kijelentkezés megvárja ezt a mentést.
        leftViaForm.current = true;
        const data: TodoPayload = {...currentData(), ...(savedItemId ? {id: savedItemId} : {})};
        // A zárványolt `token` (nem az élő tokenRef): kijelentkezéskor az élő már null.
        /* A LEVÁLÁSKORI MENTÉS a legkockázatosabb út: a képernyő épp megszűnik,
           tehát ha ez elbukik (lejárt token, alvó szerver, megszakadt hálózat),
           NINCS kinek szólni — a beírt szöveg nyomtalanul elveszne. Ezért a
           hibaágon PISZKOZATOT írunk a böngésző tárolójába (l. drafts.ts). */
        /* ÚJRAPRÓBÁLÁS a piszkozat ELŐTT (l. saveRetry.ts): a bukások nagy része
           múló (wifi-váltás, épp újrainduló szerver), és arra a helyes válasz még
           egy próba — nem egy felajánlott piszkozat a következő megnyitáskor. */
        return saveWithRetry(
            (onSuccess, onFailure) => handleAxios(url, data, (response) => {
                if (response.status !== 200) return;
                clearDraft(draftStorageKey);
                props.handleCategoryChange();
                onSuccess();
            }, onFailure, token),
            (error) => {
                leftViaForm.current = false;
                logRequestError(error);
                saveDraft(draftStorageKey, currentData(), loadedTodo.current ?? undefined, savedItemId ?? undefined);
            });
    };

    /* A LAP BEZÁRÁSA (fül, böngésző) — itt a MENTÉSRE már nincs idő.

       A böngésző a lap eltűnésekor eldobja a függő kéréseket, és megállítani sem
       tudjuk: az újrapróbálás (saveRetry) második-harmadik köre biztosan nem fut
       le. Ezért itt NEM mentést indítunk, hanem AZONNAL kiírjuk a piszkozatot —
       az localStorage-írás, tehát szinkron, még a bezárás előtt megtörténik.

       Ha közben mégis átment egy mentés, az a piszkozatot úgyis törli; ha nem, a
       szöveg megmarad, és a szerkesztő legközelebbi megnyitásakor magától
       visszaáll (l. drafts.ts). Fölösleges piszkozat így legfeljebb egy marad,
       adat viszont nem vész el. */
    useEffect(() => {
        const keepWork = () => {
            if (!hasSilentWork()) return;
            saveDraft(draftStorageKey, currentData(), loadedTodo.current ?? undefined, savedItemId ?? undefined);
        };
        window.addEventListener("beforeunload", keepWork);
        return () => window.removeEventListener("beforeunload", keepWork);
    });

    // A kijelentkezés MEGVÁRJA ezt a mentést (l. pendingSave.ts).
    useEffect(() => registerPendingSave(() => saveOnLeaveRef.current()), []);

    // A fenti mentés a szerkesztő LEVÁLÁSAKOR (pl. kijelentkezés) fut le, egyszer.
    /* A cleanup NEM adhatja tovább a promise-t: a React a visszatérési értéket
       takarító függvénynek nézné. A `void` kimondja, hogy itt nem várunk rá — a
       leválás pillanatában már úgyis nincs kinek visszajelezni; a kijelentkezés
       ága az, ami MEGVÁRJA (l. pendingSave.ts). */
    useEffect(() => () => { void saveOnLeaveRef.current(); }, []);

    /* Az AUTOSAVE (tétlenség után) — mint a leváláskori mentés, de siker UTÁN a
       listára navigál (kilép a szerkesztőből). Az órát a közös useIdleTimer adja;
       a késleltetés szándékosan kisebb, mint az auth 15 perces kijelentkezése, így
       az otthagyott munka még ÉRVÉNYES tokennel mentődik el.

       A mentés itt az ÉLŐ tokennel megy (10 percnél még érvényes) — a zárványolt
       token csak a leváláskori ágnak kell, ahol a kijelentkezés már törölte. */
    useIdleTimer(() => {
        // Nincs mentenivaló (érintetlen vagy hiányos): NEM navigálunk el — hagyjuk a
        // felhasználót, a 15 perces tétlenségi kijelentkezés majd a szokott módon jön.
        if (!hasSilentWork()) return;
        /* AZ AUTOSAVE UGYANÚGY VISELKEDIK, MINT A KÉZI MENTÉS (a user döntése):
           "Mentés…" felirat, tiltott gombok, és a navigáció blokkolva, amíg a
           kérés úton van. Az, hogy nem ő indította, nem érv a némaság mellett —
           az volna baj, ha közben elveszne a munkája. A markSaving egyszerre
           állítja a shouldBlock refjét és a felirat state-jét. */
        markSaving(true);
        const snapshot = currentData();
        const data: TodoPayload = {...snapshot, ...(savedItemId ? {id: savedItemId} : {})};
        // Az autosave ígérete is a kijelentkezésnek szól (l. inFlightRef).
        let settled: () => void = () => undefined;
        inFlightRef.current = new Promise<void>((resolve) => { settled = resolve; });
        handleAxios(url, data, () => {
            settled();
            clearDraft(draftStorageKey);
            props.handleLinkClicked();
            props.handleCategoryChange();
            /* A SORREND ITT IS KÖTÖTT, és itt a legkönnyebb elrontani: az autosave
               a SAJÁT navigációját is blokkolná, ha előbb nem zárnánk le a
               mentés-állapotot és nem mondanánk ki, hogy a mentés visz el minket.
               A blocker reset()-je azért kell, mert közben a felhasználó
               megpróbálhatott navigálni (a kísérletét elnyeltük) — a függő
               blokkolt állapotot fel kell oldani, mielőtt mi navigálunk. */
            markSaving(false);
            leftViaForm.current = true;
            if (blocker.state === "blocked") blocker.reset();
            void navigate(PATHS.todos);
        }, (error) => {
            settled();
            markSaving(false);
            setSaveFailed(true);
            if (blocker.state === "blocked") blocker.reset();
            logRequestError(error);
            /* Az autosave bukása után a szerkesztő MEGMARAD, tehát a szöveg még a
               képernyőn van — de a 15 perces tétlenségi kijelentkezés már a lejárt
               tokennel érné, ahonnan nincs mentés. A piszkozat ezt a rést fedi le. */
            saveDraft(draftStorageKey, currentData(), loadedTodo.current ?? undefined, savedItemId ?? undefined);
        });
    });

    /* A színre már nem kell várni (a témából indul, nem egy kérés hozza), csak
       a sorszám-korlátra — szerkesztéskor ráadásul a betöltött to-do mezőire. */
    useEffect(() => {
        if (lastOrder === null) return;
        if (isUpdate) {
            if (title && isTitleValid && category && isCategoryValid) setIsLoading(false);
        } else setIsLoading(false);
    }, [isUpdate, lastOrder, title, isTitleValid, category, isCategoryValid]);

    // Escape = mentés + vissza, a "Mentés" gombbal azonos úton (l. useEscapeSubmit).
    useEscapeSubmit(formRef);

    // A betöltő spinner az isLoading-ig; a `lastOrder === null` ág vele EGYÜTT igaz
    // (az isLoading csak a sorszám-korlát beérkezte után lesz false), de kimondva a
    // fordítónak is: innentől a lastOrder number, így az Order `last`-ja nem number|null.
    if (loadFailed) return (
        <LoadFailedNotice message="Hiba az oldal betöltése közben"
                          onRetry={() => { setLoadFailed(false); setRetryCount((count) => count + 1); }}/>
    );
    if (isLoading || lastOrder === null) return <Spinner class="min-vh-75"/>;

    /* A PISZKOZAT VISSZATÖLTÉSE: a mezőket írja felül, a bejegyzést pedig
       eltünteti — a visszatöltött tartalom innentől a szerkesztőben él, és a
       következő mentés viszi a szerverre. A `tasks`/`taskOrder` a szerkesztő
       saját szerkezetébe (TodoDraft columns) kerül vissza, ahonnan a felület
       rajzol. */
    return (
        <form ref={formRef} noValidate onSubmit={handleSubmit}
              className={"col-11 col-sm-10 col-md-8 col-lg-7 col-xl-6 card " +
            "mx-auto mt-3 bg-transparent border-2 border-" + color}>

            <div className="input-group">
                <NoFocusInput id="createColumn" value={title} onChange={handleTitleChange} placeholder="Cím"
                              autoComplete="off" autoFocus={true} required={true} color={color}
                              class="card-header caveat ms-1"/>
                <Order current={order} setOrder={setOrder} last={lastOrder}/>
            </div>

            <div className="card-body py-1">

                <DragAndDrop todo={todo} setTodo={setTodo} setTaskOrder={setTaskOrder} setTask={setTask}
                             color={color}/>

                <MoreTask todo={todo} setTodo={setTodo} setTask={setTask} color={color}/>

                <div className="d-grid">

                    <Category setCategory={setCategory} setIsValid={setIsCategoryValid}
                              setIsAngleClicked={setIsCategoryAngleClicked} category={category} color={color}
                              handleAngleClick={handleCategoryAngleClick} isAngleClicked={isCategoryAngleClicked}
                              categories={props.categories}/>

                    {/* A FELIRAT "Mentés", nem "Tovább". A "Tovább" két különböző dolgot
                        jelentett az appban (belépés és mentés); a szerkesztőben az történik,
                        hogy MENTÜNK, tehát azt is mondjuk. A "Tovább" megmarad ott, ahol
                        igaz: a belépő/regisztrációs űrlapon (Button/submitButtonGroup.tsx).

                        MENTÉS KÖZBEN "Mentés…", és a gomb TILTOTT. A tiltás nem csak
                        kozmetika: enélkül a türelmetlen második kattintás elvitte a
                        felhasználót a szerkesztőből a mentés alól (mérve). A bukás után a
                        felirat visszaáll "Mentés"-re — ez maga a visszajelzés, és a
                        felirat egyben felszólítás is az újrapróbálásra.

                        Az `isDisabled` VAGY-olva, nem lecserélve: az érvénytelen űrlap
                        gombja a mentés lezárultával sem válhat aktívvá. */}
                    <SubmitButton id={SAVE_BUTTON_ID} isDisabled={isDisabled || isSaving} isOutline={false}
                                  color={color} text={isSaving ? "Mentés…" : "Mentés"}/>

                    {isUpdate &&
                        /* A TÖRLÉS IS TILTOTT MENTÉS KÖZBEN: különben egy elemet
                           törölni lehetne, miközben ugyanannak a mentése épp úton van. */
                        <DeleteAndModal handleLinkClicked={props.handleLinkClicked}
                                        setIsColorClicked={setIsColorAngleClicked} color={color} todoId={todoId}
                                        setIsCategoryClicked={setIsCategoryAngleClicked}
                                        handleCategoryChange={props.handleCategoryChange} isDisabled={isSaving}
                                        onDelete={() => { leftViaForm.current = true; }}/>}

                    <NoFocusButton onClick={handleColorAngleClick} class="pb-0" color={color}
                                   text={<FontAwesomeIcon icon={["fas", "paint-roller"]} size="xl"
                                                          className={isColorAngleClicked ?
                                                              "fa-flip-vertical py-1 text-" + color :
                                                              "py-1 text-" + color}/>}/>
                    {isColorAngleClicked && <ColorButtonGroup onClick={handleColorChange}/>}

                </div>
            </div>

            {/* Kötelező-mező hibabuborék (l. Editor/validationTooltip): a kinézet,
                a pozicionálás és a magyar névelő-szabály ott, egy helyen él. */}
            <ValidationTooltip id="validation-tooltip" validation={validation}
                               onDismiss={dismissValidation}/>

        </form>
    );
}
