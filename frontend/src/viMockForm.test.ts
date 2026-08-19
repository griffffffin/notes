import {readFileSync} from "node:fs";
import {relative} from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {sourceFiles, SRC_ROOT} from "./test/sourceFiles";

/* A `vi.mock` MINDIG az import()-os alakot kapja, sose szöveges útvonalat.

   A KÜLÖNBSÉG NEM STÍLUS. A Vitest gyár-típusa így szól:

       ModuleMockFactoryWithHelper<M = unknown> = (…) => Awaitable<Partial<M>>

   String-útvonalnál `M` marad az alapértelmezett `unknown`, tehát a gyár
   visszatérése `Partial<unknown>` — vagyis BÁRMI jó, a fordító semmit nem néz
   meg. Az `import()`-os túlterhelésnél (`mock<T>(module: Promise<T>, …)`) az `M`
   a modul VALÓDI típusa lesz, és a mock alakja fordítási hibát kap, ha eltér.

       vi.mock("../contexts/auth-context", () => ({useAuth: () => auth}));   // NEM
       vi.mock(import("../contexts/auth-context"), () => ({useAuth: () => auth})); // IGEN

   MÉRVE (2026-08-13): a hiányos, `{isLogged, handleAxios}` alakú auth-mock
   string-útvonallal NULLA hibát adott, import()-tal TS2769-et — „missing the
   following properties from type 'Auth': token, login, logout". Pontosan az a
   néma elcsúszás, ami ellen a mockjaink védeni hivatottak: egy mock, ami már nem
   a valódi modul alakját utánozza, zöld tesztek mellett hazudik.

   MIÉRT KELL EZ AZ ŐR, HA A FORDÍTÓ ÚGYIS MÉR. Mert a fordító csak azt méri, ami
   ELÉ kerül. Az F5 óta minden tesztfájl `.ts`/`.tsx`, tehát a MAI mockokat
   végignézi — de semmi nem akadályozza meg, hogy egy új teszt visszatérjen a
   string-alakra, és attól kezdve megint `Partial<unknown>` legyen a mérce. Az a
   visszacsúszás néma: nem hibázik semmi, csak megszűnik az ellenőrzés.

   MIÉRT SZÖVEGES VIZSGÁLAT. A kérdés SZINTAKTIKAI („milyen alakban van leírva a
   hívás?"), és erre futásidőben semmi nem tud felelni: a mockolt modul a
   betöltés után ugyanúgy néz ki mindkét alakból. Ahol futásidejű tárgy is tudja a
   választ, ott azt kérdezzük meg helyette (l. backend/src/authBoundary.test.js).

   MIT NEM VÉD. Csak a HELYBEN leírt szöveges útvonalat látja. Ha valaki
   változóba teszi az útvonalat (`vi.mock(MODULE, …)`), az átcsúszik — de az az
   alak itt nem fordul elő, és a szándékos megkerülést ez az őr nem is hivatott
   megakadályozni: a véletlen visszacsúszás ellen szól. */

/* MINDEN mock-hívás — ez adja a KONTROLL-számot. A gyűjtő alakú őr némán elnémul,
   ha a minta egyszer nem illeszkedik (átrendezett formázás, más írásmód): a
   találati halmaz üres marad, a teszt zöld. Ezért nem elég a szabálysértőket
   számolni, azt is meg kell mérni, hogy egyáltalán LÁTUNK-e mock-hívásokat.

   A minta térköz-tűrő (`\s*` a pont és a zárójel körül), mert a formázás nem
   kapcsolhatja ki az őrt — a repóban négy gyűjtő alakú őrből mind a négyben pont
   ilyen rés volt (2026-08-16). */
const ANY_MOCK = /\bvi\s*\.\s*(?:mock|doMock)\s*\(/;

/* A SZABÁLYSÉRTŐ alak: a nyitó zárójel után rögtön idézőjel jön, azaz az első
   argumentum szöveges útvonal. Mindhárom idézőjel-alakot elfogadja — a
   sablonliterált is, mert `vi.mock(`../x`)` ugyanúgy string-túlterhelés. */
const STRING_PATH = /\bvi\s*\.\s*(?:mock|doMock)\s*\(\s*["'`]/;

/* ÖNMAGÁT KIHAGYJA: a fenti magyarázatban szándékosan szerepel a tiltott alak,
   ami különben saját magát jelentené fel (ugyanaz a megoldás, mint a
   typeAssertions.test.ts-ben). Ára, hogy ebben az egy fájlban nem véd. */
const files = sourceFiles().filter((file) => file !== fileURLToPath(import.meta.url));

function matchingLines(file: string, pattern: RegExp): string[] {
    return readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) =>
            pattern.test(line) ? [`${relative(SRC_ROOT, file)}:${index + 1}`] : []);
}

describe("a vi.mock hívások alakja (string-útvonalnál a fordító nem ellenőriz)", () => {
    /* KONTROLL. Ha a bejárás vagy a minta elromlik, ez bukik el elsőként — az
       „elnémult őr" rosszabb, mint ha teszt sem lenne.

       A küszöb ALSÓ KORLÁT, nem darabszám: a 15 a 2026-08-18-án MÉRT 19 hívás
       alatt van. Így a tesztek bővülése (több mock) sosem teszi pirossá, egy-két
       mock törlése sem, egy tömeges elnémulást viszont elkap. A „19" a komment
       része, nem az állításé — szándékosan: ha egyszer valaki ránéz, lássa,
       mennyi volt, amikor a küszöb született, de ne kelljen karbantartania. */
    it("egyáltalán talál mock-hívásokat (különben némán semmit sem őrizne)", () => {
        const calls = files.flatMap((file) => matchingLines(file, ANY_MOCK));

        expect(calls.length).toBeGreaterThan(15);
    });

    it("egyetlen vi.mock sem kap szöveges útvonalat", () => {
        const offenders = files.flatMap((file) => matchingLines(file, STRING_PATH));

        expect(offenders, `Itt szöveges útvonalat kap a vi.mock: ${offenders.join(", ")}. ` +
            `Ilyenkor a gyár típusa Partial<unknown>, tehát a mock alakját SENKI nem ` +
            `ellenőrzi. Írd át import()-os alakra: vi.mock(import("./modul"), …).`).toEqual([]);
    });
});
