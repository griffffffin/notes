import {act, renderHook} from "@testing-library/react";
import {beforeEach, describe, expect, it} from "vitest";
import {clearMasterKey, enroll, getMasterKey, hasMasterKey, unlock, useMasterKeyStatus}
    from "./masterKeySession";

/* A MESTERKULCS-SESSION tesztjei. A lényeg a kulcs-hierarchia kör-bezárása: a
   regisztráció feloldva indul, a HELYES jelszó UGYANAZT a mesterkulcsot oldja fel, a
   ROSSZ jelszó pedig DOB (ez a jelszó-ellenőrzés a kliensen). A modul-szintű kulcsot
   tesztenként nullázzuk. */

// MINIMÁLIS KDF a gyorsaságért — a biztonsági tulajdonságokat (kör, rossz jelszó) a
// paraméter nem befolyásolja, csak a futásidőt. Éles hívó a DEFAULT_KDF-et használja.
const TEST_KDF = {memorySize: 256, iterations: 1, parallelism: 1};

beforeEach(() => { clearMasterKey(); });

describe("regisztráció (enroll)", () => {
    it("feloldva indul, és a beiratkozást adja vissza", async () => {
        const enrollment = await enroll("jelszó", TEST_KDF);

        expect(hasMasterKey()).toBe(true);
        expect(getMasterKey()).toHaveLength(32);
        expect(typeof enrollment.wrappedMk).toBe("string");
        expect(typeof enrollment.kdfSalt).toBe("string");
        expect(enrollment.kdf).toEqual({algorithm: "argon2id", ...TEST_KDF});
    });
});

describe("feloldás (unlock)", () => {
    it("a HELYES jelszó UGYANAZT a mesterkulcsot oldja fel (a kör bezárul)", async () => {
        const enrollment = await enroll("helyes jelszó", TEST_KDF);
        const afterEnroll = [...getMasterKey()];

        clearMasterKey();
        expect(hasMasterKey()).toBe(false);

        await unlock("helyes jelszó", enrollment);

        expect([...getMasterKey()]).toEqual(afterEnroll);
    });

    it("ROSSZ jelszóval DOB, és zárolt marad", async () => {
        const enrollment = await enroll("helyes jelszó", TEST_KDF);
        clearMasterKey();

        await expect(unlock("rossz jelszó", enrollment)).rejects.toThrow();
        expect(hasMasterKey()).toBe(false);
    });
});

describe("a zárolt állapot", () => {
    it("kulcs nélkül getMasterKey DOB — nyílt szöveggel sosem esünk vissza", () => {
        expect(hasMasterKey()).toBe(false);
        expect(() => getMasterKey()).toThrow(/zárolva/);
    });

    it("a kulcs eldobása zárol", async () => {
        await enroll("jelszó", TEST_KDF);
        expect(hasMasterKey()).toBe(true);

        clearMasterKey();

        expect(hasMasterKey()).toBe(false);
        expect(() => getMasterKey()).toThrow();
    });
});

/* A KAPU-HOOK: a felület ebből tudja, zárolt-e — és a kulcs megérkezésekor/eldobásakor
   ÚJRA KELL rajzolnia (a lock-képernyő ezen múlik). Ez a reaktív store (emit/subscribe)
   viselkedésének próbája is. */
describe("useMasterKeyStatus", () => {
    it("követi a zárolt→feloldott→zárolt átmenetet", async () => {
        const {result} = renderHook(() => useMasterKeyStatus());
        expect(result.current).toBe(false);

        await act(async () => { await enroll("jelszó", TEST_KDF); });
        expect(result.current).toBe(true);

        act(() => { clearMasterKey(); });
        expect(result.current).toBe(false);
    });
});
