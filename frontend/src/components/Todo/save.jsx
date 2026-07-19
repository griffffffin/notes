import {useCallback, useEffect, useRef, useState} from "react";
import {Navigate, useLocation, useNavigate, useParams} from "react-router-dom";
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
import {useTheme} from "../../contexts/theme";
import {useAuth} from "../../contexts/auth";
import {TODO_COLORS} from "../../todoColors";
import {logRequestError} from "../../log";
import {Tooltip as ReactTooltip} from "react-tooltip";

/* Változatlan-e az űrlap ahhoz képest, amit a szerver adott? */
const isUnchanged = (current, loaded) =>
    current.title === loaded.title &&
    current.category === loaded.category &&
    current.color === loaded.color &&
    current.order === loaded.order &&
    JSON.stringify(current.taskOrder) === JSON.stringify(loaded.taskOrder) &&
    JSON.stringify(current.tasks) === JSON.stringify(loaded.tasks);

export default function Save(props) {
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
    const [todo, setTodo] = useState({
        tasks: {},
        columns: {"createColumn": {id: "createColumn", taskOrder: []}},
        columnOrder: ["createColumn"]
    });
    const [category, setCategory] = useState("");
    const [isCategoryValid, setIsCategoryValid] = useState(false);
    const [isDisabled, setIsDisabled] = useState(true);
    const {id} = useParams();
    const location = useLocation();
    const [lastOrder, setLastOrder] = useState(null);
    const [isCategoryAngleClicked, setIsCategoryAngleClicked] = useState(false);
    const navigate = useNavigate();
    const {handleAxios} = useAuth();
    const formRef = useRef(null);
    /* A kötelező mezők SAJÁT hibabuborékja a natív böngésző-buborék helyett (azt
       nem lehet stílusozni). null = nincs hiba; egyébként {anchor, name}: a hibás
       mező CSS-szelektora (a tooltip horgonya) és a NEVE (a placeholderből, kis
       kezdőbetűvel). A névből áll össze az "A/Az <név> kitöltése kötelező." szöveg,
       így egy új mező (pl. idézet) esetén a felirat magától helyes lesz. */
    const [validation, setValidation] = useState(null);

    /* A hex a színnévből egyértelműen adódik, tehát nem state: kiszámoljuk.
       Korábban külön state volt, amit egy switch-es setter tartott szinkronban
       — két forrás ugyanarra az egy adatra, ami el tud csúszni egymástól. */
    const colorHex = TODO_COLORS[color] ?? "";

    /* isUpdate és url NEM state: a propból egyértelműen adódnak, tehát minden
       renderben kiszámolhatók. Korábban useEffect másolta őket state-be — így
       egy renderrel LEMARADTAK a prop mögött, és a /update → /create váltáskor
       a még "true" isUpdate-tel futott le a lenti lekérdezés a már üres
       navigációs state-en (TypeError: reading 'id' of null). */
    const isUpdate = Boolean(props.isUpdate);
    const url = isUpdate ? "/to-do/update" : "/to-do/create";

    /* Melyik to-do-t szerkesztjük. Az azonosító az URL /update/:id szegmenséből
       jön, így F5 és közvetlen link után is megvan (szemben a régi navigációs
       state-tel, ami csak linken át érkezett). A :id csak akkor hiányzik, ha az
       útvonal nem is illeszkedett — a hiányát lentebb átirányítással kezeljük. */
    const todoId = isUpdate ? (id ?? null) : null;

    /* A szerverről betöltött állapot — a beküldéskor ehhez mérjük, változott-e
       bármi. Ref és nem state: senki nem jeleníti meg, és a változása nem
       járhat újrarajzolással. */
    const loadedTodo = useRef(null);

    /* A szerkesztőből kilépés célja. Update esetén VISSZA oda, ahonnan indult
       (a listáról, akár szűrt nézetből) — a böngésző-előzményen keresztül, hogy
       a szűrő ne vesszen el. Ha nincs app-on belüli előzmény (F5 vagy közvetlen
       link: a location kulcsa "default"), vagy ha új to-do-t hoztunk létre, a
       to-do listára megyünk. */
    const leaveEditor = useCallback(() => {
        if (isUpdate && location.key !== "default") navigate(-1);
        else navigate("/to-do");
    }, [isUpdate, location.key, navigate]);

    const handleColorChange = useCallback((event) => {
        setColor(event.target.value);
        setIsColorAngleClicked(false);
    }, []);

    const handleTitleChange = useCallback((event) => {
        setTitle(event.target.value);
        event.target.value.length ? setIsTitleValid(true) : setIsTitleValid(false);
    }, []);

    useEffect(() => {
        // Szerkesztés id nélkül: nincs mit betölteni, a render átirányít.
        if (isUpdate && !todoId) return;

        if (todoId) {
            handleAxios("/to-do/id", {id: todoId}, (response) => {
                // Pillanatkép arról, AMIT a szerver adott — a beküldéskor ehhez
                // hasonlítunk, hogy egy változatlan űrlap ne írjon feleslegesen.
                loadedTodo.current = {
                    title: response.data.title,
                    category: response.data.category,
                    color: response.data.color,
                    order: response.data.order,
                    tasks: response.data.tasks ?? {},
                    taskOrder: response.data.taskOrder ?? [],
                };
                setColor(response.data.color);
                setTitle(response.data.title);
                setIsTitleValid(true);
                setOrder(response.data.order);
                setTodo({
                    tasks: response.data.tasks ? response.data.tasks : {},
                    columns: {"createColumn": {id: "createColumn", taskOrder: response.data.taskOrder}},
                    columnOrder: ["createColumn"]
                });
                setCategory(response.data.category);
                setIsCategoryValid(true);
                setIsDisabled(false);
            }, (error) => {
                // A to-do nem tölthető be (pl. timeout vagy törölt elem) — vissza
                // a listához, hogy a szerkesztő betöltője ne pörögjön örökké. A
                // setIsLoading(false) a betöltött adathoz kötött, tehát hiba után
                // magától nem oldódna fel; a read.jsx is navigációval kezeli.
                logRequestError(error);
                leaveEditor();
            });
        }
        handleAxios("/to-do/last/order", {},
            (response) => {
                const lastOrder = response.data;
                lastOrder === 0 ? setLastOrder(0) : setLastOrder(isUpdate ? lastOrder - 1 : lastOrder);
            },
            logRequestError);
    }, [isUpdate, todoId, handleAxios, leaveEditor]);

    const setTask = useCallback((key, content, isDone) => {
        return {
            ...todo, tasks: {
                ...todo.tasks,
                [key]: {id: key.toString(), content: content, done: isDone}
            }
        }
    }, [todo]);

    const setTaskOrder = useCallback((taskOrder) => {
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

    const handleColorAngleClick = useCallback(() => setIsColorAngleClicked(!isColorAngleClicked),
        [isColorAngleClicked]);

    const handleSubmit = useCallback((event) => {
        event.preventDefault();
        // A user-azonosítót NEM küldjük: a szerver a tokenből veszi (a régi app
        // itt hitt a kliensnek — ez volt a fő biztonsági gyengesége).
        let data = {
            title: title,
            tasks: todo.tasks,
            taskOrder: todo.columns["createColumn"].taskOrder,
            category: category,
            color: color,
            order: order,
        }
        /* ÉRINTETLEN űrlapot mentés nélkül elvetünk, és NEM kérünk kötelező mezőt —
           nem kényszerítünk kitöltésre azt, aki hozzá sem nyúlt. Create-nél ez az
           üres űrlap (se cím, se kategória, se listaelem); update-nél a betöltöttel
           egyező tartalom (a mentés updatedAt-et is írna, tehát egy üres "Tovább"
           hazudná, hogy hozzányúltunk, és a napi export is fölöslegesen futna). Az
           isUnchanged JSON-on át hasonlít: a tasks kulcsai számok, amiket a JS
           növekvő sorrendben jár be, tehát a szöveges alak stabil. */
        const pristine = isUpdate
            ? (loadedTodo.current && isUnchanged(data, loadedTodo.current))
            : (!title.trim() && !category.trim() && Object.keys(todo.tasks ?? {}).length === 0);
        if (pristine) {
            props.handleLinkClicked();
            leaveEditor();
            return;
        }
        /* Idáig jutva a felhasználó MÁR ÍRT valamit. Ha egy kötelező mező üres, a
           saját hibabuborékot mutatjuk (a nem stílusozható natív helyett), és nem
           mentünk/navigálunk. A név a mező placeholderéből jön, kis kezdőbetűvel —
           így új mezőnél nem kell hozzányúlni a szöveghez. A cím az első, aztán a
           kategória. */
        const fieldOf = (selector) => {
            const el = document.querySelector(selector);
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            /* A nyíl a PLACEHOLDER közepére mutasson, ne a hosszú input közepére.
               A placeholder szöveg félszélességét canvasszal mérjük (a mező saját
               fontjával), a bal padding után — ide horgonyozzuk a tooltipet
               (position), place=bottom-mal, így a nyila épp a placeholder alá esik. */
            const ctx = document.createElement("canvas").getContext("2d");
            ctx.font = cs.font || `${cs.fontSize} ${cs.fontFamily}`;
            const half = ctx.measureText(el.placeholder).width / 2;
            /* A horgony a PLACEHOLDER SZÖVEG jobb-alsó tájékára esik: vízszintesen
               a szöveg közepe (bal padding + félszélesség), függőlegesen a szöveg
               alja (top + felső padding + betűméret). Így a buborék szorosan a
               placeholder alá kerül, nem a magas mező aljához — a "Sorszám" tooltip
               és a szám közti szoros távolsághoz hasonlóan. */
            return {
                anchor: selector,
                name: el.placeholder.toLowerCase(),
                pos: {
                    x: r.left + (parseFloat(cs.paddingLeft) || 0) + half,
                    y: r.top + (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.fontSize) || 16),
                },
            };
        };
        if (!isTitleValid) { setValidation(fieldOf("#createColumn")); return; }
        if (!isCategoryValid) { setValidation(fieldOf("input[placeholder='Kategória']")); return; }
        setValidation(null);

        if (isUpdate) data["id"] = todoId;
        handleAxios(url, data, (response) => {
            if (response.status === 200) {
                props.handleLinkClicked();
                props.handleCategoryChange();
                leaveEditor();
            }
        }, logRequestError);
    }, [props, title, todo.tasks, todo.columns, category, color, order, isUpdate, todoId, url, leaveEditor, handleAxios,
        isTitleValid, isCategoryValid]);

    /* A színre már nem kell várni (a témából indul, nem egy kérés hozza), csak
       a sorszám-korlátra — szerkesztéskor ráadásul a betöltött to-do mezőire. */
    useEffect(() => {
        if (lastOrder === null) return;
        if (isUpdate) {
            if (title && isTitleValid && category && isCategoryValid) setIsLoading(false);
        } else setIsLoading(false);
    }, [isUpdate, lastOrder, title, isTitleValid, category, isCategoryValid]);

    /* Escape a szerkesztőben = mentés + vissza a főoldalra, pontosan úgy, ahogy a
       "Tovább" gomb: a formot sütjük el (requestSubmit), így a natív validáció és
       a handleSubmit (benne a "változatlan → csak navigálás" és a "mentés →
       navigálás" ág) egyaránt ugyanúgy lefut. Kivétel: ha a törlés-modal nyitva
       van, az Escape AZT zárja (natív <dialog> viselkedés) — ott nem mentünk. */
    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
                formRef.current?.requestSubmit();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    /* Szerkesztés id nélkül — közvetlen /update URL vagy F5. Nincs mit
       szerkeszteni, ezért vissza a főoldalra. A replace azért kell, hogy a
       zsákutca-/update ne kerüljön be az előzményekbe: a Vissza gomb ne ide
       dobja vissza a felhasználót. (Minden hook FÖLÖTTE fut le — a React
       szabálya, hogy hookot nem hagyhatunk ki feltételesen.) */
    if (isUpdate && !todoId) return <Navigate to="/to-do" replace/>;

    return (
        isLoading ? <Spinner class="min-vh-75"/> :
            <form ref={formRef} noValidate onSubmit={handleSubmit}
                  className={"col-11 col-sm-10 col-md-8 col-lg-7 col-xl-6 card " +
                "mx-auto mt-3 bg-transparent border-2 border-" + color}>

                <div className="input-group">
                    <NoFocusInput id="createColumn" value={title} onChange={handleTitleChange} placeholder="Cím"
                                  autoComplete="off" autoFocus={true} required={true} color={color}
                                  class="card-header caveat ms-1"/>
                    <Order current={order} setOrder={setOrder} last={lastOrder} color={color} colorHex={colorHex}/>
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
                                            handleCategoryChange={props.handleCategoryChange}/>}

                        <NoFocusButton onClick={handleColorAngleClick} class="pb-0" color={color}
                                       text={<FontAwesomeIcon icon="fa-solid fa-paint-roller" size="xl"
                                                              className={isColorAngleClicked ?
                                                                  "fa-flip-vertical py-1 text-" + color :
                                                                  "py-1 text-" + color}/>}/>
                        {isColorAngleClicked && <ColorButtonGroup onClick={handleColorChange}/>}

                    </div>
                </div>

                {/* Kötelező-mező hibabuborék a natív böngésző-buborék helyett, a
                    "Sorszám" tooltip stílusában (lap-háttér, kiemelőszínű keret és
                    szöveg). A tooltipet a placeholder KÖZEPÉRE horgonyozzuk (a submit
                    által mért position), place=bottom-mal, így a nyila a placeholder
                    alá esik, nem a hosszú input közepére. A szöveg névelője a mezőnév
                    kezdőbetűjéből adódik: magánhangzó → "Az", egyébként "A". */}
                <ReactTooltip id="validation-tooltip" isOpen={validation !== null}
                              position={validation?.pos} place="bottom"
                              disableStyleInjection={true} border="1px solid var(--theme-accent)"
                              style={{zIndex: 20, backgroundColor: "var(--theme-page-bg)",
                                  color: "var(--theme-accent)"}}>
                    {validation &&
                        `${/^[aáeéiíoóöőuúüű]/i.test(validation.name) ? "Az" : "A"} ` +
                        `${validation.name} kitöltése kötelező.`}
                </ReactTooltip>

            </form>
    );
}
