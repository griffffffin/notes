import {describe, expect, it} from "vitest";
import {restrictToList} from "./restrictToList";

/* A húzott kártya a listán belül maradhat, azon kívülre nem. A modifier tiszta
   függvény (transform + a húzott elem és a konténer téglalapja → korlátozott
   transform), így a geometriája layout nélkül, közvetlenül ellenőrizhető. */
describe("restrictToList (húzás listára korlátozása)", () => {
    // A húzott kártya téglalapja és a konténeré, minden teszthez ugyanaz.
    const draggingNodeRect = {top: 100, bottom: 150, left: 0, right: 50};
    const containerNodeRect = {top: 0, left: 0, width: 500, height: 1000};

    it("rect nélkül az eredeti transformot adja vissza (nincs mit korlátozni)", () => {
        const transform = {x: 10, y: 20};
        expect(restrictToList({transform, draggingNodeRect: null, containerNodeRect: null})).toBe(transform);
    });

    it("a lista teteje fölé húzott kártyát a tetőhöz igazítja", () => {
        // A kártya (top 100) 200-zal felfelé (y=-200) a konténer teteje (0) fölé
        // menne; a korlát: y = konténer.top - kártya.top = 0 - 100 = -100.
        const result = restrictToList({transform: {x: 0, y: -200}, draggingNodeRect, containerNodeRect});
        expect(result.y).toBe(-100);
    });

    it("a lista alja alá húzott kártyát az aljhoz igazítja", () => {
        // A kártya (bottom 150) 2000-rel lefelé a konténer alja (0+1000) alá menne;
        // a korlát: y = konténer.top + height - kártya.bottom = 1000 - 150 = 850.
        const result = restrictToList({transform: {x: 0, y: 2000}, draggingNodeRect, containerNodeRect});
        expect(result.y).toBe(850);
    });
});
