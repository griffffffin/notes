import {describe, expect, it} from "vitest";
import type {Modifier} from "@dnd-kit/core";
import {restrictToList} from "./restrictToList";

/* A módosító a dnd-kit-től a húzás TELJES állapotát kapja meg (kilenc mező),
   ebből a restrictToList hármat használ. A típus SZÁRMAZTATOTT (`Parameters<
   Modifier>[0]`), nem egy kézzel átmásolt alak: ha a könyvtár egyszer átszabja a
   módosítók bemenetét, ez a teszt is elhasal — nem csak az éles kód. A segéd a
   nem használt mezőket üresen tölti ki, hogy a HÍVÁS alakja ugyanaz legyen, mint
   élesben; korábban a teszt három mezőt adott át kilenc helyett, és ez a
   különbség sehol nem látszott. */
type ModifierArgs = Parameters<Modifier>[0];

const modifierArgs = (
    transform: ModifierArgs["transform"],
    rects: Pick<ModifierArgs, "draggingNodeRect" | "containerNodeRect">,
): ModifierArgs => ({
    activatorEvent: null, active: null, activeNodeRect: null, over: null,
    overlayNodeRect: null, scrollableAncestors: [], scrollableAncestorRects: [],
    windowRect: null, transform, ...rects,
});

/* A húzott kártya a listán belül maradhat, azon kívülre nem. A modifier tiszta
   függvény (transform + a húzott elem és a konténer téglalapja → korlátozott
   transform), így a geometriája layout nélkül, közvetlenül ellenőrizhető. */
describe("restrictToList (húzás listára korlátozása)", () => {
    /* A húzott kártya téglalapja és a konténeré, minden teszthez ugyanaz.

       A dnd-kit `ClientRect`-je MIND A HAT mezőt megköveteli (top, bottom, left,
       right, width, height) — a valódi rect is mind a hatot hozza, hiszen egy
       kirajzolt elemből származik. A fixtúra korábban csak négyet adott meg, és
       ez a hiányosság nem volt látható: ha a modifier egyszer a `width`-hez
       nyúlna, `undefined`-dal számolna, és NaN-t adna vissza minden hibajelzés
       nélkül. A mostani értékek egymásból következnek (a kártya 50 széles és 50
       magas, a konténer 0-tól 500/1000-ig tart), tehát nem lehet ellentmondó
       téglalapot kapni. */
    const draggingNodeRect = {top: 100, bottom: 150, left: 0, right: 50, width: 50, height: 50};
    const containerNodeRect = {top: 0, left: 0, width: 500, height: 1000, right: 500, bottom: 1000};

    /* A `Transform` NÉGY mezős: az eltolás mellett a nagyítást is viszi. A húzás
       nálunk nem nagyít, ezért a skála mindenütt 1 — de kimondva, mert a 0 (amit
       egy hiányzó mező sugallna) összelapítaná az elemet. */
    const noScale = {scaleX: 1, scaleY: 1};

    it("rect nélkül az eredeti transformot adja vissza (nincs mit korlátozni)", () => {
        const transform = {x: 10, y: 20, ...noScale};
        expect(restrictToList(modifierArgs(transform, {draggingNodeRect: null, containerNodeRect: null}))).toBe(transform);
    });

    it("a lista teteje fölé húzott kártyát a tetőhöz igazítja", () => {
        // A kártya (top 100) 200-zal felfelé (y=-200) a konténer teteje (0) fölé
        // menne; a korlát: y = konténer.top - kártya.top = 0 - 100 = -100.
        const result = restrictToList(modifierArgs({x: 0, y: -200, ...noScale}, {draggingNodeRect, containerNodeRect}));
        expect(result.y).toBe(-100);
    });

    it("a lista alja alá húzott kártyát az aljhoz igazítja", () => {
        // A kártya (bottom 150) 2000-rel lefelé a konténer alja (0+1000) alá menne;
        // a korlát: y = konténer.top + height - kártya.bottom = 1000 - 150 = 850.
        const result = restrictToList(modifierArgs({x: 0, y: 2000, ...noScale}, {draggingNodeRect, containerNodeRect}));
        expect(result.y).toBe(850);
    });
});
