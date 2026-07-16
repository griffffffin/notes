import {useCallback, useEffect, useState} from "react";
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

export default function Save(props) {
    const [isLoading, setIsLoading] = useState(true);
    const [colorHex, setColorHex] = useState("");
    const [color, setColor] = useState("");
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
    /* A to-do SAJÁT színe (a felhasználó választja kártyánként) — nem a témáé.
       Csak a kezdőértékét vesszük a témából. */
    const theme = useTheme();
    const {handleAxios} = useAuth();

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

    const handleColorHexChange = useCallback((color) => {
        switch (color) {
            case "primary":
                setColorHex("#0d6efd");
                break;
            case "info":
                setColorHex("#0dcaf0");
                break;
            case "secondary":
                setColorHex("#6c757d");
                break;
            case "danger":
                setColorHex("#dc3545");
                break;
            case "warning":
                setColorHex("#ffc107");
                break;
            case "success":
                setColorHex("#198754");
                break;
            default:
                console.log("Helytelen szin ertek: " + color + ".");
        }
    }, []);

    useEffect(() => {
        setColor(theme.todoDefaultColor);
        handleColorHexChange(theme.todoDefaultColor);
    }, [theme.todoDefaultColor, handleColorHexChange]);

    const handleColorChange = useCallback((event) => {
        setColor(event.target.value);
        handleColorHexChange(event.target.value);
        setIsColorAngleClicked(false);
    }, [handleColorHexChange]);

    const handleTitleChange = useCallback((event) => {
        setTitle(event.target.value);
        event.target.value.length ? setIsTitleValid(true) : setIsTitleValid(false);
    }, []);

    useEffect(() => {
        // Szerkesztés id nélkül: nincs mit betölteni, a render átirányít.
        if (isUpdate && !todoId) return;

        if (todoId) {
            handleAxios("/id", {id: todoId}, (response) => {
                setColor(response.data.color);
                handleColorHexChange(response.data.color);
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
    }, [isUpdate, todoId, handleAxios, handleColorHexChange]);

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
        if (isUpdate) data["id"] = todoId;
        handleAxios(url, data, (response) => {
            if (response.status === 200) {
                props.handleLinkClicked();
                props.handleCategoryChange();
                navigate("/");
            }
        }, (error) => console.log(error.response?.data ?? error.message));
    }, [props, title, todo.tasks, todo.columns, category, color, order, isUpdate, todoId, url, navigate, handleAxios]);

    useEffect(() => {
        if (colorHex && color && lastOrder !== null)
            if (isUpdate) {
                if (title && isTitleValid && category && isCategoryValid)
                    setIsLoading(false);
            } else setIsLoading(false);
    }, [isUpdate, colorHex, color, lastOrder, title, isTitleValid, category, isCategoryValid]);

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
