import {fireEvent, render} from "@testing-library/react";
import {DndContext} from "@dnd-kit/core";
import {SortableContext} from "@dnd-kit/sortable";
import {describe, expect, it, vi} from "vitest";
import Task from "./task";


/* A Task useSortable-t hív, ami a SortableContextre támaszkodik — ezért valódi
   DnD-kontextusba ágyazzuk. NEM húzunk: a checkbox/mező LOGIKÁJÁT vizsgáljuk,
   ami a húzástól független (a régi kód splice-index-buktatóinak melegágya). */
const setup = (task, todo) => {
    const props = {task, todo, color: "warning", setTodo: vi.fn(), setTask: vi.fn(), setTaskOrder: vi.fn()};
    render(
        <DndContext>
            <SortableContext items={todo.columns.createColumn.taskOrder.map(String)}>
                <Task {...props}/>
            </SortableContext>
        </DndContext>,
    );
    return props;
};

describe("Task listaelem", () => {
    it("bepipáláskor a listaelem a taskOrder VÉGÉRE kerül és done lesz", () => {
        const todo = {
            tasks: {1: {content: "a", done: false}, 2: {content: "tej", done: false}, 3: {content: "c", done: false}},
            columns: {createColumn: {taskOrder: [1, 2, 3]}},
        };
        const props = setup({id: 2, content: "tej", done: false}, todo);

        // A középső elem jelölőnégyzetét bepipáljuk.
        fireEvent.click(document.getElementById("checkbox2"));

        // A kész elem a sor aljára kerül (2 a végére), és done=true-val mentjük.
        expect(props.setTaskOrder).toHaveBeenCalledWith([1, 3, 2]);
        expect(props.setTask).toHaveBeenCalledWith(2, "tej", true);
    });

    it("üresre törölt listaelem kiesik a taskOrder-ből és a tasks-ból", () => {
        const todo = {
            tasks: {1: {content: "a", done: false}, 2: {content: "tej", done: false}},
            columns: {createColumn: {taskOrder: [1, 2]}},
        };
        const props = setup({id: 2, content: "tej", done: false}, todo);

        // A listaelem szövegét üresre töröljük: ez a "listaelem törlése" gesztus.
        fireEvent.change(document.getElementById("2"), {target: {value: ""}});

        expect(props.setTaskOrder).toHaveBeenCalledWith([1]);
        expect(todo.tasks[2]).toBeUndefined();
    });
});
