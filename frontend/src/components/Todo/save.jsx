import {useCallback, useEffect, useRef, useState} from "react";
import {Navigate, useLocation, useNavigate} from "react-router-dom";
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
    const location = useLocation();
    const [lastOrder, setLastOrder] = useState(null);
    const [isCategoryAngleClicked, setIsCategoryAngleClicked] = useState(false);
    const navigate = useNavigate();
    const {handleAxios} = useAuth();

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
    const url = isUpdate ? "/update" : "/todo/create";

    /* Melyik to-do-t szerkesztjük. A <Link state={{id}}> teszi ide, DE ez csak
       a linken át érkezve van meg: közvetlen URL-beírásnál vagy F5-nél a
       navigációs state null. Ezért olvassuk óvatosan; a hiányát lentebb
       átirányítással kezeljük. */
    const todoId = isUpdate ? (location.state?.id ?? null) : null;

    /* A szerverről betöltött állapot — a beküldéskor ehhez mérjük, változott-e
       bármi. Ref és nem state: senki nem jeleníti meg, és a változása nem
       járhat újrarajzolással. */
    const loadedTodo = useRef(null);

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
            handleAxios("/id", {id: todoId}, (response) => {
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
            }, (error) => console.log(error.response?.data ?? error.message));
        }
        handleAxios("/last/order", {},
            (response) => {
                const lastOrder = response.data;
                lastOrder === 0 ? setLastOrder(0) : setLastOrder(isUpdate ? lastOrder - 1 : lastOrder);
            },
            (error) => console.log(error.response?.data ?? error.message));
    }, [isUpdate, todoId, handleAxios]);

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
        /* Ha semmi nem változott, NEM megyünk a szerverhez. Nem csak a
           fölösleges kérés miatt: a mentés updatedAt-et is ír, tehát egy üres
           "Tovább" módosítottnak jelölné a to-dót — hazudna a "mikor nyúltál
           hozzá utoljára" adat, és a napi export is fölöslegesen lefutna.

           A tasks/taskOrder összehasonlítása JSON-on át megy: a tasks kulcsai
           számok, azokat a JS mindig növekvő sorrendben járja be, tehát a
           szöveges alak stabil — nem fordulhat elő, hogy azonos tartalom
           különbözőnek látsszon. */
        if (isUpdate && loadedTodo.current && isUnchanged(data, loadedTodo.current)) {
            props.handleLinkClicked();
            navigate("/");
            return;
        }

        if (isUpdate) data["id"] = todoId;
        handleAxios(url, data, (response) => {
            if (response.status === 200) {
                props.handleLinkClicked();
                props.handleCategoryChange();
                navigate("/");
            }
        }, (error) => console.log(error.response?.data ?? error.message));
    }, [props, title, todo.tasks, todo.columns, category, color, order, isUpdate, todoId, url, navigate, handleAxios]);

    /* A színre már nem kell várni (a témából indul, nem egy kérés hozza), csak
       a sorszám-korlátra — szerkesztéskor ráadásul a betöltött to-do mezőire. */
    useEffect(() => {
        if (lastOrder === null) return;
        if (isUpdate) {
            if (title && isTitleValid && category && isCategoryValid) setIsLoading(false);
        } else setIsLoading(false);
    }, [isUpdate, lastOrder, title, isTitleValid, category, isCategoryValid]);

    /* Szerkesztés id nélkül — közvetlen /update URL vagy F5. Nincs mit
       szerkeszteni, ezért vissza a főoldalra. A replace azért kell, hogy a
       zsákutca-/update ne kerüljön be az előzményekbe: a Vissza gomb ne ide
       dobja vissza a felhasználót. (Minden hook FÖLÖTTE fut le — a React
       szabálya, hogy hookot nem hagyhatunk ki feltételesen.) */
    if (isUpdate && !todoId) return <Navigate to="/" replace/>;

    return (
        isLoading ? <Spinner class="min-vh-75"/> :
            <form onSubmit={handleSubmit} className={"col-11 col-sm-10 col-md-8 col-lg-7 col-xl-6 card " +
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

            </form>
    );
}
