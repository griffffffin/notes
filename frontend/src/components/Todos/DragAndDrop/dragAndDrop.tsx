import {useCallback} from "react";
import {closestCenter, DndContext, PointerSensor, useSensor, useSensors} from "@dnd-kit/core";
import {arrayMove, SortableContext, verticalListSortingStrategy} from "@dnd-kit/sortable";
import Task from "./task";
import type {DragEndEvent} from "@dnd-kit/core";
import type {Dispatch, SetStateAction} from "react";
import type {SetTask, SetTaskOrder, TodoDraft} from "../todoDraft";
import type {TodoColor} from "../../../todoColors";

type DragAndDropProps = {
    todo: TodoDraft;
    setTodo: Dispatch<SetStateAction<TodoDraft>>;
    setTaskOrder: SetTaskOrder;
    setTask: SetTask;
    color: TodoColor;
};

/* A szerkesztő listaelemeinek húzással átrendezése — ugyanaz a @dnd-kit, ami a
   főoldali kártyáké. (Korábban a @hello-pangea/dnd vitte, külön könyvtárként; az
   egységesítéssel az elhagyható lett.)

   A régi Trello-szerű columns/columnOrder szerkezet MARAD az adatmodellben (a
   backend is így tárolja: egyetlen "createColumn" a taskOrder tömbbel) — csak a
   DnD-könyvtár cserélődött, az adat nem. A húzás a taskOrder tömböt rendezi át. */
export default function DragAndDrop({todo, setTodo, setTaskOrder, setTask, color}: DragAndDropProps) {
    const taskOrder = todo.columns["createColumn"].taskOrder;

    // A fogantyú dedikált (a task.tsx-ben a három csík), ezért egyszerű
    // PointerSensor elég; 5 px mozgás után indul, hogy egy koppintás ne húzzon.
    const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 5}}));

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const {active, over} = event;
        if (!over || active.id === over.id) return;

        const order = todo.columns["createColumn"].taskOrder;
        /* Típus-toleráns keresés: a dnd-kit azonosítói stringek, a taskOrder
           viszont szám-azonosítókat tárol — ezért stringgé normalizálva
           hasonlítunk. Az arrayMove az EREDETI (szám) elemekkel adja vissza a
           sorrendet, tehát a mentett adat típusa változatlan. */
        const from = order.findIndex((id) => id.toString() === active.id);
        const to = order.findIndex((id) => id.toString() === over.id);
        if (from === -1 || to === -1) return;

        const newOrder = arrayMove(order, from, to);
        setTodo({
            ...todo,
            columns: {...todo.columns, createColumn: {id: "createColumn", taskOrder: newOrder}},
        });
    }, [todo, setTodo]);

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={taskOrder.map((id) => id.toString())} strategy={verticalListSortingStrategy}>
                <div className="d-flex flex-column col input-group">
                    {taskOrder.map((taskId) =>
                        <Task key={taskId} task={todo.tasks[taskId]} todo={todo} setTodo={setTodo}
                              setTaskOrder={setTaskOrder} setTask={setTask} color={color}/>)}
                </div>
            </SortableContext>
        </DndContext>
    );
}
