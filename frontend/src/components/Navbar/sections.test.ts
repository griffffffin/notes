import {beforeEach, describe, expect, it} from "vitest";
import {currentSection, lastSectionPath, rememberSection, SECTIONS} from "./sections";

/* A szekció-emlékezet a localStorage-ban él, tehát a felhasználó böngészőjében
   TÚLÉLI a kódváltozásokat. Az átnevezéskor (/to-do → /to-dos) derült ki, hogy ez
   csapda: a tárolt régi út egy nem létező szekcióra mutatna. Ez a háló azt őrzi,
   hogy ismeretlen érték esetén az első szekcióra essünk vissza. */
describe("lastSectionPath — csak ismert szekció-utat fogad el", () => {
    beforeEach(() => localStorage.clear());

    it("üres tárolónál az első szekciót adja", () => {
        expect(lastSectionPath()).toBe("/to-dos");
    });

    it("az elmentett, LÉTEZŐ szekciót adja vissza", () => {
        rememberSection("/quotes");

        expect(lastSectionPath()).toBe("/quotes");
    });

    it("a megszűnt út (a régi /to-do) NEM jut ki: az első szekcióra esik vissza", () => {
        localStorage.setItem("lastSection", "/to-do");

        expect(lastSectionPath()).toBe("/to-dos");
    });

    it("tetszőleges szemetet is elutasít", () => {
        localStorage.setItem("lastSection", "/nincs-ilyen");

        expect(lastSectionPath()).toBe("/to-dos");
    });
});

describe("currentSection — az URL első szegmenséből", () => {
    it("a szűrt to-do nézetek is a to-dos szekcióhoz tartoznak", () => {
        expect(currentSection("/to-dos/category/otthon").path).toBe("/to-dos");
        expect(currentSection("/to-dos/color/warning").path).toBe("/to-dos");
    });

    it("az idézet-nézetek a quotes szekcióhoz", () => {
        expect(currentSection("/quotes/Ady").path).toBe("/quotes");
    });

    it("ismeretlen úton az első szekcióra esik vissza", () => {
        expect(currentSection("/nincs-ilyen").path).toBe("/to-dos");
    });

    /* A KERESÉS `startsWith`-CSEL MEGY, ami nem néz szegmens-határt. MÉRVE
       (2026-08-16): a `/to-dosomething` is a `/to-dos` szekciót adja. Ez ma
       ártalmatlan, mert ilyen cím nem áll elő — a valódi kockázat az, ha KÉT
       szekció útja közül az egyik a másik ELŐTAGJA lesz.

       Akkor ugyanis a listában ELŐBB álló nyeri el a másik címeit is: egy
       `/book` és egy `/books` szekció mellett a `/books/1` a `/book`-ra esne, és
       a navbar végig a rossz szekciót jelölné aktívnak. Semmi nem hibázik — csak
       rossz. A hiba a lista SORRENDJÉTŐL is függene, ami különösen alattomos.

       Ez a teszt magát a listát vizsgálja, nem egy konkrét címet: így egy jövőbeli
       szekció felvételekor azonnal szól, nem akkor, amikor valaki észreveszi a
       rosszul kiemelt menüpontot. (A javítás ilyenkor nem a sorrend igazgatása,
       hanem szegmens-határra illesztés — de arról majd az dönt, aki odaér.) */
    it("egyik szekció útja SEM előtagja a másiknak", () => {
        const collisions = SECTIONS.flatMap((section) => SECTIONS
            .filter((other) => other !== section && other.path.startsWith(section.path))
            .map((other) => `${other.path} a(z) ${section.path} útjával kezdődik`));

        expect(collisions, "Két szekció útja átfedi egymást, és a currentSection " +
            "`startsWith`-csel keres: a listában előbb álló elnyelné a másik címeit, " +
            `a navbar pedig a rossz szekciót jelölné aktívnak. ${collisions.join("; ")}`,
        ).toEqual([]);
    });
});
