import type {Tasks} from "../../types/api";

/* A TO-DO SZERKESZTŐJÉNEK MUNKAPÉLDÁNYA — az az alak, amiben a félkész to-do a
   szerkesztő state-jében él, amíg a mentés el nem küldi.

   SZÁNDÉKOSAN nem azonos a hálózati `Todo`-val (types/api.ts). A dróton a
   sorrend egy sima `taskOrder: number[]` mező a to-dón; itt viszont egy
   `columns` objektum tartja, egyetlen "createColumn" nevű oszloppal, és mellette
   egy `columnOrder` tömb ezzel az egy névvel. Ez a Trello-szerű oszlop-szerkezet
   a régi (2022-es) kódból való öröklés: akkor több oszlop is elképzelhető volt.
   Ma egy van, de a szerkesztő végig ezt a burkolót mozgatja, és a mentés (save)
   bontja ki belőle a lapos `taskOrder`-t.

   Miért él ez a típus akkor is, ha a szerkezet öröklött? Mert eddig SEHOL nem
   volt leírva: minden komponens a `todo.columns["createColumn"].taskOrder`
   láncot gépelte be újra, és egy elgépelt szint néma `undefined`-ként jelent
   volna meg. Innentől a fordító tartja számon, mi van benne. (Ha a szerkezetet
   egyszer laposítjuk, ez a fájl lesz a leltár arról, mit kell átírni.) */

/* Az EGYETLEN oszlop. Az `id` a saját nevét ismétli — szintén öröklés (a régi
   kódban az oszlopok azonosítóval hivatkoztak egymásra); ma redundáns, de a
   mentés és a tesztek is ezt az alakot várják, ezért nem itt vesszük ki. */
type TodoDraftColumn = {
    id: string;
    /* A listaelemek sorrendje, SZÁM-azonosítókkal — miközben a `Task.id`
       stringet tárol. A kettősség öröklött; a dnd-kit felé mindkét oldal
       `toString()`-gel normalizál (l. DragAndDrop/task.tsx). */
    taskOrder: number[];
};

export type TodoDraft = {
    tasks: Tasks;
    columns: {createColumn: TodoDraftColumn};
    columnOrder: string[];
};

/* A szerkesztő két KÉSZÍTŐ függvénye. Nem állítanak state-et és nem mutálnak:
   egy ÚJ draftot adnak vissza a kért változtatással, amit a hívó ad tovább a
   `setTodo`-nak (`setTodo(setTask(...))`). A típusuk itt él, mert a save.tsx-től
   a Task-ig három szinten utaznak proppként — egy helyen leírva nem tud a három
   leírás elcsúszni egymástól. */
export type SetTask = (key: number, content: string, isDone: boolean) => TodoDraft;
export type SetTaskOrder = (taskOrder: number[]) => TodoDraft;
