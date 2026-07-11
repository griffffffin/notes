import {useCallback} from "react";
import {Draggable} from "@hello-pangea/dnd";
import NoFocusInput from "../../Input/noFocusInput";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";

export default function Task(props) {

    const handleCheckChange = useCallback((event) => {
        const taskId = parseInt((event.target.id).replace("checkbox", ""));
        if (event.target.checked) {
            const taskOrder = props.todo.columns["createColumn"].taskOrder;
            const index = taskOrder.findIndex(element => element === taskId);

            taskOrder.splice(index, 1);
            taskOrder.push(taskId);

            props.setTodo(props.setTaskOrder(taskOrder));
            props.setTodo(props.setTask(taskId, props.task.content, true));
        } else props.setTodo(props.setTask(taskId, props.task.content, false));
    }, [props]);

    const handleTaskChange = useCallback((event) => {
        const value = event.target.value;
        const id = parseInt((event.target.id));
        const done = props.todo.tasks[id].done;

        if (value === "") {
            const taskOrder = props.todo.columns["createColumn"].taskOrder;
            const index = taskOrder.findIndex(element => element === id);
            taskOrder.splice(index, 1);
            props.setTodo(props.setTaskOrder(taskOrder));
            delete props.todo.tasks[id];
            return;
        }
        props.setTodo(props.setTask(id, value, done));
    }, [props]);

    return (
        <Draggable draggableId={props.task.id} index={props.index}>
            {(provided) => (
                <div className="input-group-text bg-transparent border-0" {...provided.draggableProps}
                     ref={provided.innerRef}>
                    <input id={"checkbox" + props.task.id} type="checkbox" defaultChecked={props.task.done}
                           className={"form-check-input border-" + props.color + " bg-transparent"}
                           onChange={handleCheckChange}/>
                    <NoFocusInput id={props.task.id} value={props.task.content} placeholder="Listaelem" autoFocus={true}
                                  onChange={handleTaskChange} autoComplete="off" required={false} color={props.color}
                                  class={props.task.done ? "text-decoration-line-through caveat" : "caveat"}/>
                    <span {...provided.dragHandleProps}>
                <FontAwesomeIcon icon="fa-solid fa-bars" className={"text-" + props.color}/>
                </span>
                </div>
            )}
        </Draggable>
    );
}
