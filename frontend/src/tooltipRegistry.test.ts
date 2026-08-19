import {afterEach, describe, expect, it} from "vitest";
import {renderHook, act} from "@testing-library/react";
import {resetTooltips, setTooltipOpen, useTooltipOpen} from "./tooltipRegistry";

afterEach(resetTooltips);

/* A nyilvántartás lényege egyetlen szabály: EGYSZERRE EGY tooltip lehet nyitva.
   A hookot azért teszteljük (és nem csak a modul belsejét), mert a komponensek
   ezen át kapják az isOpen propjukat — az újrarajzolás elmaradása ugyanolyan
   hiba, mint a rossz érték. */
/* KETTŐ tooltipet állít be, és FIX HOSSZÚ tuple-t ad vissza (`as const`), nem
   tömböt. A különbség a destrukturálásnál látszik: egy `string[]`-ből származó
   tömb elemei elvileg hiányozhatnak (`| undefined`), egy két elemű tuple-éi
   nem — a tesztek pedig mindig pontosan kettővel dolgoznak. A második
   azonosító elhagyható: van egy eset, ami egyetlen tooltipet vizsgál. */
const arrangeTooltips = (firstId: string, secondId = "masodik-tooltip") =>
    [renderHook(() => useTooltipOpen(firstId)),
     renderHook(() => useTooltipOpen(secondId))] as const;

describe("tooltipRegistry", () => {
    it("alapból egyik tooltip sincs nyitva", () => {
        const [first, second] = arrangeTooltips("a", "b");

        expect(first.result.current).toBe(false);
        expect(second.result.current).toBe(false);
    });

    it("a megnyitott tooltip nyitva van, a többi nem", () => {
        const [first, second] = arrangeTooltips("a", "b");

        act(() => setTooltipOpen("a", true));

        expect(first.result.current).toBe(true);
        expect(second.result.current).toBe(false);
    });

    // EZ a lényeg: a második megnyílása becsukja az elsőt, külön zárás nélkül.
    it("egy másik tooltip megnyitása BECSUKJA a korábban nyitottat", () => {
        const [first, second] = arrangeTooltips("a", "b");
        act(() => setTooltipOpen("a", true));

        act(() => setTooltipOpen("b", true));

        expect(first.result.current).toBe(false);
        expect(second.result.current).toBe(true);
    });

    /* A záró esemény késve is megérkezhet (a react-tooltip a hover elhagyását
       késleltetve küldi): ilyenkor a MÁR MÁSIKAT mutató nyilvántartást nem
       nullázhatja le a távozó buborék. */
    it("egy már becsukott tooltip zárása nem csukja be a közben megnyílt másikat", () => {
        const [first, second] = arrangeTooltips("a", "b");
        act(() => setTooltipOpen("a", true));
        act(() => setTooltipOpen("b", true));

        act(() => setTooltipOpen("a", false));

        expect(first.result.current).toBe(false);
        expect(second.result.current).toBe(true);
    });

    it("a saját zárása becsukja", () => {
        const [first] = arrangeTooltips("a");
        act(() => setTooltipOpen("a", true));

        act(() => setTooltipOpen("a", false));

        expect(first.result.current).toBe(false);
    });
});
