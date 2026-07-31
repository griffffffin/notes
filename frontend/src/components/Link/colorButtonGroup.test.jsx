import {render, screen} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {describe, expect, it, vi} from "vitest";
import ColorButtonGroup from "./colorButtonGroup";
import {TODO_COLORS} from "../../todoColors";

/* A navbar szín-szűrője a paletta EGYETLEN forrásából (todoColors.js) épül, de
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

const renderedColors = () => screen.getAllByRole("button")
    .map((button) => button.getAttribute("value"));

describe("ColorButtonGroup (navbar szín-szűrő)", () => {
    it("a paletta MINDEN színét kirakja, egyszer", () => {
        renderGroup();

        expect(renderedColors().toSorted()).toEqual(Object.keys(TODO_COLORS).toSorted());
    });

    it("a DOM-sorrend a paletta FORDÍTOTTJA (a float-end miatt lesz belőle helyes látvány)", () => {
        renderGroup();

        expect(renderedColors()).toEqual(Object.keys(TODO_COLORS).toReversed());
    });
});
