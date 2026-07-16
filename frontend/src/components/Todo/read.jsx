import {useEffect, useState} from "react";
import {useLocation} from "react-router-dom";
import Spinner from "../spinner";
import LinkTodoUpdate from "../Link/todoUpdate";
import LinkCategory from "../Link/category";
import {useAuth} from "../../contexts/auth";

export default function Read(props) {
    const [isLoading, setIsLoading] = useState(true);
    const location = useLocation();
    const [todos, setTodos] = useState();
    const {handleAxios} = useAuth();

    /* A szűrő (kategória vagy szín) a navigációs állapotból jön. A felhasználó
       azonosítója NEM: azt a szerver a tokenből tudja. */
    useEffect(() => {
        handleAxios(props.url, location.state ?? {}, (response) => setTodos(response.data),
            (error) => console.log(error.response?.data ?? error.message));
    }, [props.url, location.state, handleAxios]);

    useEffect(() => {
        if (todos) setIsLoading(false);
    }, [todos]);

    return (
        isLoading ? <Spinner class="min-vh-75"/> :
            <div className="container-fluid">
                <div className="row justify-content-center">
                    {todos.map((todo) =>
                        <div key={todo._id} className="col-12 col-sm-6 col-xl-4 col-xxl-3 px-2 my-3">
                            <div className={"card bg-transparent border-2 border-" + todo.color}>
                                <LinkTodoUpdate todo={todo} handleLinkClicked={props.handleLinkClicked}/>
                                <LinkCategory category={todo.category} color={todo.color}
                                              onClick={props.handleLinkClicked}
                                              class={"card-footer small text-center bg-transparent mx-2 border-" +
                                                  todo.color}/>
                            </div>
                        </div>
                    )}
                </div>
            </div>
    );
}
