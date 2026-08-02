import {describe, it, expect} from "vitest";
import {render} from "@testing-library/react";
import {renderBold, toggleBold, normalizeBold} from "./bold";

describe("bold segédfüggvények", () => {
    it("renderBold: a **…** <strong> React-elem, a marker nem látszik", () => {
        const {container} = render(<div>{renderBold("a **b** c")}</div>);
        expect(container.querySelector("strong")?.textContent).toBe("b");
        expect(container.textContent).toBe("a b c");
    });

    it("toggleBold: a kijelölést `**…**`-ba csomagolja, a kijelölés a tartalmon marad", () => {
        expect(toggleBold("szép", 0, 4)).toEqual({text: "**szép**", selStart: 2, selEnd: 6});
    });

    it("toggleBold: ismételt nyomás LEVESZI (a körülvevő ** felismerése), nem halmoz", () => {
        // A "**szép**"-ben a "szép" (2..6) kijelölve — a csillagok kívül vannak.
        expect(toggleBold("**szép**", 2, 6)).toEqual({text: "szép", selStart: 0, selEnd: 4});
    });

    it("toggleBold: ha a `**…**` maga van kijelölve, azt is leveszi", () => {
        expect(toggleBold("**szép**", 0, 8)).toEqual({text: "szép", selStart: 0, selEnd: 4});
    });

    it("toggleBold: részben félkövér kijelölés EGÉSZE bold lesz (a szabály: van nem-bold → mind bold)", () => {
        // "d**a**sd" (csak az "a" bold) egészét kijelölve → mind bold, nem inverz.
        expect(toggleBold("d**a**sd", 0, 8)).toEqual({text: "**dasd**", selStart: 2, selEnd: 6});
    });

    it("normalizeBold: a `**world**` félkövér marad (idempotens)", () => {
        expect(normalizeBold("hello **world**")).toBe("hello **world**");
    });

    it("normalizeBold: a MÁR félkövér köré tett újabb ** kioltja a boldot", () => {
        expect(normalizeBold("hello ****world****")).toBe("hello world");
    });

    it("normalizeBold: a bold-futam szélső szóközei kikerülnek a markerből", () => {
        expect(normalizeBold("** hello **")).toBe(" **hello** ");
    });

    it("normalizeBold: a párját vesztett `**` csak a KÖVETKEZŐ szót teszi bolddá", () => {
        expect(normalizeBold("hello **world foo")).toBe("hello **world** foo");
    });

    it("normalizeBold: már meglévő `**…**` pár mellett egy párját vesztett `**` szintén csak a következő szót", () => {
        expect(normalizeBold("**bold** text **new word")).toBe("**bold** text **new** word");
    });

    it("normalizeBold: teljes `**…**` párt (részleges szó-bold) VÁLTOZATLANUL hagy", () => {
        // A felhasználó egyértelműen kijelölte a boldot — nem olvasztjuk össze.
        expect(normalizeBold("21 21  1**212** 2112")).toBe("21 21  1**212** 2112");
        expect(normalizeBold("fél**szó**boldolása")).toBe("fél**szó**boldolása");
    });

    it("normalizeBold: párját vesztett `**` a szöveg VÉGÉN → a tapadó szót összeolvasztja", () => {
        expect(normalizeBold("21 21  **1**212**")).toBe("21 21  **1212**");
    });

    it("normalizeBold: párját vesztett `**` a szó után (van tartalom) → a KÖVETKEZŐ szót nyitja, a részleges bold marad", () => {
        expect(normalizeBold("**Al**dus** PageMaker sa")).toBe("**Al**dus **PageMaker** sa");
    });

    it("normalizeBold: külön szavaknál a jelek NEM olvadnak össze", () => {
        expect(normalizeBold("**b **c** d")).toBe("**b** c **d**");
        expect(normalizeBold("**b **c** d   sad")).toBe("**b** c **d**   sad");
        expect(normalizeBold("**a **b **c d")).toBe("**a** b **c** d");
    });

    it("normalizeBold: két nyitó, egy záró sincs — az elsőt zárónak érzi", () => {
        expect(normalizeBold("**a **b")).toBe("**a** b");
    });
});
