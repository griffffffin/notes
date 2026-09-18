import {describe, expect, it} from "vitest";
import {deriveKek, generateMasterKey, generateSalt, type KdfParams,
    unwrapMasterKey, wrapMasterKey} from "./masterKey";

/* A KULCS-HIERARCHIA tesztjei. A cél annak bizonyítása, hogy a három szint úgy
   viselkedik, ahogy a biztonság megköveteli: a KEK a jelszóból+saltból DETERMINISZTIKUS
   (különben nem lehetne feloldani), a wrapped-MK köre bezárul a helyes jelszóval, és
   ROSSZ jelszóval DOB — ez maga a kliens-oldali jelszó-ellenőrzés. */

// A tesztekben MINIMÁLIS KDF-paraméter kell, különben minden derive ~1 mp lenne. A
// biztonsági tulajdonságokat (determinizmus, wrap/unwrap) a paraméter nem befolyásolja.
const TEST_KDF: KdfParams = {memorySize: 256, iterations: 1, parallelism: 1};

describe("a mesterkulcs és a salt generálása", () => {
    it("a mesterkulcs 32 bájt, és két hívás KÜLÖNBÖZŐ (nem konstans)", () => {
        const first = generateMasterKey();

        expect(first).toHaveLength(32);
        expect([...generateMasterKey()]).not.toEqual([...first]);
    });

    it("a salt 16 bájt, és két hívás különböző", () => {
        const first = generateSalt();

        expect(first).toHaveLength(16);
        expect([...generateSalt()]).not.toEqual([...first]);
    });
});

describe("a KEK levezetése a jelszóból", () => {
    const SALT = new Uint8Array(16).fill(3);

    it("AZONOS jelszó+salt+paraméter AZONOS KEK-et ad (különben nincs feloldás)", async () => {
        const first = await deriveKek("jelszó", SALT, TEST_KDF);
        const second = await deriveKek("jelszó", SALT, TEST_KDF);

        expect([...first]).toEqual([...second]);
        expect(first).toHaveLength(32);
    });

    it("MÁS jelszó MÁS KEK-et ad", async () => {
        const a = await deriveKek("jelszó", SALT, TEST_KDF);
        const b = await deriveKek("jelszo", SALT, TEST_KDF);

        expect([...a]).not.toEqual([...b]);
    });

    it("MÁS salt MÁS KEK-et ad (azonos jelszóra is)", async () => {
        const a = await deriveKek("jelszó", new Uint8Array(16).fill(1), TEST_KDF);
        const b = await deriveKek("jelszó", new Uint8Array(16).fill(2), TEST_KDF);

        expect([...a]).not.toEqual([...b]);
    });
});

describe("az MK becsomagolása és kicsomagolása", () => {
    const SALT = new Uint8Array(16).fill(5);

    it("a helyes jelszóval a kör bezárul — ugyanaz az MK jön vissza", async () => {
        const masterKey = generateMasterKey();
        const kek = await deriveKek("helyes jelszó", SALT, TEST_KDF);

        const wrapped = wrapMasterKey(kek, masterKey);
        const kekAgain = await deriveKek("helyes jelszó", SALT, TEST_KDF);

        expect([...unwrapMasterKey(kekAgain, wrapped)]).toEqual([...masterKey]);
    });

    it("ROSSZ jelszóval a kicsomagolás DOB (ez a jelszó-ellenőrzés a kliensen)", async () => {
        const masterKey = generateMasterKey();
        const wrapped = wrapMasterKey(await deriveKek("helyes jelszó", SALT, TEST_KDF), masterKey);

        const wrongKek = await deriveKek("rossz jelszó", SALT, TEST_KDF);

        expect(() => unwrapMasterKey(wrongKek, wrapped)).toThrow();
    });

    it("a MEGPISZKÁLT wrapped-MK DOB, nem ad ki fél-kulcsot", async () => {
        const kek = await deriveKek("jelszó", SALT, TEST_KDF);
        const [format, iv, ciphertext] = wrapMasterKey(kek, generateMasterKey()).split(".");
        const bytes = Uint8Array.from(atob(ciphertext ?? ""), (character) => character.charCodeAt(0));
        bytes[0] = (bytes[0] ?? 0) ^ 1;
        const tampered = [format, iv, btoa(String.fromCharCode(...bytes))].join(".");

        expect(() => unwrapMasterKey(kek, tampered)).toThrow();
    });
});
