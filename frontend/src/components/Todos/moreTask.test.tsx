import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import MoreTask from "./moreTask";
import type {MoreTaskProps} from "./moreTask";
import type {TodoDraft} from "./todoDraft";


describe("MoreTask új listaelem", () => {
    it("az új listaelem a legnagyobb kulcs + 1 azonosítót kapja, és a taskOrder végére kerül", () => {
        /* A draft a VALÓDI alakjában (Todos/todoDraft.ts): a listaelemeknek van
           `id`-jük (szövegként, a kulcs számként — öröklött kettősség), az oszlop
           pedig `id`-t és `columnOrder`-t is visz. A fixtúra korábban ezt a három
           mezőt elhagyta; nem tűnt fel, mert ez a teszt nem nyúl hozzájuk — de a
           mért kód bármikor hozzájuk nyúlhatna, és akkor `undefined`-dal
           dolgozna, némán. */
        const todo: TodoDraft = {
            tasks: {
                1: {id: "1", content: "a", done: false},
                2: {id: "2", content: "b", done: false},
            },
            columns: {createColumn: {id: "createColumn", taskOrder: [1, 2]}},
            columnOrder: ["createColumn"],
        };
        const props = {
            todo, color: "warning", setTodo: vi.fn(), setTask: vi.fn(),
        } satisfies MoreTaskProps;
        render(<MoreTask {...props}/>);

        fireEvent.change(screen.getByPlaceholderText("Listaelem"), {target: {value: "új elem"}});

        // A meglévő kulcsok maximuma 2, tehát az új kulcs 3, false (nem kész) állapottal.
        expect(props.setTask).toHaveBeenCalledWith(3, "új elem", false);
        expect(todo.columns.createColumn.taskOrder).toEqual([1, 2, 3]);
    });
});
