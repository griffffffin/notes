import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

/* A `handleAxios` VÁLASZA `unknown` MARAD — ez az őr ezt védi.

   MIÉRT KELL. A projekt egyetlen szerverhívója a `handleAxios` (auth.tsx), és a
   típusa (`HandleAxios`, auth-context.ts) SZÁNDÉKOSAN `unknown`-t ad vissza: a
   `then` visszahívás `AxiosResponse<unknown>`-t kap, tehát a `response.data`
   `unknown`. Emiatt a hívó hozzá sem tud nyúlni a mezőkhöz, amíg egy valibot-
   sémával le nem szűkíti (`v.parse`, types/api.ts) — a fordító KIKÉNYSZERÍTI az
   ellenőrzést. Ez a CLAUDE.md központi szabálya: ami a programon KÍVÜLRŐL jön
   (szerver-válasz, süti, JSON.parse), az `unknown`, és a hívó valódi
   ellenőrzéssel szűkíti; a `<T>` típusparaméter NEM ellenőrzés, csak állítás.

   MI ELLEN VÉD. Két néma visszacsúszás ellen, amit semmi más nem fogna meg
   (l. CLAUDE.md silent-failure lista, [[silent-failure-test-backlog]]):

     1) valaki visszatesz egy `<T>` GENERIKUST a `HandleAxios`-ra, amitől a
        hívók újra `handleAxios<Quote[]>(…)`-tal tipizálhatnák a választ — pont
        az az üres ígéret, amit 2026-08-15-én kigyomláltunk (a felismerés:
        [[handleaxios-unchecked-generic]]);
     2) a `then` válaszának `.data`-ja némán `unknown`-ról KONKRÉT típusra csúszik
        (`AxiosResponse<Session>` stb.), amivel megint ellenőrzés nélkül lehetne
        olvasni a mezőket.

   MIÉRT FORRÁS-SZKEN, NEM FORDÍTÁSI IDEJŰ TÍPUS-ÁLLÍTÁS. A kézenfekvő ötlet egy
   `Equals<Parameters<HandleAxios>…, unknown>` fordítási idejű állítás lenne, DE
   AZ AZ 1-est NEM FOGNÁ MEG: a `Parameters` egy generikus szignatúrán a
   típusparamétert a defaultjára/`unknown`-ra oldja fel, tehát a `<T>` visszatétele
   után is `unknown`-t látna, és zölden átmenne (mérve). Ezért — ahogy a
   `typeAssertions.test.ts` a `querySelector<T>`-nél — a DEFINÍCIÓS SZÖVEGET
   nézzük. Kevésbé elegáns, mint egy linter, de ugyanazt teszi: nem az emberi
   figyelmen múlik. A nagybetűs `HandleAxios` TÍPUST szkenneljük, nem a kisbetűs
   `handleAxios` hívásokat — így a doksi-kommentek `handleAxios<Quote[]>` példái
   nem adnak hamis találatot.

   AZ ÁTNEVEZÉST a lenti KONTROLL fogja meg: ha a `HandleAxios` név eltűnik a
   fájlból, a `toContain("export type HandleAxios")` HANGOSAN elbukik — nem
   szkennelünk csendben egy már nem létező névre. (Fordítási horgony — egy
   `import type`-os használat — nem kell: használatlan típusként a `noUnusedLocals`
   és az oxlint is elbuktatná, mérve.) */

/* A definíciós fájl a teszt mellett van (ugyanaz a könyvtár). A `fileURLToPath`
   kényszere: a Vite átírja a `new URL(import.meta.url)`-t, ezért fájlolvasáshoz a
   `dirname(fileURLToPath(...))` a helyes, nem a `new URL(...)` (l. CLAUDE.md /
   [[vite-rewrites-new-url]]). */
const AUTH_CONTEXT = join(dirname(fileURLToPath(import.meta.url)), "auth-context.ts");
const source = readFileSync(AUTH_CONTEXT, "utf8");

/* A `HandleAxios` NEM generikus: az `=` után közvetlenül a paraméterlista `(`-je
   áll, nem egy `<T>`. Ha valaki generikussá teszi, ez az alak (`= (`) eltűnik. */
const NON_GENERIC = /export type HandleAxios\s*=\s*\(/;

/* A `then` visszahívás válasza `AxiosResponse<unknown>` — tehát `response.data`
   `unknown`. Ez a tulajdonképpeni kapu. */
const THEN_RESPONSE_UNKNOWN = /then:\s*\(response:\s*AxiosResponse<unknown>\)\s*=>\s*void/;

describe("handleAxios: a válasz `unknown` marad (a hívó `v.parse`-szal szűkít)", () => {
    /* KONTROLL az elnémult őr ellen. Ha a fájl útja elromlik, a `readFileSync`
       HANGOSAN dob (nem zöld hamis siker); de ha valaha kiürülne vagy a típus
       neve megváltozna, ez a horgony fogja meg, hogy nem üres/idegen szövegen
       futunk. */
    it("az auth-context.ts betöltődik és tartalmazza a HandleAxios típust", () => {
        expect(source.length).toBeGreaterThan(0);
        expect(source).toContain("export type HandleAxios");
    });

    it("a HandleAxios nem generikus (nincs visszacsempészett `<T>` típusparaméter)", () => {
        expect(source, "A HandleAxios generikussá vált: az `=` után `<T>` áll, nem `(`. " +
            "Egy generikus paraméterrel a hívó megint `handleAxios<Quote[]>(…)`-tal " +
            "tipizálhatná a szerver válaszát — az nem ellenőrzés, csak állítás. A válasz " +
            "maradjon `unknown`, a hívó pedig `v.parse`-szal szűkítsen (types/api.ts).")
            .toMatch(NON_GENERIC);
    });

    it("a then-válasz AxiosResponse<unknown> (a response.data `unknown`)", () => {
        expect(source, "A handleAxios `then`-válaszának adata már nem `unknown`. Ezzel a " +
            "hívó ellenőrzés nélkül olvashatná a mezőket, és ha a backend átnevez egy " +
            "mezőt, némán `undefined` jelenne meg. A response.data maradjon `unknown` — " +
            "l. CLAUDE.md (a kifelől jövő érték `unknown`, a hívó valibottal szűkít).")
            .toMatch(THEN_RESPONSE_UNKNOWN);
    });
});
