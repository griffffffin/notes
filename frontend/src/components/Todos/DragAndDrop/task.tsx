import {useSortable} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import NoFocusInput from "../../Input/noFocusInput";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import type {ChangeEvent, CSSProperties, Dispatch, SetStateAction} from "react";
import type {Task as TaskData} from "../../../types/api";
import type {SetTask, SetTaskOrder, TodoDraft} from "../todoDraft";
import type {TodoColor} from "../../../todoColors";

/* Névütközés feloldása: a `Task` ebben a fájlban a KOMPONENS, a szerződésből
   importált azonos nevű típus pedig a listaelem ADATA. */
export type TaskProps = {
    task: TaskData;
    todo: TodoDraft;
    setTodo: Dispatch<SetStateAction<TodoDraft>>;
    setTaskOrder: SetTaskOrder;
    setTask: SetTask;
    color: TodoColor;
};

/* Egy listaelem (task) a szerkesztőben, húzással átrendezhető.

   A fogantyú SZÁNDÉKOSAN csak a három csík (fa-bars): a listeners kizárólag
   arra kerül, nem az egész sorra. Így a szövegmezőben lehet gépelni és a
   jelölőnégyzetre kattintani anélkül, hogy a húzás közbeszólna — a főoldali
   kártyáknál ezt a kattintás-elnyelés oldotta meg, itt a dedikált fogantyú
   egyszerűbben. Ezért nincs is szükség tapintási késleltetésre (TouchSensor
   delay): a fogantyú megfogása egyértelmű húzás-szándék. */
export default function Task({task, todo, setTodo, setTaskOrder, setTask, color}: TaskProps) {
    /* Az id STRING-gé kényszerítve: a task.id string, a taskOrder viszont
       szám-azonosítókat tárol (a korábbi kód parseInt-je miatt). A dnd-kit
       id-alapú, tehát a SortableContext items-e és ez az id ugyanabban a
       típusban kell legyen — a stringre normalizálás mindkettőt egyezteti. */
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} =
        useSortable({id: task.id.toString()});

    // A típus kimondva (l. sortableCard.tsx): az elgépelt CSS-tulajdonság itt bukik.
    const style: CSSProperties = {
        // CSS.Translate (nem Transform): csak eltolás, nyújtás nélkül — a
        // sortableCard.jsx-nél leírt okból (ott bővebben).
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 20 : undefined,
        opacity: isDragging ? 0.85 : undefined,
        /* A sor NEM kattintható egészében, csak a fogantyú húzható. A dnd-kit
           viszont role="button"-t tesz rá (a billentyűzetes húzáshoz), amire a
           Bootstrap [role=button] { cursor: pointer } mutatóujjat adna a sor
           szélein. Visszavesszük: a szöveg így is kijelölhető (az input text
           kurzort ad), csak a "kattintható" látszatot töröljük. */
        cursor: "default",
    };

    /* Nincs useCallback: ezek a saját inputjaira mennek (onChange), nincs
       memózott fogyasztójuk — a memózás itt csak zaj lenne. */
    const handleCheckChange = (event: ChangeEvent<HTMLInputElement>) => {
        const taskId = parseInt((event.target.id).replace("checkbox", ""));
        if (event.target.checked) {
            const taskOrder = todo.columns["createColumn"].taskOrder;
            const index = taskOrder.findIndex(element => element === taskId);

            taskOrder.splice(index, 1);
            taskOrder.push(taskId);

            setTodo(setTaskOrder(taskOrder));
            setTodo(setTask(taskId, task.content, true));
        } else setTodo(setTask(taskId, task.content, false));
    };

    const handleTaskChange = (event: ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        const id = parseInt((event.target.id));
        const done = todo.tasks[id].done;

        if (value === "") {
            const taskOrder = todo.columns["createColumn"].taskOrder;
            const index = taskOrder.findIndex(element => element === id);
            taskOrder.splice(index, 1);
            setTodo(setTaskOrder(taskOrder));
            delete todo.tasks[id];
            return;
        }
        setTodo(setTask(id, value, done));
    };

    return (
        <div ref={setNodeRef} style={style} className="input-group-text bg-transparent border-0" {...attributes}>
            {/* A text-* osztály a PIPÁÉRT van, nem szövegért: a pipát maszkkal
                rajzoljuk, és a színét az elem color-jából veszi (index.css). */}
            <input id={"checkbox" + task.id} type="checkbox" defaultChecked={task.done}
                   className={"form-check-input border-" + color + " text-" + color +
                       " bg-transparent"}
                   onChange={handleCheckChange}/>
            <NoFocusInput id={task.id} value={task.content} placeholder="Listaelem" autoFocus={true}
                          onChange={handleTaskChange} autoComplete="off" required={false} color={color}
                          class={task.done ? "text-decoration-line-through caveat" : "caveat"}/>
            {/* A listeners CSAK a fogantyún: ez teszi a három csíkot az egyetlen
                húzható pontá. A touch-action: none kell, hogy a böngésző a
                fogantyún kezdett ujjmozgást ne a saját görgetésének vegye.

                A ps-2 pe-1 py-1 NEM dísz: megnöveli a FOGÁSI felületet a puszta
                ikonon túl, hogy ujjal (telefonon) könnyű legyen eltalálni. A
                nagyobb ikon (size=lg) pedig láthatóbbá teszi. */}
            <span {...listeners} className="ps-2 pe-1 py-1" style={{touchAction: "none", cursor: "grab"}}>
                <FontAwesomeIcon icon={["fas", "bars"]} size="lg" className={"text-" + color}/>
            </span>
        </div>
    );
}
