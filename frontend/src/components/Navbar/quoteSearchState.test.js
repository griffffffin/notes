import {describe, expect, it} from "vitest";
import {quoteSearchState} from "./quoteSearchState";

describe("quoteSearchState — hol jelenjen meg a kereső és mi a kezdőértéke", () => {
    it("teljes lista (/quotes): megjelenik, üres mezővel", () => {
        expect(quoteSearchState("/quotes")).toEqual({show: true, term: ""});
    });

    it("szerző-szűrt (/quotes/:author): megjelenik, a szerző nevével (dekódolva)", () => {
        expect(quoteSearchState("/quotes/Ady")).toEqual({show: true, term: "Ady"});
        expect(quoteSearchState("/quotes/Ady%20Endre")).toEqual({show: true, term: "Ady Endre"});
    });

    it("a névtelen szűrt nézeten (/quotes/Anonymous) az 'Anonymous' jelölőt kiírja", () => {
        expect(quoteSearchState("/quotes/Anonymous")).toEqual({show: true, term: "Anonymous"});
    });

    it("találati nézet (/quotes/search/:term): megjelenik, a kifejezéssel (dekódolva)", () => {
        expect(quoteSearchState("/quotes/search/szeretet")).toEqual({show: true, term: "szeretet"});
        expect(quoteSearchState("/quotes/search/k%C3%B6nyv")).toEqual({show: true, term: "könyv"});
    });

    it("a szerkesztőkön NEM jelenik meg (create, update)", () => {
        expect(quoteSearchState("/quotes/create").show).toBe(false);
        expect(quoteSearchState("/quotes/update/507f1f77bcf86cd799439011").show).toBe(false);
    });

    it("a publikus egy-idézet nézeten (/quotes/:author/:id) NEM jelenik meg", () => {
        expect(quoteSearchState("/quotes/Ady/507f1f77bcf86cd799439011").show).toBe(false);
    });

    it("a csupasz /quotes/search (kifejezés nélkül) nem mutat keresőt", () => {
        expect(quoteSearchState("/quotes/search").show).toBe(false);
    });

    it("nem-quotes úton NEM jelenik meg", () => {
        expect(quoteSearchState("/to-do").show).toBe(false);
        expect(quoteSearchState("/to-do/category/otthon").show).toBe(false);
    });
});
