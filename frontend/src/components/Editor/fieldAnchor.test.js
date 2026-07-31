import {afterEach, beforeAll, describe, expect, it} from "vitest";
import {fieldAnchor} from "./fieldAnchor";

/* A jsdom nem ad valódi canvast (nincs szövegrajzolás), ezért a measureText-et
   rögzített szélességre cseréljük: a mérés MENETÉT teszteljük, nem a betűk
   tényleges méretét. 40 px széles "szöveg" → 20 px félszélesség. */
beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = () => ({font: "", measureText: () => ({width: 40})});
});

const addField = (attrs) => {
    const input = document.createElement("input");
    Object.assign(input, attrs);
    input.id = "field";
    // A jsdom nem számol elrendezést: a padding az egyetlen, amit a
    // getComputedStyle valósághűen ad vissza (inline stílusból).
    input.style.paddingLeft = "10px";
    input.style.paddingTop = "4px";
    document.body.appendChild(input);
    return input;
};

afterEach(() => { document.body.innerHTML = ""; });

describe("fieldAnchor", () => {
    it("a mező NEVE a placeholderből jön, kis kezdőbetűvel", () => {
        addField({placeholder: "Kategória"});

        expect(fieldAnchor("#field").name).toBe("kategória");
    });

    it("a név FELÜLÍRHATÓ (hosszú placeholder, rövid hibaüzenet)", () => {
        addField({placeholder: "Idézet szövege"});

        // A buborék "Az idézet kitöltése kötelező."-t mond, nem a teljes placeholdert.
        expect(fieldAnchor("#field", "idézet").name).toBe("idézet");
    });

    it("a horgony a kapott szelektor marad (ezen ül a tooltip)", () => {
        addField({placeholder: "Cím"});

        expect(fieldAnchor("#field").anchor).toBe("#field");
    });

    /* A pozíció a PLACEHOLDER KÖZEPE, nem a mező közepe: a bal padding után a
       szöveg félszélességével beljebb. Ez a lényegi számítás — ha elromlik, a
       buborék nyila egy hosszú mezőnél a szövegtől messze mutatna. */
    it("a vízszintes pozíció a bal padding + a placeholder félszélessége", () => {
        addField({placeholder: "Cím"});

        // left (jsdom: 0) + paddingLeft (10) + 40/2 = 30
        expect(fieldAnchor("#field").pos.x).toBe(30);
    });

    it("a függőleges pozíció a felső padding + egy sormagasságnyi (font-size)", () => {
        addField({placeholder: "Cím"});

        // top (jsdom: 0) + paddingTop (4) + fontSize (jsdom alap: 16) = 20
        expect(fieldAnchor("#field").pos.y).toBe(20);
    });
});
