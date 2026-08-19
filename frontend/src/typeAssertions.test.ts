import {readFileSync} from "node:fs";
import {relative} from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {sourceFiles, SRC_ROOT} from "./test/sourceFiles";

/* AMIT A LINTER NEM TUD MEGFOGNI: a DOM-lekérdezés típusparamétere.

   A CLAUDE.md szabálya szerint az `as`, a `!` és a `querySelector<T>`-stílusú
   típusparaméter UGYANAZ az üres állítás: egyik sem vizsgál semmit, csak közli a
   fordítóval, hogy higgyen nekünk. A `document.querySelector<HTMLLinkElement>(…)`
   ugyanúgy `null`-t vagy egy egészen más elemet is adhat — a típus csak ígéret.

   Az első kettőre 2026-08-15 óta LINT-SZABÁLY van (l. .oxlintrc.json:
   typescript/no-non-null-assertion és consistent-type-assertions). A harmadikra
   nincs: az oxlintben nincs `no-restricted-syntax`, amivel egy tetszőleges
   AST-alakot meg lehetne tiltani (mérve, 1.73.0), és dedikált szabály sem
   létezik rá. Ezért marad ez a forrás-vizsgálat — kevésbé elegáns, mint egy
   linter, de ugyanazt a szolgálatot teszi: nem az emberi figyelmen múlik.

   A HELYES ALAK MINDIG az `instanceof`: az VALÓDI futásidejű ellenőrzés, és
   ráadásul a `null`-esetet is lekezeli, amit amúgy is meg kell nézni.

       const link = document.querySelector("link[rel=icon]");
       if (link instanceof HTMLLinkElement) link.href = …;

   MIT NEM VÉD. Csak ezt a HÁROM nevesített DOM-metódust nézi, és csak szövegesen
   — nem általános "üres típusparaméter"-detektor. Ez tudatos: a generikus hívás
   önmagában nem hiba (a `useState<T>()` teljesen rendben van), csak ott, ahol egy
   ELLENŐRIZETLEN külső értékről állít alakot. A DOM-lekérdezés ennek a
   visszatérő, konkrét esete — a többi továbbra is felülvizsgálat kérdése. */

/* A forrásfa bejárása a közös segédből jön (test/sourceFiles.ts) — a
   `fileURLToPath` kényszere és a kiterjesztés-szűrő ott van kimondva. */

/* A `querySelectorAll` a HOSSZABB név, ezért áll elöl — de ez itt ÓVATOSSÁG, nem
   kényszer, és fontos, hogy a komment ezt pontosan mondja.

   MÉRVE: fordított sorrenddel is illeszkedik. A JS-regex ugyanis VISSZALÉP az
   alternációba: a rövidebb ág után a kötelező `\s*<` nem jön ki (mert "All"
   következik), mire az `All`-os ágat próbálja ugyanarról a helyről — és az
   illeszkedik. A sorrend csak akkor kezdene számítani, ha a lezáró rész egyszer
   OPCIONÁLIS lenne: akkor a rövidebb ág elég lenne a sikerhez, és az "All" alak
   némán kimaradna a vizsgálatból. */
/* A pont UTÁN is állhat térköz (`\.\s*`), nem csak a metódusnév előtt. MÉRVE
   (2026-08-16): enélkül a `document. querySelector<T>(…)` és a sortörés utáni
   `document\n    .querySelector<T>(…)` közül az ELSŐ átcsúszott. Kicsi rés, de
   ennek az őrnek épp az a dolga, hogy ne az emberi figyelmen múljon. */
const TYPE_PARAMETER = /\.\s*(?:querySelectorAll|querySelector|closest)\s*</;

/* ÖNMAGÁT KIHAGYJA: ebben a fájlban szándékosan szerepel a tiltott alak (a fenti
   magyarázatban és a mintában), ami különben saját magát jelentené fel. Ára, hogy
   EBBEN az egy fájlban nem véd — cserébe a minta és az indoklás leírható. */
const files = sourceFiles().filter((file) => file !== fileURLToPath(import.meta.url));

describe("a DOM-lekérdezés típusparamétere tilos (nem ellenőrzés, csak állítás)", () => {
    /* KONTROLL. Ha a bejárás egyszer elromlik (átrendezett könyvtárak, más
       kiterjesztés), a teszt ÜRES listán futna, és zölden jelentene semmit. Az
       ilyen "elnémult őr" rosszabb, mint ha teszt sem lenne. */
    it("a forrásfa bejárása működik (különben a teszt némán semmit sem őrizne)", () => {
        expect(files.length).toBeGreaterThan(50);
    });

    it("egyetlen forrásfájl sem ad típusparamétert a DOM-lekérdezésnek", () => {
        const offenders = files
            .filter((file) => TYPE_PARAMETER.test(readFileSync(file, "utf8")))
            .map((file) => relative(SRC_ROOT, file));

        expect(offenders, `Ezek a fájlok típusparamétert adnak egy DOM-lekérdezésnek: ` +
            `${offenders.join(", ")}. Az nem ellenőrzés, csak állítás — a lekérdezés ` +
            `mást (vagy null-t) is adhat, és senki nem szól. Használj \`instanceof\`-ot: ` +
            `az valódi vizsgálat, és a null-esetet is lefedi.`).toEqual([]);
    });
});
