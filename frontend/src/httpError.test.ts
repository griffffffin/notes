import {describe, expect, it} from "vitest";
import {errorDetail, responseStatus} from "./httpError";

/* Ezek a függvények váltottak ki két `as` cast-ot (auth.tsx, log.ts). A cast
   némán engedett át bármit; ezek ellenőriznek — a teszt tehát nem csak azt nézi,
   hogy a jó alakot felismerik, hanem hogy a ROSSZAKON nem szállnak el és nem is
   találgatnak. Egy hibakezelő, ami maga dob kivételt, a hibaágat viszi magával. */

describe("responseStatus", () => {
    it("kiveszi a szerver válaszának státuszát", () => {
        expect(responseStatus({response: {status: 401}})).toBe(401);
    });

    /* A 401-es kiléptetés ezen áll vagy bukik: a hibaágba érkező érték
       SOKFÉLE lehet, és egyikre sem szabad elszállni. */
    it.each([
        ["hálózati hiba (nincs válasz)", new Error("Network Error")],
        ["dobott szöveg", "valami baj van"],
        ["null", null],
        ["undefined", undefined],
        ["szám", 42],
        ["válasz státusz nélkül", {response: {}}],
        ["nem-szám státusz", {response: {status: "401"}}],
    ])("%s esetén undefined, nem kivétel", (_name, thrown) => {
        expect(responseStatus(thrown)).toBeUndefined();
    });
});

describe("errorDetail", () => {
    it("a szerver üzenetét adja, ha van", () => {
        expect(errorDetail({response: {data: "Érvénytelen token."}, message: "Request failed"}))
            .toBe("Érvénytelen token.");
    });

    it("a szerver üzenete hiányában a hiba saját üzenetét", () => {
        expect(errorDetail(new Error("Network Error"))).toBe("Network Error");
    });

    // A null törzs NEM üzenet: essen tovább a következő ágra, ahogy a `??` lánc tette.
    it("a null törzsön átlép az üzenetre", () => {
        expect(errorDetail({response: {data: null}, message: "timeout"})).toBe("timeout");
    });

    it("végső soron magát az értéket adja vissza", () => {
        expect(errorDetail("csak egy szöveg")).toBe("csak egy szöveg");
        expect(errorDetail(null)).toBeNull();
    });
});
