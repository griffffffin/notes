import {describe, expect, it} from "vitest";
import {newObjectId} from "./objectId";

/* AZ AZONOSÍTÓ ALAKJA SZERZŐDÉS a backenddel: az `validateObjectId` middleware
   pontosan 24 hexa karaktert enged át (backend/src/middleware/validators.js). Ha
   ez az alak elcsúszik, MINDEN létrehozás 400-at kap — hangosan, de csak élesben.
   Az itteni állítások ezt előbb fogják meg. */
describe("newObjectId", () => {
    it("24 hexa karakter", () => {
        for (let i = 0; i < 50; i++) expect(newObjectId()).toMatch(/^[0-9a-f]{24}$/);
    });

    it("az első négy bájt a MÁSODPERCBEN vett időbélyeg", () => {
        /* A backendével AZONOS módszer: enélkül az azonosító formailag érvényes
           volna, de az ObjectId időbélyeg-szemantikája elveszne. */
        const nowMs = Date.UTC(2026, 7, 21, 12, 0, 0);
        const id = newObjectId(nowMs);

        expect(parseInt(id.slice(0, 8), 16)).toBe(Math.floor(nowMs / 1000));
    });

    it("2038 UTÁN sem billen át negatívba", () => {
        /* A 32. bit: előjeles eltolással (`>>`) az érték negatív lenne, és az
           azonosító eleje elromlana. A `>>>` ezt kerüli el — a próba a valódi
           határon túlról jön. */
        const nowMs = Date.UTC(2040, 0, 1);
        const id = newObjectId(nowMs);

        expect(id).toMatch(/^[0-9a-f]{24}$/);
        expect(parseInt(id.slice(0, 8), 16)).toBe(Math.floor(nowMs / 1000));
    });

    it("két hívás nem ad azonosat", () => {
        const ids = new Set(Array.from({length: 200}, () => newObjectId()));

        expect(ids.size).toBe(200);
    });
});
