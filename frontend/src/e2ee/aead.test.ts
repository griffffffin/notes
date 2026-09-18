import {describe, expect, it} from "vitest";
import {open, seal} from "./aead";

/* AZ AEAD-PRIMITÍV tesztjei. Ugyanaz a műfaj, mint a piszkozat-titkosításnál (l.
   draftCrypto.test.ts): a hibás kriptó is „működőnek" látszik, ezért nem a kör
   bezárulását vizsgáljuk elsősorban, hanem a buktatókat — és itt egy NEGYEDIKET is, ami
   ennek a modulnak a többlete a piszkozat-titkosításhoz képest: az AAD-kötést. */

const KEY = new Uint8Array(32).map((_, index) => (index * 7) % 256);
const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
const dec = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe("titkosítás és visszafejtés", () => {
    it("a titkosított tartalom visszafejtve ugyanaz", () => {
        expect(dec(open(KEY, seal(KEY, enc("titkos tartalom"))))).toBe("titkos tartalom");
    });

    it("a titkos szövegben NINCS benne olvashatóan a tartalom", () => {
        // ASCII próbaszöveg — az ékezet-csapda okát l. draftCrypto.test.ts.
        const envelope = seal(KEY, enc("A bankkartyam PIN kodja 1234"));

        expect(envelope).not.toContain("bankkartyam");
        expect(atob(envelope.split(".")[2] ?? "")).not.toContain("bankkartyam");
    });

    it("UGYANAZ a tartalom kétszer titkosítva KÜLÖNBÖZŐ IV-t és titkos szöveget ad", () => {
        const [, firstIv, firstText] = seal(KEY, enc("ugyanaz")).split(".");
        const [, secondIv, secondText] = seal(KEY, enc("ugyanaz")).split(".");

        expect(firstIv).not.toBe(secondIv);
        expect(firstText).not.toBe(secondText);
    });

    it("a MEGPISZKÁLT titkos szöveg DOB", () => {
        const [format, iv, ciphertext] = seal(KEY, enc("eredeti")).split(".");
        const bytes = Uint8Array.from(atob(ciphertext ?? ""), (character) => character.charCodeAt(0));
        bytes[0] = (bytes[0] ?? 0) ^ 1;
        const tampered = [format, iv, btoa(String.fromCharCode(...bytes))].join(".");

        expect(() => open(KEY, tampered)).toThrow();
    });

    it("idegen alakú borítékot NEM próbál visszafejteni", () => {
        expect(() => open(KEY, "e2ee2.AAAA.BBBB")).toThrow(/formátum/);
        expect(() => open(KEY, "e2ee1.AAAA")).toThrow(/formátum/);
        expect(() => open(KEY, "sima szöveg")).toThrow(/formátum/);
    });
});

/* AZ AAD-KÖTÉS — ez a modul többlete. A hitelesített, de nem titkosított adat (AAD) a
   GCM-címke része: ha visszafejtéskor más AAD-t adunk, a `decrypt` DOB. Élesben ez köti a
   tartalmat a helyéhez (content.ts), és teszi hiábavalóvá az ellenséges szerver
   swap-támadását. */
describe("az AAD-kötés", () => {
    const AAD = enc("quotes|507f1f77bcf86cd799439011|user-1");

    it("AZONOS AAD-vel a kör bezárul", () => {
        expect(dec(open(KEY, seal(KEY, enc("kötött"), AAD), AAD))).toBe("kötött");
    });

    it("MÁS AAD-vel a visszafejtés DOB (ez a swap-védelem magja)", () => {
        const envelope = seal(KEY, enc("kötött"), AAD);

        expect(() => open(KEY, envelope, enc("quotes|507f1f77bcf86cd799439011|user-2"))).toThrow();
    });

    it("AAD-vel titkosítva, AAD NÉLKÜL visszafejtve is DOB", () => {
        const envelope = seal(KEY, enc("kötött"), AAD);

        expect(() => open(KEY, envelope)).toThrow();
    });
});
