import {useState} from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import NoFocusInput from "../Input/noFocusInput";
import type {ChangeEvent, Dispatch, SetStateAction} from "react";
import type {SetTask, TodoDraft} from "./todoDraft";
import type {TodoColor} from "../../todoColors";

/* A `setTaskOrder`-t ez a komponens NEM kapja meg (szemben a DragAndDrop-pal):
   az új listaelem a sorrend VÉGÉRE kerül, amit közvetlen `push`-sal intéz. */
type MoreTaskProps = {
    todo: TodoDraft;
    setTodo: Dispatch<SetStateAction<TodoDraft>>;
    setTask: SetTask;
    color: TodoColor;
};

export default function MoreTask({todo, setTodo, setTask, color}: MoreTaskProps) {
    const [moreTask] = useState("");

    // Nincs useCallback: sima onChange, nincs memózott fogyasztó.
    const handleMoreTaskChange = (event: ChangeEvent<HTMLInputElement>) => {
        let taskKey = 0;
        const keys = Object.keys(todo.tasks);
        if (keys.length) {
            keys.forEach(key => {
                if (Number(key) > taskKey) taskKey = Number(key);
            });
            taskKey++;
        }
        setTodo(setTask(taskKey, event.target.value, false));
        todo.columns["createColumn"].taskOrder.push(taskKey);
    };

    return (
        <div className="input-group">
            <div className="input-group-text bg-transparent no-focus">
                <FontAwesomeIcon icon={["fas", "plus"]} className={"text-" + color}/>
            </div>
            <NoFocusInput value={moreTask} onChange={handleMoreTaskChange} placeholder="Listaelem" autoFocus={false}
                          required={false} color={color} class="caveat ms-0 ps-0"/>
        </div>

    );
}
