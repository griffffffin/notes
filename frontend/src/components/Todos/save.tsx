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
import {ENDPOINTS} from "../../endpoints";
import {fieldAnchor, type FieldAnchor} from "../Editor/fieldAnchor";
import ValidationTooltip from "../Editor/validationTooltip";
import {useEscapeSubmit} from "../Editor/useEscapeSubmit";
import {useIdleTimer} from "../Editor/useIdleTimer";
import {isTodoColor, type TodoColor} from "../../todoColors";
import * as v from "valibot";
import {todoSchema, lastOrderSchema} from "../../types/api";
import type {Tasks} from "../../types/api";
import type {TodoDraft, SetTask, SetTaskOrder} from "./todoDraft";
import {PATHS} from "../../paths";

/* A szerkesztő és a szerver közti ÖSSZEHASONLÍTHATÓ pillanatkép: az a hat mező,
   amit a "változott-e?" ellenőrzés néz. A `loadedTodo` ref ezt tárolja (a szerver
   adta állapot), és a currentData() is ebbe az alakba gyűjti a jelenlegi mezőket. */
type TodoSnapshot = {
    title: string;
    category: string;
    color: TodoColor;
    order: number;
    tasks: Tasks;
    taskOrder: number[];
};

/* A MENTENDŐ adat: a pillanatkép + update-nél a szerkesztett elem id-je. A három
   mentési útvonal (blocker, leváláskori mentés, autosave) ezt küldi. */
type TodoPayload = TodoSnapshot & {id?: string};

/* A propokat a routes.tsx TodosSaveRoute wrapperje adja (a categoriest + a két
   handlert az App-tól). A `handleLinkClicked`/`handleCategoryChange` paraméter
   nélküli (l. app.tsx). */
