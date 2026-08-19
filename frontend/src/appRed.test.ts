import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {ACCENT_RED} from "./contexts/theme-context";
import {SRC_ROOT} from "./test/sourceFiles";

/* AZ APP PIROSA KÉT HELYEN ÉL — ez a teszt tartja őket együtt.

   A szín JS-ből is kell (a téma innen állítja a --theme-accent-et hibánál és a
   szerző-szűrt nézetben: theme-context.ts ACCENT_RED), és CSS-ből is (a
   Bootstrap piros családjának átírása: index.css --app-red). Egy CSS-változóból
   a JS nem tud modul-betöltéskor olvasni, egy JS-konstansból meg a CSS nem —
   tehát az érték kényszerűen két helyen szerepel.

   Ez pontosan a projekt "kézzel szinkronizált másolat" mintája (l. CLAUDE.md):
   az elcsúszásuk NÉMA lenne — a felületen két, egymáshoz nagyon hasonló piros
   jelenne meg, és senki nem hibázna. Ezért a szerződést teszt őrzi. */

const css = readFileSync(join(SRC_ROOT, "index.css"), "utf8");

describe("az app pirosa", () => {
    it("a CSS --app-red értéke MEGEGYEZIK a JS ACCENT_RED-jével", () => {
        const declaration = css.match(/--app-red:\s*(#[0-9a-fA-F]{6})/);

        expect(declaration, "nincs --app-red az index.css-ben").not.toBeNull();
        expect(declaration?.[1]?.toLowerCase()).toBe(ACCENT_RED.accent.toLowerCase());
    });

    it("a Bootstrap piros családja is erre az egy értékre mutat", () => {
        /* Enélkül a `text-danger` és a `btn-danger` a Bootstrap saját #dc3545-jén
           maradna: két piros egy felületen. A vizsgálat a HIVATKOZÁST nézi, nem a
           konkrét értéket — így az érték egy helyen (a --app-red-nél) marad. */
        expect(css).toMatch(/--bs-danger:\s*var\(--app-red\)/);
        expect(css).toMatch(/--bs-btn-bg:\s*var\(--app-red\)/);
    });

    it("az rgb-változat SZÁMAI is ugyanazt a színt adják", () => {
        /* A Bootstrap az áttetsző változatokat rgb-komponensekből számolja, tehát
           a hex mellett a `--bs-danger-rgb` is kell — és ha a kettő elcsúszik, a
           halvány piros MÁS színű lesz, mint a teli. */
        const rgb = css.match(/--bs-danger-rgb:\s*(\d+),\s*(\d+),\s*(\d+)/);
        expect(rgb, "nincs --bs-danger-rgb az index.css-ben").not.toBeNull();

        const hex = ACCENT_RED.accent.replace("#", "");
        const fromHex = [0, 2, 4].map((start) => parseInt(hex.slice(start, start + 2), 16));
        expect(rgb?.slice(1, 4).map(Number)).toEqual(fromHex);
    });
});
