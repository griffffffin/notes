import {useState} from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import NoFocusInput from "../Input/noFocusInput";

export default function MoreTask(props) {
    const [moreTask] = useState("");

    // Nincs useCallback: sima onChange, nincs memózott fogyasztó.
    const handleMoreTaskChange = (event) => {
        let taskKey = 0;
        const keys = Object.keys(props.todo.tasks);
        if (keys.length) {
            keys.forEach(key => {
                if (Number(key) > taskKey) taskKey = Number(key);
            });
            taskKey++;
        }
        props.setTodo(props.setTask(taskKey, event.target.value, false));
        props.todo.columns["createColumn"].taskOrder.push(taskKey);
    };

    return (
        <div className="input-group">
            <div className="input-group-text bg-transparent no-focus">
                <FontAwesomeIcon icon={["fas", "plus"]} className={"text-" + props.color}/>
            </div>
            <NoFocusInput value={moreTask} onChange={handleMoreTaskChange} placeholder="Listaelem" autoFocus={false}
                          required={false} color={props.color} class="caveat ms-0 ps-0"/>
        </div>

    );
}