type SaveProps = {
    isUpdate: boolean;
    handleLinkClicked: () => void;
    handleCategoryChange: () => void;
    categories: string[];
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

    /* A szerverről betöltött állapot — a beküldéskor ehhez mérjük, változott-e
       bármi. Ref és nem state: senki nem jeleníti meg, és a változása nem
       járhat újrarajzolással. */
    const loadedTodo = useRef<TodoSnapshot | null>(null);
    /* Igaz, ha a mentés MÁR elintézte a távozást (a blocker mentés+proceed ága, vagy a
       Törlés) — ilyenkor a leváláskori (unmount) mentés NEM fut le újra (create-nél
       nehogy duplán hozzon létre). A blocker shouldBlock-ja is ezt nézi: ha igaz, nem
       blokkol (a törlés-navigáció és a már-elintézett proceed szabadon átmehet). */
    const leftViaForm = useRef(false);
    /* A leváláskor futtatandó mentés legfrissebb változata — minden renderben frissül,
       hogy az unmount az aktuális állapotot mentse (l. lentebb). */
    const saveOnLeaveRef = useRef(() => {});
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
        if (isUpdate && location.key !== "default") navigate(-1);
        else navigate(PATHS.todos);
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
                const loaded = v.parse(todoSchema, response.data);
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
            }, (error) => {
                if (!active) return;
                // A to-do nem tölthető be (pl. timeout vagy törölt elem) — vissza
                // a listához, hogy a szerkesztő betöltője ne pörögjön örökké. A
                // setIsLoading(false) a betöltött adathoz kötött, tehát hiba után
                // magától nem oldódna fel; a read.jsx is navigációval kezeli.
                logRequestError(error);
                leaveEditor();
            });
        }
        handleAxios(ENDPOINTS.todoLastOrder, {},
            (response) => {
                if (!active) return;
                const lastOrder = v.parse(lastOrderSchema, response.data);
                setLastOrder(lastOrder === 0 ? 0 : (isUpdate ? lastOrder - 1 : lastOrder));
            },
            logRequestError);
        return () => { active = false; };
    }, [isUpdate, todoId, handleAxios, leaveEditor]);

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
       tartalom (a mentés updatedAt-et is írna, tehát egy üres "Tovább" hazudná, hogy
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
    const hasSilentWork = () =>
        !leftViaForm.current && isTitleValid && isCategoryValid && !isPristine();

    /* A useBlocker DATA ROUTERT kér (l. routes.tsx). shouldBlock: akkor blokkoljuk a
       navigációt, ha van mentenivaló (dirty) ÉS nem a mentés/törlés maga navigál
       (leftViaForm). Üres deps-szel stabil, de refekből olvas, így friss állapotot lát. */
    const shouldBlock = useCallback(() => !leftViaForm.current && isDirtyRef.current, []);
    const blocker = useBlocker(shouldBlock);

    /* A NAVIGÁCIÓ-ELKAPÓ mentés magja: a blocker akkor billen "blocked"-ba, ha van
       mentenivaló ÉS navigálni próbálnak (Tovább, Escape, logó, "+", Vissza gomb,
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

        // Innentől mentünk; a mentés sikeréig NEM navigálunk. leftViaForm: az unmount-
        // mentés már ne fusson újra a proceed utáni leváláskor. Az adatot itt INLINE
        // építjük (nem a currentData() helperrel), hogy az effekt függőségei — amiket
        // amúgy is figyel (title, todo, category…) — pontosan lefedjék a felhasznált
        // értékeket (exhaustive-deps).
        leftViaForm.current = true;
        const data: TodoPayload = {
            title: title,
            tasks: todo.tasks,
            taskOrder: todo.columns["createColumn"].taskOrder,
            category: category,
            color: color,
            order: order,
        };
        if (todoId) data.id = todoId;
        handleAxios(url, data, (response) => {
            if (response.status === 200) {
                props.handleLinkClicked();
                props.handleCategoryChange();
                blocker.proceed();
            } else { leftViaForm.current = false; blocker.reset(); }
        }, (error) => {
            // A mentés elbukott: maradunk (reset), egy későbbi távozás újrapróbálja.
            leftViaForm.current = false;
            logRequestError(error);
            blocker.reset();
        });
    }, [blocker, isTitleValid, isCategoryValid, title, category, color, order, todo,
        isUpdate, todoId, url, handleAxios, props]);

    /* A Tovább gomb (és az Escape) már csak NAVIGÁL — az ellenőrzést+mentést a
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
        if (!hasSilentWork()) return;
        const data = currentData();
        if (todoId) data.id = todoId;
        // A zárványolt `token` (nem az élő tokenRef): kijelentkezéskor az élő már null.
        handleAxios(url, data, (response) => {
            if (response.status === 200) props.handleCategoryChange();
        }, logRequestError, token);
    };

    // A fenti mentés a szerkesztő LEVÁLÁSAKOR (pl. kijelentkezés) fut le, egyszer.
    useEffect(() => () => saveOnLeaveRef.current(), []);

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
        /* A mentés MEGKEZDÉSE előtt jelöljük: a rákövetkező leválás (navigáció →
           unmount) NE mentsen újra (create-nél nehogy duplikáljon). Hibánál
           visszavonjuk, hogy egy későbbi távozás újrapróbálja. */
        leftViaForm.current = true;
        const data = currentData();
        if (todoId) data.id = todoId;
        handleAxios(url, data, () => {
            props.handleLinkClicked();
            props.handleCategoryChange();
            navigate(PATHS.todos);
        }, (error) => { leftViaForm.current = false; logRequestError(error); });
    });

    /* A színre már nem kell várni (a témából indul, nem egy kérés hozza), csak
       a sorszám-korlátra — szerkesztéskor ráadásul a betöltött to-do mezőire. */
    useEffect(() => {
        if (lastOrder === null) return;
        if (isUpdate) {
            if (title && isTitleValid && category && isCategoryValid) setIsLoading(false);
        } else setIsLoading(false);
    }, [isUpdate, lastOrder, title, isTitleValid, category, isCategoryValid]);

    // Escape = mentés + vissza, a "Tovább" gombbal azonos úton (l. useEscapeSubmit).
    useEscapeSubmit(formRef);

    // A betöltő spinner az isLoading-ig; a `lastOrder === null` ág vele EGYÜTT igaz
    // (az isLoading csak a sorszám-korlát beérkezte után lesz false), de kimondva a
    // fordítónak is: innentől a lastOrder number, így az Order `last`-ja nem number|null.
    if (isLoading || lastOrder === null) return <Spinner class="min-vh-75"/>;

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

                    <SubmitButton isDisabled={isDisabled} isOutline={false} color={color} text="Tovább"/>

                    {isUpdate &&
                        <DeleteAndModal handleLinkClicked={props.handleLinkClicked}
                                        setIsColorClicked={setIsColorAngleClicked} color={color} todoId={todoId}
                                        setIsCategoryClicked={setIsCategoryAngleClicked}
                                        handleCategoryChange={props.handleCategoryChange}
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
