import {existsSync, readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {TODO_COLOR_NAMES} from "./todoColors";
import {at} from "./test/at";

/* A SZÍNPALETTA a repó két csomagjában van kimondva:

     - itt, a frontenden (todoColors.ts): ebből épül a szerkesztő színválasztója
       és a navbar szín-szűrője;
     - a backenden (validateTodo.js: COLORS): ez utasítja el az ismeretlen színt,
       mielőtt Bootstrap-osztálynévként az adatbázisba kerülne.

   A kettőt NEM lehet importtal összekötni: külön package.json, külön telepítés,
   a backend CommonJS, a frontend ESM. Egy közös fájl build-idejű függőséget
   teremtene a két csomag között — az itt aránytalan ár egy hatelemű listáért.

   Az elcsúszásuk viszont valódi hiba, csak nem néma: egy új szín felvétele a
   frontenden ELÉRHETŐVÉ tenné a felületen, a szerver viszont 400-zal utasítaná
   el a mentést — a felhasználó egy nem működő gombot kapna. Fordítva (a backend
   ismer olyat, amit a frontend nem) csak holt engedély marad.

   Ezért a teszt a backend forrásából olvassa ki a listát. A regex szűk
   szándékosan: ha a COLORS deklarációja formát vált, a teszt inkább HIBÁT jelez
   (nem talál listát), mint hogy csendben üres halmazt hasonlítson össze. */
/* A KITERJESZTÉST nem drótozzuk be. A backend ma még JavaScript, de a TS-átállás
   után ugyanez a fájl `.ts` lesz — egy bedrótozott ".js" azon a napon állítaná
   meg ezt a szerződés-tesztet, és a hibaüzenete ("nincs ilyen fájl") nem arról
   szólna, ami valójában történt. A projekt szabálya is ez: fájlra hivatkozó
   tesztek kiterjesztés nélkül oldják fel a nevet (l. CLAUDE.md, 4. néma minta).

   A keresés HANGOS: ha egyik alakot sem találja, megnevezi a könyvtárat és a
   keresett neveket — nem üres listával hasonlít csendben. */
const BACKEND_MIDDLEWARE = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)), "../../backend/src/middleware");

const backendValidatorPath = () => {
    for (const extension of [".js", ".ts"]) {
        const candidate = path.join(BACKEND_MIDDLEWARE, `validateTodo${extension}`);
        if (existsSync(candidate)) return candidate;
    }
    throw new Error(`A validateTodo forrása nem található itt: ${BACKEND_MIDDLEWARE} (.js/.ts)`);
};

const readBackendColors = () => {
    const backendValidator = backendValidatorPath();
    const source = readFileSync(backendValidator, "utf8");
    const declaration = source.match(/const COLORS = \[([^\]]*)]/);
    if (!declaration) throw new Error(`A COLORS deklaráció nem található: ${backendValidator}`);
    return at(declaration, 1, "COLORS-csoport").split(",")
        .map((entry) => entry.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
};

describe("a to-do színpaletta a két csomagban", () => {
    it("a backend PONTOSAN ugyanazokat a színeket ismeri, mint a frontend", () => {
        expect(readBackendColors().toSorted()).toEqual(TODO_COLOR_NAMES.toSorted());
    });

    /* A paletta nevei Bootstrap-osztálynévbe kerülnek ("btn-" + szín, "border-" +
       szín). Egy szóközös vagy nagybetűs név némán elrontaná a stílust: a kártya
       keret nélkül maradna, hibaüzenet nélkül. */
    it("minden szín neve érvényes Bootstrap-osztálynév-darab", () => {
        for (const color of TODO_COLOR_NAMES) {
            expect(color).toMatch(/^[a-z]+$/);
        }
    });
});
