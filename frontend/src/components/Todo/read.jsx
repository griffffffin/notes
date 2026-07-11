import {useEffect, useState} from "react";
import {useLocation} from "react-router-dom";
import Spinner from "../spinner";
import LinkTodoUpdate from "../Link/todoUpdate";
import LinkCategory from "../Link/category";

export default function Read(props) {
    const [isLoading, setIsLoading] = useState(true);
    const location = useLocation();
    const [todos, setTodos] = useState();

    useEffect(() => {
        if (!location.state) location.state = {user: props.cookies.user};
    }, [location, props]);

    useEffect(() => {
        props.handleAxios(props.url, location.state, (response) => setTodos(response.data),
            (error) => console.log(error.response?.data ?? error.message));
    }, [props, location.state]);

    useEffect(() => {
        if (props && todos) setIsLoading(false);
    }, [props, todos]);

    return (
        isLoading ? <Spinner class="min-vh-75"/> :
            <div className="container-fluid">
                <div className="row justify-content-center">
                    {todos.map((todo) =>
                        <div key={todo._id} className="col-12 col-sm-6 col-xl-4 col-xxl-3 px-2 my-3">
                            <div className={"card bg-transparent border-2 border-" + todo.color}>
                                <LinkTodoUpdate todo={todo} handleLinkClicked={props.handleLinkClicked}/>
                                <LinkCategory cookies={props.cookies} category={todo.category} color={todo.color}
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
