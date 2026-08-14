import type {
    Active, ClientRect, DragEndEvent, DragStartEvent, Over, UniqueIdentifier,
} from "@dnd-kit/core";

/* HÚZÁS-ESEMÉNYEK a dnd-kit alakjában.

   Valódi húzást jsdomban nem lehet lejátszani: nincs benne elrendezés, tehát a
   könyvtár nem tudja kiszámolni, mi fölött járunk. A húzás VÉGE viszont egy sima
   függvényhívás (onDragEnd), amit a DndContext ad át — a tesztek ezt kapják el és
   hívják közvetlenül. Ehhez viszont ESEMÉNYT kell gyártani.

   A tesztek eddig egy `{active: {id: "10"}, over: {id: "30"}}` alakú fércművet
   adtak át. A valódi esemény öt mezős (activatorEvent, active, collisions, delta,
   over), és az `active`/`over` maga is három-négy mezős. A különbség nem elméleti:
   a mért kód ma csak az azonosítókat olvassa, de bármikor hozzányúlhatna a
   `delta`-hoz vagy az `over.rect`-hez — és `undefined`-dal számolna, némán.

   Ami a húzás EREDMÉNYE szempontjából lényegtelen, az itt üres, de JELEN VAN: a
   `data` üres ref (a dnd-kit is így adja, ha nincs adat a húzott elemen), a
   téglalapok nullák (jsdomban úgysincs elrendezés), az elmozdulás nulla, és
   ütközés-lista sincs (azt a könyvtár a saját algoritmusával tölti). */

const EMPTY_RECT: ClientRect = {top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0};

function activeItem(id: UniqueIdentifier): Active {
    return {id, data: {current: undefined}, rect: {current: {initial: null, translated: null}}};
}

function overItem(id: UniqueIdentifier): Over {
    return {id, rect: EMPTY_RECT, disabled: false, data: {current: undefined}};
}

/* A húzás vége. Az `overId: null` a "listán kívül engedte el" eset — a dnd-kit is
   null `over`-rel jelzi, és a mért kódnak ilyenkor nem szabad mentenie. */
export function dragEndEvent(activeId: UniqueIdentifier, overId: UniqueIdentifier | null): DragEndEvent {
    return {
        activatorEvent: new Event("pointerdown"),
        active: activeItem(activeId),
        collisions: null,
        delta: {x: 0, y: 0},
        over: overId === null ? null : overItem(overId),
    };
}

// A húzás kezdete: ebből a könyvtár is csak a húzott elemet és a kiváltó eseményt adja.
export function dragStartEvent(activeId: UniqueIdentifier): DragStartEvent {
    return {activatorEvent: new Event("pointerdown"), active: activeItem(activeId)};
}
