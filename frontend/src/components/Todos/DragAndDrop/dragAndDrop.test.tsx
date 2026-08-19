import {render} from "@testing-library/react";
import {memo} from "react";
import type {ComponentProps} from "react";
import {describe, expect, it, vi} from "vitest";
import DragAndDrop from "./dragAndDrop";
import type {DragEndEvent} from "@dnd-kit/core";
import type {TodoDraft} from "../todoDraft";
import {dragEndEvent} from "../../../test/dndEvents";
import {at} from "../../../test/at";

/* Valódi húzást jsdom-ban nem tudunk lejátszani (nincs elrendezés). A húzás VÉGE
   viszont egy sima függvényhívás (onDragEnd), amit a DndContext ad át — ezt
   kapjuk el, és hívjuk közvetlenül.

   A pótlék `memo`-val készül, mert a valódi DndContext típusa
   `NamedExoticComponent` — egy nyers függvénykomponens nem áll a helyére. A
   `vi.mock` import()-tal veszi át a modult: így az `importOriginal()` a modul
   VALÓDI típusát adja (a `...actual` szórás enélkül `unknown`-on dolgozna), és a
   pótlék propjai is a valódi szerződéshez méretnek. */
/* A kém alakja KIMONDVA, és a gyár VISSZATÉRÉSI TÍPUSAKÉNT megadva — nem
   `null as (…) | null` alakban. A kettő nem ugyanaz: az `as` csak ÁLLÍTJA, hogy a
   `null` ilyen típusú (a fordító elhiszi), az annotáció viszont ELLENŐRZI, hogy a
   visszaadott objektum tényleg ilyen. A `null` kezdőérték típusát így is ki kell
   mondani (különben a fordító örökre `null`-ra szűkítené a mezőt — l. CLAUDE.md,
   "Kezdőérték ≠ típus"), csak épp ellenőrzött módon. */
type DndSpy = {endDrag: ((event: DragEndEvent) => void) | null};
const dnd = vi.hoisted((): DndSpy => ({endDrag: null}));

vi.mock(import("@dnd-kit/core"), async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        DndContext: memo(({children, onDragEnd}) => {
            dnd.endDrag = onDragEnd ?? null;
            return children;
        }),
    };
});

/* A húzás-eseményt a közös építő adja (test/dndEvents.ts): a `dnd.endDrag`
   null-vizsgálata nem formaság — ha a pótlék egyszer nem kapná meg az
   onDragEnd-et, a teszt ITT bukna, beszédesen, nem egy "not a function"-nel. */
const endDrag = (activeId: string, overId: string | null) => {
    if (!dnd.endDrag) throw new Error("a DndContext-pótlék nem kapott onDragEnd-et");
    dnd.endDrag(dragEndEvent(activeId, overId));
};

const makeTodo = (): TodoDraft => ({
    columns: {createColumn: {id: "createColumn", taskOrder: [10, 20, 30]}},
    columnOrder: ["createColumn"],
    tasks: {
        10: {id: "10", content: "első", done: false},
        20: {id: "20", content: "második", done: false},
        30: {id: "30", content: "harmadik", done: false},
    },
});

/* A `setTodo` típusa a KOMPONENSTŐL származik, nem kézzel odaírva: a
   szerkesztő state-settere `Dispatch<SetStateAction<TodoDraft>>`, tehát frissítő
   FÜGGVÉNYT is kaphat — egy szűkebb `(todo) => void` nem állna a helyén. */
const renderDnd = (setTodo: ComponentProps<typeof DragAndDrop>["setTodo"]) => render(
    <DragAndDrop todo={makeTodo()} setTodo={setTodo} setTaskOrder={vi.fn()} setTask={vi.fn()} color="warning"/>,
);

describe("Listaelem-húzás sorrendezése", () => {
    it("átrendezi a taskOrder-t, és SZÁM-azonosítókat ment (nem stringet)", () => {
        const setTodo = vi.fn();
        renderDnd(setTodo);
        // Az első elemet (id 10) a harmadik (id 30) helyére. A dnd-kit stringként
        // adja az azonosítót — a mentett sorrendnek mégis számnak kell maradnia,
        // mert a backend azt várja (a régi @hello-pangea óta).
        endDrag("10", "30");
        expect(setTodo).toHaveBeenCalledOnce();
        const saved = at(at(setTodo.mock.calls, 0, "setTodo-hívás"), 0).columns.createColumn.taskOrder;
        expect(saved).toEqual([20, 30, 10]);
        expect(saved.every((id: unknown) => typeof id === "number")).toBe(true);
    });

    it("ugyanarra a helyre engedve nem hív mentést", () => {
        const setTodo = vi.fn();
        renderDnd(setTodo);
        endDrag("10", "10");
        expect(setTodo).not.toHaveBeenCalled();
    });

    it("a listán kívül elengedve (nincs over) nem hív mentést", () => {
        const setTodo = vi.fn();
        renderDnd(setTodo);
        endDrag("10", null);
        expect(setTodo).not.toHaveBeenCalled();
    });
});
