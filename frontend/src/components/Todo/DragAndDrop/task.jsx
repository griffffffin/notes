import {useSortable} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import NoFocusInput from "../../Input/noFocusInput";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";

/* Egy listaelem (task) a szerkesztőben, húzással átrendezhető.

   A fogantyú SZÁNDÉKOSAN csak a három csík (fa-bars): a listeners kizárólag
   arra kerül, nem az egész sorra. Így a szövegmezőben lehet gépelni és a
   jelölőnégyzetre kattintani anélkül, hogy a húzás közbeszólna — a főoldali
   kártyáknál ezt a kattintás-elnyelés oldotta meg, itt a dedikált fogantyú
   egyszerűbben. Ezért nincs is szükség tapintási késleltetésre (TouchSensor
   delay): a fogantyú megfogása egyértelmű húzás-szándék. */
export default function Task(props) {
    /* Az id STRING-gé kényszerítve: a task.id string, a taskOrder viszont
       szám-azonosítókat tárol (a korábbi kód parseInt-je miatt). A dnd-kit
       id-alapú, tehát a SortableContext items-e és ez az id ugyanabban a
       típusban kell legyen — a stringre normalizálás mindkettőt egyezteti. */
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} =
        useSortable({id: props.task.id.toString()});

    const style = {
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
    const handleCheckChange = (event) => {
        const taskId = parseInt((event.target.id).replace("checkbox", ""));
        if (event.target.checked) {
            const taskOrder = props.todo.columns["createColumn"].taskOrder;
            const index = taskOrder.findIndex(element => element === taskId);

            taskOrder.splice(index, 1);
            taskOrder.push(taskId);

            props.setTodo(props.setTaskOrder(taskOrder));
            props.setTodo(props.setTask(taskId, props.task.content, true));
        } else props.setTodo(props.setTask(taskId, props.task.content, false));
    };

    const handleTaskChange = (event) => {
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
    };

    return (
        <div ref={setNodeRef} style={style} className="input-group-text bg-transparent border-0" {...attributes}>
            {/* A text-* osztály a PIPÁÉRT van, nem szövegért: a pipát maszkkal
                rajzoljuk, és a színét az elem color-jából veszi (index.css). */}
            <input id={"checkbox" + props.task.id} type="checkbox" defaultChecked={props.task.done}
                   className={"form-check-input border-" + props.color + " text-" + props.color +
                       " bg-transparent"}
                   onChange={handleCheckChange}/>
            <NoFocusInput id={props.task.id} value={props.task.content} placeholder="Listaelem" autoFocus={true}
                          onChange={handleTaskChange} autoComplete="off" required={false} color={props.color}
                          class={props.task.done ? "text-decoration-line-through caveat" : "caveat"}/>
            {/* A listeners CSAK a fogantyún: ez teszi a három csíkot az egyetlen
                húzható pontá. A touch-action: none kell, hogy a böngésző a
                fogantyún kezdett ujjmozgást ne a saját görgetésének vegye.

                A ps-2 pe-1 py-1 NEM dísz: megnöveli a FOGÁSI felületet a puszta
                ikonon túl, hogy ujjal (telefonon) könnyű legyen eltalálni. A
                nagyobb ikon (size=lg) pedig láthatóbbá teszi. */}
            <span {...listeners} className="ps-2 pe-1 py-1" style={{touchAction: "none", cursor: "grab"}}>
                <FontAwesomeIcon icon="fa-solid fa-bars" size="lg" className={"text-" + props.color}/>
            </span>
        </div>
    );
}
