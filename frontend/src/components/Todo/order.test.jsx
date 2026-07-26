import {act, fireEvent, render, screen} from "@testing-library/react";
import {useState} from "react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import Order, {STEP_DELAY_MS} from "./order";

// A tooltip nem tartozik a léptetéshez, a saját stílusaival csak zajt vinne.
vi.mock("react-tooltip", () => ({Tooltip: () => null}));

/* Az Order nem tárolja a sorszámot, hanem a szülőét lépteti — ezért a szülőt is
   meg kell játszanunk, különben a lépés sehol nem látszana. */
function Parent({start = 8, last = 10}) {
    const [order, setOrder] = useState(start);
    return <Order current={order} setOrder={setOrder} last={last} color="warning" colorHex="#ffc107"/>;
}

const minus = (container) => container.querySelector(".bi-dash-circle");
const plus = (container) => container.querySelector(".bi-plus-circle");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Order", () => {
    /* EZ a legfontosabb teszt: a léptetőt kattintással használják. Egy korábbi
       javításom épp ezt törte el (a takarítás eldobta a kattintás egyetlen
       időzítőjét), és öt zöld teszt mellett ment ki — mert mind a nyomva
       tartást vizsgálta. */
    it("kattintásra pontosan egyet lép", () => {
        const {container} = render(<Parent/>);

        fireEvent.mouseDown(minus(container));
        act(() => vi.advanceTimersByTime(STEP_DELAY_MS / 2));   // a késleltetésnél rövidebb: még nem lépett
        fireEvent.mouseUp(minus(container));
        act(() => vi.advanceTimersByTime(2000));

        expect(screen.getByText("7")).toBeInTheDocument();
    });

    it("a plusz gomb kattintásra is pontosan egyet lép", () => {
        const {container} = render(<Parent/>);

        fireEvent.mouseDown(plus(container));
        act(() => vi.advanceTimersByTime(STEP_DELAY_MS / 2));
        fireEvent.mouseUp(plus(container));
        act(() => vi.advanceTimersByTime(2000));

        expect(screen.getByText("9")).toBeInTheDocument();
    });

    it("nyomva tartva ismételve léptet", () => {
        const {container} = render(<Parent/>);

        fireEvent.mouseDown(minus(container));
        act(() => vi.advanceTimersByTime(STEP_DELAY_MS));
        expect(screen.getByText("7")).toBeInTheDocument();
        act(() => vi.advanceTimersByTime(STEP_DELAY_MS));
        expect(screen.getByText("6")).toBeInTheDocument();
    });

    it("elengedés után nem szalad túl", () => {
        const {container} = render(<Parent/>);

        fireEvent.mouseDown(minus(container));
        act(() => vi.advanceTimersByTime(STEP_DELAY_MS));
        expect(screen.getByText("7")).toBeInTheDocument();

        fireEvent.mouseUp(minus(container));
        act(() => vi.advanceTimersByTime(2000));

        // A már beütemezett következő lépést a takarítás leállítja.
        expect(screen.getByText("7")).toBeInTheDocument();
    });

    it("a plusz gomb sem szalad túl elengedés után", () => {
        const {container} = render(<Parent/>);

        fireEvent.mouseDown(plus(container));
        act(() => vi.advanceTimersByTime(STEP_DELAY_MS));
        expect(screen.getByText("9")).toBeInTheDocument();

        fireEvent.mouseUp(plus(container));
        act(() => vi.advanceTimersByTime(2000));

        expect(screen.getByText("9")).toBeInTheDocument();
    });

    /* A JAVÍTOTT hiba regressziós tesztje: az elengedés a gombon KÍVÜL történik (a
       document.body-n, nem az SVG-n). A régi kód az onMouseUp-ot csak a gombra
       kötötte, így ez az elengedés elkerülte, és a léptető pörgött tovább — főleg
       fölfelé, ahol nincs közeli határ. Az elengedés-figyelő most a window-on van,
       ezért bárhol felengedve megáll. (A body-ra dobott mouseup a window-ig
       buborékol, de a gomb SVG-jét — ami nem őse a body-nak — sosem érné el.) */
    it("a gombon KÍVÜL felengedve is megáll (nem szalad túl)", () => {
        const {container} = render(<Parent/>);

        fireEvent.mouseDown(plus(container));
        act(() => vi.advanceTimersByTime(STEP_DELAY_MS));
        expect(screen.getByText("9")).toBeInTheDocument();

        // Elengedés máshol, NEM a + gombon:
        fireEvent.mouseUp(document.body);
        act(() => vi.advanceTimersByTime(2000));

        expect(screen.getByText("9")).toBeInTheDocument();
    });

    it("az alsó határon (1) nem lép tovább lefelé", () => {
        const {container} = render(<Parent start={1}/>);

        fireEvent.mouseDown(minus(container));
        act(() => vi.advanceTimersByTime(2000));

        expect(screen.getByText("1")).toBeInTheDocument();
    });

    it("a felső határon megáll", () => {
        const {container} = render(<Parent start={10} last={10}/>);

        fireEvent.mouseDown(plus(container));
        act(() => vi.advanceTimersByTime(2000));

        /* A last a MEGLÉVŐ elemek száma; az új elem eggyel több pozíciót nyit, így
           a legnagyobb választható sorszám last+1 = 11 — eddig enged a stepper, és
           ott áll meg. (Alapból az első helyre, 1-re kerülne; ez a teszt a felső
           határt nézi.) */
        expect(screen.getByText("11")).toBeInTheDocument();
    });
});
