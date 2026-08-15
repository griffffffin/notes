import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {THEMES} from "./theme-context";
import {COOKIES} from "../cookies";

/* AZ INDEX.HTML BOOT-SZKRIPTJE ÉS A TÉMA KÖZTI SZERZŐDÉS.

   Az oldal legelső képkockáját nem a React festi: az index.html <head>-jében egy
   pár soros szkript kiolvassa a téma háttérszínét a sütiből, és azzal festi ki a
   lapot — még a stíluslapok és a bundle betöltése előtt. Enélkül az első képkocka
   fehér, és a sötét témán ez látható villanás.

   Ez a szkript NEM tud importálni a forrásból (ott kezdődik minden oldalbetöltés,
   jóval a modulrendszer előtt), ezért két érték KÉTSZER van leírva:

     1. a süti KULCSA — a theme.tsx írja, a boot-szkript olvassa;
     2. a legelső látogatás alapértelmezett háttere — a sötét téma színe, ami a
        <style>-ban is ott áll (akkor még nincs süti, amiből dolgozhatna).

   Ha bármelyik elcsúszik, SEMMI nem hibázik: a szkript egyszerűen nem talál
   semmit, és visszatér a villanás — pontosan az a néma romlás, ami ellen a
   projekt a legtöbbet teszi (CLAUDE.md, "kézzel szinkronizált másolat"). A
   megoldás ugyanaz, mint a backend-frontend kötéseknél
   (backend/src/frontendContract.test.js): az ÉRTÉKET nem rögzítjük — csak azt
   kérjük számon, hogy a két oldal ugyanazt mondja.

   Az index.html-t FÁJLKÉNT olvassuk, nem importáljuk: az igazság a kiszolgált
   HTML-ben van, nem egy róla írt másolatban.

   AZ ÚTVONAL-SZÁMOLÁS ALAKJA KÖTÖTT, és ez nem stílus kérdése. A kézenfekvő
   `new URL("../../index.html", import.meta.url)` NEM azt csinálja, amit írva van:
   a Vite ezt a mintát ESZKÖZ-HIVATKOZÁSKÉNT ismeri fel, és fordításkor átírja
   (erre való — így lehet képet a bundle mellé tenni). Mérve: a kifejezés
   "file:///…/frontend/index.html" helyett "http://localhost:3000/index.html"-t
   adott, amitől a fájlolvasás egy semmitmondó "The URL must be of scheme file"
   hibával szállt el. A `fileURLToPath(import.meta.url)` alakot viszont nem
   bántja, ezért a könyvtárat innen számoljuk, node:path-tal. */
const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "../../index.html"), "utf8");

/* A boot-szkriptet nem csak ÖSSZEVETJÜK a kóddal, hanem LE IS FUTTATJUK. Eddig ez
   volt az app egyetlen teljesen teszteletlen kódrészlete — pedig MINDEN
   oldalbetöltéskor fut, és egy SÜTIBŐL vett értéket tesz stílus-tulajdonságba.
   A süti a felhasználó gépén él, tehát tetszőleges tartalom kerülhet bele.

   A futtatás `new Function`-nel megy: a szkript szövegét kivesszük az
   index.html-ből, és a jsdom document-jén elsütjük — így pontosan azt a kódot
   vizsgáljuk, ami a böngészőbe kerül, nem egy róla írt másolatot. */
const bootScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";

function runBoot(cookieValue: string | null): string {
    document.documentElement.style.background = "";
    if (cookieValue === null)
        document.cookie = COOKIES.themeBackground + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    else
        document.cookie = COOKIES.themeBackground + "=" + cookieValue + "; path=/";
    new Function(bootScript)();
    return document.documentElement.style.background;
}

describe("index.html boot-szkript — futtatva", () => {
    it("ÉRVÉNYES hex színt fest ki a sütiből", () => {
        // Kontroll: enélkül a lenti elutasítások attól is „zöldek" lennének, hogy
        // a szkript egyáltalán nem fest semmit.
        expect(runBoot("%23123456")).not.toBe("");
    });

    it("NEM hex értéket nem fogad el (a lap az alapértelmezett hátteren marad)", () => {
        /* Az „red" érvényes CSS-szín volna, de nem a mi témánk formátuma: a
           szkript csak a `#` + hexa alakot engedi. Ami nem az, azt figyelmen kívül
           hagyja — nem próbál okos lenni vele. */
        expect(runBoot("red")).toBe("");
    });

    it("stílus-injekciós kísérletet sem enged be", () => {
        /* A süti tartalma a támadó (vagy egy elrontott kiegészítő) kezében van, és
           innen EGYENESEN egy style-tulajdonságba menne. A hex-vizsgálat ezért nem
           kényelmi szűrő, hanem az egyetlen kapu ezen az úton. */
        expect(runBoot("url(http://example.invalid/pixel.png)")).toBe("");
    });

    it("süti nélkül nem nyúl a háttérhez", () => {
        expect(runBoot(null)).toBe("");
    });
});

describe("index.html boot-szkript", () => {
    it("ugyanabból a sütiből olvas, amibe a ThemeProvider ír", () => {
        /* Előbb azt kérjük számon, hogy egyáltalán VAN süti-olvasás: enélkül egy
           kigyomlált boot-szkript is „átmenne" a lenti tartalmazás-vizsgálaton. */
        const read = html.match(/document\.cookie\.match\(\/(.+?)\/\)/);
        expect(read, "Az index.html boot-szkriptje nem olvas sütit (document.cookie.match(/…/)). " +
            "Ha az alakja változott, ezt a tesztet is vezesd át.").not.toBeNull();

        expect(read?.[1]).toContain(COOKIES.themeBackground + "=");
    });

    it("a legelső látogatás háttere a sötét téma színe", () => {
        const fallback = html.match(/html\s*\{\s*background:\s*(#[0-9a-fA-F]{3,8})\s*;?\s*\}/);
        expect(fallback, "Nem találtam az index.html <style>-jában a html{background:#…} alapértéket. " +
            "Ha az alakja változott, ezt a tesztet is vezesd át.").not.toBeNull();

        expect(fallback?.[1]).toBe(THEMES.dark.pageBackground);
    });
});
