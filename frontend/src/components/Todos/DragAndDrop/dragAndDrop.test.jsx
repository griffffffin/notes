import {render} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import DragAndDrop from "./dragAndDrop";

/* Valódi húzást jsdom-ban nem tudunk lejátszani (nincs elrendezés). A húzás VÉGE
   viszont egy sima függvényhívás (onDragEnd), amit a DndContext ad át — ezt
   kapjuk el, és hívjuk közvetlenül. */
const dnd = vi.hoisted(() => ({endDrag: null}));
vi.mock("@dnd-kit/core", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        DndContext: ({children, onDragEnd}) => {
            dnd.endDrag = onDragEnd;
            return children;
        },
    };
});

const makeTodo = () => ({
    columns: {createColumn: {id: "createColumn", taskOrder: [10, 20, 30]}},
    columnOrder: ["createColumn"],
    tasks: {
        10: {id: "10", content: "első", done: false},
        20: {id: "20", content: "második", done: false},
        30: {id: "30", content: "harmadik", done: false},
    },
});

const renderDnd = (setTodo) => render(
    <DragAndDrop todo={makeTodo()} setTodo={setTodo} setTaskOrder={vi.fn()} setTask={vi.fn()} color="warning"/>,
);

describe("Listaelem-húzás sorrendezése", () => {
    it("átrendezi a taskOrder-t, és SZÁM-azonosítókat ment (nem stringet)", () => {
        const setTodo = vi.fn();
        renderDnd(setTodo);
        // Az első elemet (id 10) a harmadik (id 30) helyére. A dnd-kit stringként
        // adja az azonosítót — a mentett sorrendnek mégis számnak kell maradnia,
        // mert a backend azt várja (a régi @hello-pangea óta).
        dnd.endDrag({active: {id: "10"}, over: {id: "30"}});
        expect(setTodo).toHaveBeenCalledOnce();
        const saved = setTodo.mock.calls[0][0].columns.createColumn.taskOrder;
        expect(saved).toEqual([20, 30, 10]);
        expect(saved.every((id) => typeof id === "number")).toBe(true);
    });

    it("ugyanarra a helyre engedve nem hív mentést", () => {
        const setTodo = vi.fn();
        renderDnd(setTodo);
        dnd.endDrag({active: {id: "10"}, over: {id: "10"}});
        expect(setTodo).not.toHaveBeenCalled();
    });

    it("a listán kívül elengedve (nincs over) nem hív mentést", () => {
        const setTodo = vi.fn();
        renderDnd(setTodo);
        dnd.endDrag({active: {id: "10"}, over: null});
        expect(setTodo).not.toHaveBeenCalled();
    });
});
