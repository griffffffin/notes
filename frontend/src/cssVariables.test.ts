import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {CSS_VARIABLES} from "./cssVariables";

/* A JS ÉS A STÍLUSLAP KÖZTI SZERZŐDÉS.

   A `--` kezdetű CSS-változókat a JS állítja be (a téma színeit a ThemeProvider,
   a per-idézet betűméretet a kártya és a szerkesztő), az index.css pedig
   `var(--…)`-ral olvassa őket. A két oldal közt SEMMILYEN eszköz nem lát
   összefüggést: a CSS nem tud a TypeScriptről, a fordító nem olvas stíluslapot.

   ÉS AZ ELCSÚSZÁSUK NÉMA, mindkét irányban:

     - ha a CSS-ben átnevezünk egy változót, a JS a régi néven ír tovább. A
       böngésző az ismeretlen változó beállítását ELFOGADJA (nem hibázik), a rá
       hivatkozó szabály viszont érvénytelen lesz, és az öröklött értékre esik
       vissza. A gomb nem tűnik el — csak más színű lesz, mint amit vártunk;
     - ha a CSS olvas egy változót, amit senki nem állít be, ugyanez történik,
       csak kezdettől fogva.

   A minta ugyanaz, mint a backend-frontend kötéseknél
   (backend/src/frontendContract.test.js) és a boot-szkriptnél
   (contexts/themeBoot.test.ts): az ÉRTÉKEKET nem rögzítjük — a színek szabadon
   változhatnak —, csak azt kérjük számon, hogy a két oldal UGYANARRÓL A NÉVRŐL
   beszél.

   A stíluslapot FÁJLKÉNT olvassuk, nem importálva: az igazság a kiszolgált
   CSS-ben van. Az útvonal-számolás alakja KÖTÖTT (`fileURLToPath`, nem
   `new URL(…, import.meta.url)`): az utóbbit a Vite eszköz-hivatkozásnak nézi és
   fordításkor átírja — l. a contexts/themeBoot.test.ts részletes indoklását. */
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "index.css"), "utf8");
const styleObjectTypes = readFileSync(join(here, "types/cssVariables.d.ts"), "utf8");

/* A Bootstrap SAJÁT változói (--bs-…) kimaradnak: azokat a Bootstrap állítja be
   és olvassa, a mi két oldalunknak semmi köze hozzájuk. Az index.css több helyen
   felülír ilyeneket (pl. --bs-btn-bg), de az a Bootstrappel folytatott
   párbeszéd, nem a miénk. */
const isOurs = (name: string) => !name.startsWith("--bs-");

const unique = (names: string[]) => [...new Set(names)].sort();

const matchAll = (text: string, pattern: RegExp) =>
    [...text.matchAll(pattern)].map((match) => match[1]).filter((name) => name !== undefined);

/* A NEVEKET A LEZÁRÓJUKIG OLVASSUK (negált karakterosztály), nem egy megengedett
   karakterkészletig — és ez a különbség egy NÉMA LYUKAT tömít be.

   Egy `[a-z0-9-]+` alakú minta ugyanis nem ELVÉTI a szabálytalan nevet, hanem
   CSONKOLJA: a `var(--theme-textColor)`-ból `--theme-text` lesz. Az pedig LÉTEZŐ
   név, tehát a lenti két összevetés elégedetten átengedi — miközben a
   `--theme-textColor`-t valójában senki nem állítja be, és a rá épülő szabály
   némán az öröklött értékre esik vissza. MÉRVE (2026-08-16): a kebab-nevű
   `var(--nincs-ilyen)` fennakadt, a `var(--theme-textColor)` NEM. És épp ez a
   valószínű eset: egy meglévő változó variánsát nevezi el így az ember.

   A karakterosztály BŐVÍTÉSE (mondjuk `[\w-]`) csak arrébb tolná a határt — egy
   ékezetes vagy escape-elt név ugyanígy csonkolna. A lezáró viszont mindig ismert:
   a `var(…)`-ban vessző vagy zárójel, a definícióban kettőspont, a .d.ts-ben az
   idézőjel. Így a név a teljes hosszában megvan, bármilyen karakterekből áll. */

/* Amit az index.css OLVAS: minden var(--…) hivatkozás. */
const readByCss = unique(matchAll(css, /var\(\s*(--[^\s,)]+)/g).filter(isOurs));

/* Amit az index.css MAGA DEFINIÁL (pl. --icon-check): ezeknek nem kell JS-től
   érkezniük, a stíluslapon belüli saját ügyek. */
const definedInCss = unique(matchAll(css, /^\s*(--[^\s:]+)\s*:/gm).filter(isOurs));

/* Amit a JS ÍR. Két forrásból, mert két mechanizmus van (l. cssVariables.ts):
   a setProperty-vel írt nevek ebből a modulból, a JSX style-objektumban átadottak
   pedig a típus-kiegészítésből. Az utóbbit SZÖVEGKÉNT olvassuk, mert egy .d.ts
   fájlból nem lehet FUTÁSIDEJŰ értéket importálni — nem is fordul le semmi
   belőle. */
const styleObjectNames = unique(matchAll(styleObjectTypes, /"(--[^"]+)"\s*\??\s*:/g));
const writtenByJs = unique([...Object.values(CSS_VARIABLES), ...styleObjectNames]);

