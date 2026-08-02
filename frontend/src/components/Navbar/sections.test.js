import {beforeEach, describe, expect, it} from "vitest";
import {currentSection, lastSectionPath, rememberSection} from "./sections";

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
});
