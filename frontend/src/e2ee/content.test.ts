import {describe, expect, it} from "vitest";
import {decryptContent, encryptContent} from "./content";

/* A SZEKCIÓ-TARTALOM titkosításának tesztjei. A kör bezárulásán túl a lényeg a
   HELYHEZ-KÖTÉS: az ellenséges szerver ne tudja egy elem `ciphertext`-jét egy MÁSIK elem
   (vagy másik szekció) helyére tenni. Ha megteszi, a visszafejtés DOBJON — mert az AAD
   (szekció|_id) nem egyezik. (A user-hez-kötést a per-user mesterkulcs adja, nem az AAD:
   egy másik felhasználó a saját MK-jával eleve nem fejti meg a mi borítékunkat. L. content.ts.) */

const MK = new Uint8Array(32).map((_, index) => (index * 5) % 256);
const SECTION = "quotes";
const ID = "507f1f77bcf86cd799439011";
// A tartalmi mezők kész JSON-szövege — ezt kapja a titkosító a szekció-úttól.
const CONTENT = JSON.stringify({quote: "Egy idézet", author: "Valaki", fontSize: 155});

describe("a tartalom titkosítása és visszafejtése", () => {
    it("a helyén visszafejtve ugyanaz a tartalom", () => {
        const envelope = encryptContent(MK, SECTION, ID, CONTENT);

        expect(decryptContent(MK, SECTION, ID, envelope)).toBe(CONTENT);
    });

    it("a titkos szövegben NINCS benne olvashatóan a tartalom", () => {
        const envelope = encryptContent(MK, SECTION, ID, JSON.stringify({quote: "bankkartya"}));

        expect(atob(envelope.split(".")[2] ?? "")).not.toContain("bankkartya");
    });

    /* A per-user MESTERKULCS a user-hez-kötés: egy MÁSIK felhasználó (másik MK) a mi
       borítékunkat nem fejti meg — a GCM-címke bukik. Ez az, ami a user-t az AAD-ből
       kiváltja (l. content.ts). */
    it("MÁSIK mesterkulccsal (másik felhasználó) DOB", () => {
        const envelope = encryptContent(MK, SECTION, ID, CONTENT);
        const otherMk = new Uint8Array(32).map((_, index) => (index * 7 + 1) % 256);

        expect(() => decryptContent(otherMk, SECTION, ID, envelope)).toThrow();
    });
});

/* A SWAP-VÉDELEM — ez a modul biztonsági többlete. Mindkét AAD-komponens rontása
   ugyanazt teszi: a GCM-címke nem stimmel, a visszafejtés DOB. */
describe("a helyhez-kötés (swap-védelem)", () => {
    const envelope = encryptContent(MK, SECTION, ID, CONTENT);

    it("MÁSIK _id alá téve DOB", () => {
        expect(() => decryptContent(MK, SECTION, "507f1f77bcf86cd799439012", envelope)).toThrow();
    });

    it("MÁSIK szekció alá téve DOB", () => {
        expect(() => decryptContent(MK, "todos", ID, envelope)).toThrow();
    });
});
