/* A FORRÁSFA BEJÁRÁSA — a forrás-vizsgáló őrök közös segédje.

   Néhány szabályt nem lehet futásidőben megkérdezni, mert SZINTAKTIKAIak: hogy
   egy hívás milyen ALAKBAN van leírva, azt a felépült objektum már nem tudja (l.
   viMockForm.test.ts és typeAssertions.test.ts). Az ilyen őr kénytelen a
   forrásszöveget olvasni, ahhoz pedig végig kell járnia a fát.

   Két KÖTÖTT részlete van, mindkettő egy-egy néma hiba ellen:

   1. Az útvonal `fileURLToPath`-szal készül, NEM `new URL(…, import.meta.url)`-lel:
      az utóbbit a Vite eszköz-hivatkozásnak nézi és fordításkor átírja, amitől egy
      http-URL-t kapnánk fájlútvonal helyett (l. contexts/themeBoot.test.ts).
   2. A kiterjesztés-szűrő egyetlen helyen él. A `.js`-re szűrő kód a TS-átállás
      alatt némán hagyott ki fájlokat (l. CLAUDE.md, "bedrótozott kiterjesztés") —
      ha egyszer újabb kiterjesztés kerül a forrásfába, itt az egy sor a
      javítandó, nem minden őrben külön.

   AMIT A HÍVÓNAK KELL HOZZÁTENNIE: kontroll-állítást a lista HOSSZÁRA. Ha a
   bejárás elromlik, ez a függvény üres tömböt ad, és a rá épülő őr zölden
   jelentene semmit. */

import {readdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

/* Ez a fájl az src/test/ alatt ül, a forrásfa gyökere tehát eggyel feljebb van. */
export const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function sourceFiles(dir: string = SRC_ROOT): string[] {
    return readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return /\.tsx?$/.test(entry.name) ? [full] : [];
    });
}
