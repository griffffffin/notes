import {describe, expect, it, vi} from "vitest";
import {saveWithRetry} from "./saveRetry";

/* AZ ÚJRAPRÓBÁLÁS tesztjei.

   Amit bizonyítani kell: a múló hiba után tényleg van MÁSODIK (és harmadik)
   próba, a tartós hiba után viszont FELADJUK — és pontosan akkor kerül elő a
   piszkozat, nem előbb. A "nem adjuk fel túl korán" és a "nem próbálkozunk a
   végtelenségig" ugyanannak az éremnek a két oldala.

   Az idő NEM valódi: az időzítőt a teszt adja át (`schedule`), és azonnal
   lefuttatja a visszahívást. Így az egész sorozat ezredmásodpercek alatt lefut,
   és a teszt nem függ a gép terhelésétől. */

// Azonnali időzítő: a várakozást KIHAGYJUK, de a HOSSZÁT rögzítjük.
const immediate = (delays: number[]) => (callback: () => void, delayMs: number) => {
    delays.push(delayMs);
    callback();
};

describe("saveWithRetry", () => {
    it("siker esetén EGYSZER próbálkozik", async () => {
        const attempt = vi.fn((onSuccess: () => void) => onSuccess());
        const onGiveUp = vi.fn();

        await saveWithRetry(attempt, onGiveUp, immediate([]));

        expect(attempt).toHaveBeenCalledTimes(1);
        expect(onGiveUp).not.toHaveBeenCalled();
    });

    it("MÚLÓ hiba után a második próba sikerül — a hívó ebből semmit nem lát", async () => {
        let calls = 0;
        const attempt = (onSuccess: () => void, onFailure: (error: unknown) => void) => {
            calls += 1;
            if (calls === 1) onFailure(new Error("Network Error"));
            else onSuccess();
        };
        const onGiveUp = vi.fn();

        await saveWithRetry(attempt, onGiveUp, immediate([]));

        expect(calls).toBe(2);
        // A lényeg: piszkozat NEM készül, mert a mentés végül megtörtént.
        expect(onGiveUp).not.toHaveBeenCalled();
    });

    it("TARTÓS hiba: három próba után feladja, az UTOLSÓ hibával", async () => {
        const errors = [new Error("első"), new Error("második"), new Error("harmadik")];
        let calls = 0;
        const attempt = (onSuccess: () => void, onFailure: (error: unknown) => void) => {
            onFailure(errors[calls++]);
        };
        const onGiveUp = vi.fn();

        await saveWithRetry(attempt, onGiveUp, immediate([]));

        expect(calls).toBe(3);
        /* Az utolsó hibát adjuk tovább, nem az elsőt: a naplóban az a hasznos,
           ami a feladás pillanatában igaz volt. */
        expect(onGiveUp).toHaveBeenCalledWith(errors[2]);
    });

    it("a várakozás NÖVEKSZIK (1s, majd 3s) — nem azonnal ismétel", async () => {
        /* Azonnali újrapróbálás értelmetlen: ha a szerver épp újraindul, a
           másodperc törtrésze alatt sem lesz kész. */
        const delays: number[] = [];
        const attempt = (onSuccess: () => void, onFailure: (error: unknown) => void) =>
            onFailure(new Error("Network Error"));

        await saveWithRetry(attempt, vi.fn(), immediate(delays));

        expect(delays).toEqual([1000, 3000]);
    });

    it("a próbák SORBAN mennek, nem egyszerre", () => {
        /* Párhuzamos próbálkozás create-nél DUPLIKÁLNA (két új elem jönne létre).
           A teszt azt rögzíti, hogy a következő próba csak az előző BUKÁSA után
           indul: az időzítő nélkül (schedule) egyáltalán nincs újabb hívás. */
        let calls = 0;
        const attempt = (onSuccess: () => void, onFailure: (error: unknown) => void) => {
            calls += 1;
            onFailure(new Error("Network Error"));
        };
        /* Az időzítő SOSEM fut le: a következő próba így nem indulhat el — és a
           promise sem teljesül, ezért NEM várunk rá (a `void` mondja ki, hogy ez
           szándékos, nem elfelejtett await). */
        void saveWithRetry(attempt, vi.fn(), () => {});

        expect(calls).toBe(1);
    });
});
