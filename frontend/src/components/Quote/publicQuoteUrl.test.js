import {describe, expect, it} from "vitest";
import {publicQuoteUrl} from "./publicQuoteUrl";

const ORIGIN = "http://example.test";
const ID = "6a6cc7bc8dca2d05004fcf39";

describe("publicQuoteUrl", () => {
    it("a szerzőt és az azonosítót a publikus route alakjában fűzi össze", () => {
        expect(publicQuoteUrl(ORIGIN, "Marcus Aurelius", ID))
            .toBe(`${ORIGIN}/quotes/Marcus%20Aurelius/${ID}`);
    });

    /* A NÉVTELEN idézet is megosztható: a szerző-szegmens ilyenkor a kanonikus
       "Anonymous" jelölő — üres szegmenssel az útvonal szétesne (a //-ból a
       react-router már nem a publikus nézetet ismerné fel). */
    it.each([["üres", ""], ["csak szóköz", "   "], ["hiányzó", undefined], ["null", null]])(
        "%s szerzőnél az Anonymous jelölőt teszi a linkbe", (_name, author) => {
            expect(publicQuoteUrl(ORIGIN, author, ID)).toBe(`${ORIGIN}/quotes/Anonymous/${ID}`);
        });

    // A perjel új útvonal-szegmenst nyitna, ha nyersen kerülne be.
    it("a szerzőnév perjelét kódolja, nem hagyja útvonal-elválasztónak", () => {
        expect(publicQuoteUrl(ORIGIN, "A/B", ID)).toBe(`${ORIGIN}/quotes/A%2FB/${ID}`);
    });

    it("az ékezetes szerzőnevet kódolja", () => {
        expect(publicQuoteUrl(ORIGIN, "Örkény", ID)).toBe(`${ORIGIN}/quotes/%C3%96rk%C3%A9ny/${ID}`);
    });
});
