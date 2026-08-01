import {afterEach, describe, expect, it} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ValidationTooltip from "./validationTooltip";
import Order from "../Todo/order";
import {resetTooltips} from "../../tooltipRegistry";

afterEach(resetTooltips);

// A fieldAnchor visszatérési értékének alakja — a buborék ezt kapja state-ként.
const validation = {anchor: "#field", name: "idézet", pos: {x: 80, y: 46}};

const MESSAGE = "Az idézet kitöltése kötelező.";

/* LÁTSZIK-e a buborék? A puszta "benne van a DOM-ban" nem elég: a react-tooltip a
   már egyszer megmutatott buborékot a lapon HAGYJA, csak elrejti — a látható
   állapotot a "react-tooltip__show" osztály jelöli. (A tényleges elrejtést a
   könyvtár CSS-e végzi, ami jsdomban nem fut le, ezért az osztályt nézzük.) */
const isShown = (text) => {
    const content = screen.queryByText(text);
    return Boolean(content?.closest(".react-tooltip")?.classList.contains("react-tooltip__show"));
};

describe("ValidationTooltip", () => {
    it("hiba nélkül nincs buborék a lapon", () => {
        render(<ValidationTooltip id="v" validation={null}/>);

        expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    });

    it("hibánál a mező nevével kiírja a kötelező-üzenetet", async () => {
        render(<ValidationTooltip id="v" validation={validation}/>);

        await waitFor(() => expect(isShown(MESSAGE)).toBe(true));
    });

    /* A buborék NEM nyeli el a kattintást — az app többi tooltipjével egységesen
       nem "clickable", tehát pointer-events: none van rajta, és a rajta ejtett
       kattintás az ALATTA lévő mezőt éri. A tényleges átkattintást jsdomban nem
       lehet ellenőrizni (nincs elrendezés, és a könyvtár CSS-e sem fut le), a
       react-tooltip viszont osztályban is jelöli a kattinthatóságot — ezt fogjuk
       meg, hogy egy visszacsúszó `clickable` ne maradjon némán a kódban. */
    it("a buborék nem kattintható felület", async () => {
        render(<ValidationTooltip id="v" validation={validation}/>);
        await waitFor(() => expect(isShown(MESSAGE)).toBe(true));

        expect(screen.getByText(MESSAGE).closest(".react-tooltip").className).not.toMatch(/clickable/);
    });

    /* Egyszerre egy buborék: a léptető súgójának megnyílása elteszi a hibabuborékot,
       hogy ne takarják egymást. A léptetőt VALÓDI komponensként rendereljük — a
       szabály attól ér valamit, hogy a két külön komponens tényleg tud egymásról. */
    it("egy másik tooltip megnyílása eltünteti a hibabuborékot", async () => {
        render(<>
            <ValidationTooltip id="v" validation={validation}/>
            <Order current={1} setOrder={() => {}} last={3} color="theme"/>
        </>);
        await waitFor(() => expect(isShown(MESSAGE)).toBe(true));

        await userEvent.hover(screen.getByText("1"));

        await waitFor(() => expect(isShown("Sorszám")).toBe(true));
        expect(isShown(MESSAGE)).toBe(false);
    });
});
