import {act, fireEvent, render, screen} from "@testing-library/react";
import {useState} from "react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import Order from "./order";

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
        act(() => vi.advanceTimersByTime(50));    // 200 ms-nál rövidebb: még nem lépett
        fireEvent.mouseUp(minus(container));
        act(() => vi.advanceTimersByTime(2000));

        expect(screen.getByText("7")).toBeInTheDocument();
    });

    it("a plusz gomb kattintásra is pontosan egyet lép", () => {
        const {container} = render(<Parent/>);

        fireEvent.mouseDown(plus(container));
        act(() => vi.advanceTimersByTime(50));
        fireEvent.mouseUp(plus(container));
        act(() => vi.advanceTimersByTime(2000));

        expect(screen.getByText("9")).toBeInTheDocument();
    });

    it("nyomva tartva ismételve léptet", () => {
        const {container} = render(<Parent/>);

        fireEvent.mouseDown(minus(container));
        act(() => vi.advanceTimersByTime(200));
        expect(screen.getByText("7")).toBeInTheDocument();
        act(() => vi.advanceTimersByTime(200));
        expect(screen.getByText("6")).toBeInTheDocument();
    });

    it("elengedés után nem szalad túl", () => {
        const {container} = render(<Parent/>);

        fireEvent.mouseDown(minus(container));
        act(() => vi.advanceTimersByTime(200));
        expect(screen.getByText("7")).toBeInTheDocument();

        fireEvent.mouseUp(minus(container));
        act(() => vi.advanceTimersByTime(2000));

        // A már beütemezett következő lépést a takarítás leállítja.
        expect(screen.getByText("7")).toBeInTheDocument();
    });

    it("a plusz gomb sem szalad túl elengedés után", () => {
        const {container} = render(<Parent/>);

        fireEvent.mouseDown(plus(container));
        act(() => vi.advanceTimersByTime(200));
        expect(screen.getByText("9")).toBeInTheDocument();

        fireEvent.mouseUp(plus(container));
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

        /* A last a már meglévő elemek száma, az új elem a lista VÉGÉRE, tehát
           last+1-re is kerülhet — ezért enged a feltétel 11-ig, és ott áll meg. */
        expect(screen.getByText("11")).toBeInTheDocument();
    });
});
