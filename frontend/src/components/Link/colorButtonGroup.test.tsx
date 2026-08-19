import {render, screen} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {describe, expect, it, vi} from "vitest";
import ColorButtonGroup from "./colorButtonGroup";
import {TODO_COLOR_NAMES} from "../../todoColors";

/* A navbar szín-szűrője a paletta EGYETLEN forrásából (todoColors.ts) épül, de
   FORDÍTVA rendereli — a korongok float-end-del úsznak, tehát az elsőként kirakott
   kerül legjobbra. Ez a megfordítás némán elromolhatna: a lap ugyanúgy működne,
   csak a színek sorrendje lenne a szerkesztő színválasztójának tükörképe. A jsdom
   nem számol elrendezést, tehát a float hatását nem látjuk — a DOM-SORRENDET
   viszont igen, és a szándékot az rögzíti. */
const renderGroup = () => render(
    <MemoryRouter>
        <ColorButtonGroup onClick={vi.fn()}/>
    </MemoryRouter>
);

/* A `getAttribute` `null`-t ad, ha a gombon NINCS `value` — a hiányt tehát
   kiszűrjük, és külön állítjuk, hogy nem is volt ilyen. Enélkül a `null`-ok
   csendben belekerülnének az összehasonlításba, és egy elfelejtett `value`
   attribútum "csak" annyit okozna, hogy a lista nem egyezik — a hibaüzenetből
   pedig nem derülne ki, hogy attribútum hiányzik, nem szín. */
const renderedColors = () => {
    const values = screen.getAllByRole("button").map((button) => button.getAttribute("value"));
    expect(values.filter((value) => value === null)).toEqual([]);
    return values.filter((value) => value !== null);
};

describe("ColorButtonGroup (navbar szín-szűrő)", () => {
    it("a paletta MINDEN színét kirakja, egyszer", () => {
        renderGroup();

        /* A `toSorted()` hasonlító NÉLKÜL a SZÖVEGGÉ alakított alakot rendezi —
           számoknál ettől lesz [1, 10, 2]. Itt színnevek állnak, tehát az
           eredmény ma helyes, de a szándékot kimondjuk: ábécésorrend. */
        const byName = (first: string, second: string) => first.localeCompare(second);
        expect(renderedColors().toSorted(byName)).toEqual(TODO_COLOR_NAMES.toSorted(byName));
    });

    it("a DOM-sorrend a paletta FORDÍTOTTJA (a float-end miatt lesz belőle helyes látvány)", () => {
        renderGroup();

        expect(renderedColors()).toEqual(TODO_COLOR_NAMES.toReversed());
    });
});
