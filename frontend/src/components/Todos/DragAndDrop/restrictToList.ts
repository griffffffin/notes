import type {Modifier} from "@dnd-kit/core";

/* A kártya ne hagyhassa el a listát.

   Miért kell: a húzott kártya CSS-eltolással mozog, az eltolt elem pedig
   MEGNÖVELI a lap görgethető területét. Ha a lista alá húzod, a böngésző
   hirtelen ad még görgethető helyet, az auto-görgetés követi, attól még több
   hely lesz — és a kártya elszabadul a "semmibe". Ugyanez oldalra. Fölfelé és
   balra ez nem fordulhat elő: negatív irányba a böngésző NEM hoz létre
   görgethető területet. (A user mindkét irányban észrevette pont ezt az
   aszimmetriát.)

   Egy módosító nem több, mint egy függvény: megkapja a húzás eltolását, és
   visszaadja a MEGENGEDETTET. A konténer a kártya szülője, vagyis a lista sora
   — a kártya azon belül bárhova mehet, azon kívülre nem. Egy oszlopban ez
   ingyen adja a "csak függőlegesen" viselkedést is: ott a kártya kitölti a sor
   szélességét, tehát vízszintesen nincs hova mozdulnia.

   Az auto-görgetést NEM akadályozza: a sor a képernyőnél magasabb, tehát a
   kártya bőven kilóghat a látható rész fölé/alá — csak a listán túlra nem.

   A `Modifier` a dnd-kit saját típusa, és többet ad, mint a paraméterek
   megnevezése: a könyvtár EBBŐL tudja, hogy a függvényünk a helyén van. Ha a
   dnd-kit egyszer megváltoztatja a módosítók alakját (más mezőnevek, más
   visszatérési érték), az frissítéskor fordítási hibaként jön elő — nem pedig
   úgy, hogy a húzás csendben már nem korlátozódik, és a kártya megint
   elszabadul. Pontosan az a fajta néma elromlás, ami ezt a fájlt megszülte. */
export const restrictToList: Modifier = ({transform, draggingNodeRect, containerNodeRect}) => {
    if (!draggingNodeRect || !containerNodeRect) return transform;
    const limited = {...transform};

    if (draggingNodeRect.top + transform.y <= containerNodeRect.top)
        limited.y = containerNodeRect.top - draggingNodeRect.top;
    else if (draggingNodeRect.bottom + transform.y >= containerNodeRect.top + containerNodeRect.height)
        limited.y = containerNodeRect.top + containerNodeRect.height - draggingNodeRect.bottom;

    if (draggingNodeRect.left + transform.x <= containerNodeRect.left)
        limited.x = containerNodeRect.left - draggingNodeRect.left;
    else if (draggingNodeRect.right + transform.x >= containerNodeRect.left + containerNodeRect.width)
        limited.x = containerNodeRect.left + containerNodeRect.width - draggingNodeRect.right;

    return limited;
};
