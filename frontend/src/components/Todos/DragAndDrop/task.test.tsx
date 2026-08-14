import {fireEvent, render} from "@testing-library/react";
import {DndContext} from "@dnd-kit/core";
import {SortableContext} from "@dnd-kit/sortable";
import {describe, expect, it, vi} from "vitest";
import Task from "./task";
import type {TaskProps} from "./task";
import type {TodoDraft} from "../todoDraft";
import type {Task as TaskItem} from "../../../types/api";
import {requireElement} from "../../../test/dom";


/* A Task useSortable-t hív, ami a SortableContextre támaszkodik — ezért valódi
   DnD-kontextusba ágyazzuk. NEM húzunk: a checkbox/mező LOGIKÁJÁT vizsgáljuk,
   ami a húzástól független (a régi kód splice-index-buktatóinak melegágya). */
const setup = (task: TaskItem, todo: TodoDraft) => {
    const props = {
        task, todo, color: "warning", setTodo: vi.fn(), setTask: vi.fn(), setTaskOrder: vi.fn(),
    } satisfies TaskProps;
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
            tasks: {
                1: {id: "1", content: "a", done: false},
                2: {id: "2", content: "tej", done: false},
                3: {id: "3", content: "c", done: false},
            },
            columns: {createColumn: {id: "createColumn", taskOrder: [1, 2, 3]}},
            columnOrder: ["createColumn"],
        } satisfies TodoDraft;
        /* A listaelem azonosítója SZÖVEG (a `tasks` objektum viszont számmal
           indexel) — öröklött kettősség, l. types/api.ts. A fixtúra eddig számot
           adott, vagyis olyan alakot, amit a szerkesztő sosem állít elő. */
        const props = setup({id: "2", content: "tej", done: false}, todo);

        // A középső elem jelölőnégyzetét bepipáljuk.
        fireEvent.click(requireElement("#checkbox2", HTMLInputElement));

        // A kész elem a sor aljára kerül (2 a végére), és done=true-val mentjük.
        expect(props.setTaskOrder).toHaveBeenCalledWith([1, 3, 2]);
        expect(props.setTask).toHaveBeenCalledWith(2, "tej", true);
    });

    it("üresre törölt listaelem kiesik a taskOrder-ből és a tasks-ból", () => {
        const todo = {
            tasks: {
                1: {id: "1", content: "a", done: false},
                2: {id: "2", content: "tej", done: false},
            },
            columns: {createColumn: {id: "createColumn", taskOrder: [1, 2]}},
            columnOrder: ["createColumn"],
        } satisfies TodoDraft;
        const props = setup({id: "2", content: "tej", done: false}, todo);

        // A listaelem szövegét üresre töröljük: ez a "listaelem törlése" gesztus.
        fireEvent.change(/* Attribútum-szelektor, nem `#2`: a CSS-ben a számmal kezdődő azonosítót
           escape-elni kellene (`#\\32 `), ami néma elgépelés-forrás. */
        requireElement('[id="2"]', HTMLInputElement), {target: {value: ""}});

        expect(props.setTaskOrder).toHaveBeenCalledWith([1]);
        expect(todo.tasks[2]).toBeUndefined();
    });
});