describe("CSS-változók — a JS és az index.css ugyanazokat a neveket használja", () => {
    /* KONTROLL. A fenti minták bármelyike elnémulhat: ha a .d.ts alakja változik,
       a regex nem illeszkedik, és a teszt attól kezdve ZÖLDEN futna, miközben
       semmit nem őriz. Az ilyen "elnémult őr" rosszabb, mint ha teszt sem lenne —
       ezért mindhárom halmaznak tartalmaznia kell valamit. */
    it("a kiolvasás maga működik (különben a teszt némán semmit sem őrizne)", () => {
        expect(styleObjectNames.length).toBeGreaterThan(0);
        expect(readByCss.length).toBeGreaterThan(0);
        expect(definedInCss.length).toBeGreaterThan(0);
    });

    it("amit a JS beállít, azt az index.css olvassa is", () => {
        const unused = writtenByJs.filter((name) => !readByCss.includes(name));

        expect(unused, `A JS beállítja ezeket a változókat, de az index.css egyiket sem olvassa: ` +
            `${unused.join(", ")}. Vagy elírás/átnevezés történt a stíluslapon (ilyenkor a stílus ` +
            `némán az öröklött értékre esik vissza), vagy a változó feleslegessé vált és törölhető.`).toEqual([]);
    });

    it("amit az index.css olvas, azt valaki be is állítja", () => {
        const unset = readByCss.filter(
            (name) => !writtenByJs.includes(name) && !definedInCss.includes(name));

        expect(unset, `Az index.css ezekre a változókra hivatkozik, de senki nem állítja be őket ` +
            `(sem a JS, sem maga a stíluslap): ${unset.join(", ")}. Az ilyen szabály érvénytelen, ` +
            `és az öröklött értékre esik vissza — hibaüzenet nélkül.`).toEqual([]);
    });
});

/* A PÖRGÉS SEBESSÉGE — CSS↔CSS szerződés, két KÜLÖN fájl közt.

   A kategória-újratöltő ikon (.category-retry) azért pörög a Bootstrap
   betöltő-karikájának ütemére, hogy a felületen EGYFÉLE "dolgozom" sebesség
   legyen. A két érték viszont két külön stíluslapon él: a miénk az index.css-ben,
   a Bootstrapé a node_modules-ban — CSS-változóval nem lehet összekötni őket
   (a --bs-spinner-animation-speed CSAK magukon a spinner-elemeken van
   definiálva, tehát egy var() innen mindig a fallbackre esne, és a kötés csak
   LÁTSZANA élőnek). Marad a másolt szám, amit teszt őriz.

   Ez ugyanaz a minta, mint a backend-frontend kötéseknél
   (backend/src/frontendContract.test.js): az ÉRTÉKET nem rögzítjük — a Bootstrap
   szabadon változtathat rajta —, csak azt kérjük számon, hogy a kettő EGYEZIK.

   A Bootstrap alap-szabályát olvassuk, nem a csökkentett mozgásút: az utóbbi egy
   @media blokkban lassít 1.5 s-ra, és minket a normál ütem érdekel. */
describe("A pörgés sebessége a Bootstrap spinneréé", () => {
    const bootstrapCss = readFileSync(
        join(here, "..", "node_modules", "bootstrap", "dist", "css", "bootstrap.min.css"), "utf8");

    /* A `.spinner-border{…}` ALAP szabály (a @media-s felülírás selectora
       `.spinner-border,.spinner-grow`, tehát erre a mintára nem illeszkedik). */
    const spinnerSpeed = /\.spinner-border\{[^}]*--bs-spinner-animation-speed:\s*([^;}]+)/
        .exec(bootstrapCss)?.[1]?.trim();
    const iconSpeed = /\.category-retry\s*\{[^}]*--fa-animation-duration:\s*([^;}]+)/
        .exec(css)?.[1]?.trim();

    /* KONTROLL. Mindkét kiolvasás KIVEVŐ alakú: ha a minta elnémul (a Bootstrap
       átrendezi a CSS-ét, vagy nálunk átnevezik az osztályt), `undefined` jön —
       és két undefined EGYENLŐ volna egymással, vagyis a lenti állítás zölden
       őrizne semmit. Ezért előbb azt kérjük számon, hogy egyáltalán találtunk. */
    it("mindkét értéket meg is találjuk (különben a lenti állítás semmit sem őriz)", () => {
        expect(spinnerSpeed, "a Bootstrap .spinner-border animációs sebessége nem található").toBeDefined();
        expect(iconSpeed, "a .category-retry --fa-animation-duration értéke nem található").toBeDefined();
    });

    it("az ikon egy fordulata annyi ideig tart, mint a betöltő-karikáé", () => {
        expect(iconSpeed,
            `Az újratöltő ikon ${iconSpeed} alatt fordul körbe, a Bootstrap betöltő-karikája ` +
            `viszont ${spinnerSpeed} alatt. A kettőnek egyeznie kell: ugyanazt az állapotot ` +
            `("dolgozom") jelzik, két különböző ütem pedig két különböző dolognak látszik. ` +
            `Ha a Bootstrap változtatott, vezesd át az index.css .category-retry szabályára.`
        ).toBe(spinnerSpeed);
    });
});
