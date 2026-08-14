/* Elem kikeresése a tesztekben, HAZUGSÁG NÉLKÜL.

   A `document.querySelector("dialog")` típusa `Element | null`, és ezen sem
   `.open`, sem `.value` nincs. A kényelmes megoldás egy `as HTMLDialogElement`
   vagy egy `querySelector<HTMLDialogElement>(…)` volna — csakhogy egyik sem
   ellenőriz semmit: közlik a fordítóval, hogy higgyen nekünk. Ha a szelektor
   egyszer mást talál (vagy semmit), a hiba nem ott jelentkezik, ahol keletkezett,
   hanem valahol lejjebb, egy értelmezhetetlen "cannot read property of null"
   alakjában. A projekt ezért tiltja az `as`-t (l. CLAUDE.md).

   Itt a típus a KONSTRUKTORBÓL jön, és futásidejű `instanceof` igazolja: a
   `requireElement("dialog", HTMLDialogElement)` vagy tényleg egy dialógust ad,
   vagy azonnal dob, a szelektort és a várt típust megnevezve. A tesztben egy
   dobás pontosan olyan jó, mint egy bukott állítás — csak beszédesebb.

   A `type` paraméter `abstract new (…)`, mert a DOM-osztályok (HTMLElement és
   társai) absztraktként vannak deklarálva a lib.dom.d.ts-ben: a `new
   HTMLDialogElement()` nem hívható, de `instanceof`-hoz és típusforrásnak
   tökéletes. */
export function requireElement<T extends Element>(
    selector: string,
    type: abstract new (...args: never[]) => T,
    root: ParentNode = document,
): T {
    const found = root.querySelector(selector);
    if (!(found instanceof type)) {
        throw new Error(
            `requireElement: a(z) "${selector}" szelektorra nem ${type.name} jött, hanem: ` +
            `${found === null ? "semmi" : found.constructor.name}`);
    }
    return found;
}
