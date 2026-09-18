import {describe, expect, it} from "vitest";
import {decryptContent, encryptContent} from "./content";

/* A SZEKCIÓ-TARTALOM titkosításának tesztjei. A kör bezárulásán túl a lényeg a
   HELYHEZ-KÖTÉS: az ellenséges szerver ne tudja egy elem `ciphertext`-jét egy MÁSIK elem
   (vagy másik felhasználó, másik szekció) helyére tenni. Ha megteszi, a visszafejtés
   DOBJON — mert az AAD (szekció|_id|user) nem egyezik. */

const MK = new Uint8Array(32).map((_, index) => (index * 5) % 256);
const SECTION = "quotes";
const ID = "507f1f77bcf86cd799439011";
const USER = "user-1";
// A tartalmi mezők kész JSON-szövege — ezt kapja a titkosító a szekció-úttól.
const CONTENT = JSON.stringify({quote: "Egy idézet", author: "Valaki", fontSize: 155});

describe("a tartalom titkosítása és visszafejtése", () => {
    it("a helyén visszafejtve ugyanaz a tartalom", () => {
        const envelope = encryptContent(MK, SECTION, ID, USER, CONTENT);

        expect(decryptContent(MK, SECTION, ID, USER, envelope)).toBe(CONTENT);
    });

    it("a titkos szövegben NINCS benne olvashatóan a tartalom", () => {
        const envelope = encryptContent(MK, SECTION, ID, USER, JSON.stringify({quote: "bankkartya"}));

        expect(atob(envelope.split(".")[2] ?? "")).not.toContain("bankkartya");
    });
});

/* A SWAP-VÉDELEM — ez a modul biztonsági többlete. Mindhárom AAD-komponens rontása
   ugyanazt teszi: a GCM-címke nem stimmel, a visszafejtés DOB. */
describe("a helyhez-kötés (swap-védelem)", () => {
    const envelope = encryptContent(MK, SECTION, ID, USER, CONTENT);

    it("MÁSIK _id alá téve DOB", () => {
        expect(() => decryptContent(MK, SECTION, "507f1f77bcf86cd799439012", USER, envelope)).toThrow();
    });

    it("MÁSIK felhasználó alá téve DOB", () => {
        expect(() => decryptContent(MK, SECTION, ID, "user-2", envelope)).toThrow();
    });

    it("MÁSIK szekció alá téve DOB", () => {
        expect(() => decryptContent(MK, "todos", ID, USER, envelope)).toThrow();
    });
});
