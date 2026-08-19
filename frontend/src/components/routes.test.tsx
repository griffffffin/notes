import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {renderRoutes} from "../test/renderRoutes";
import {axiosResponse} from "../test/axiosResponse";
import {rememberSection, SECTIONS} from "./Navbar/sections";
import {PATHS} from "../paths";

/* Az ISMERETLEN ÚT sorsa (a route-fa "*"-ága).

   Eddig bedrótozottan a to-do listára vitt. Ez azért volt rossz, mert néma és
   következetlen: aki az idézetek közt dolgozott és elrontott egy címet (vagy egy
   régi könyvjelzőt nyitott meg), az átesett a MÁSIK szekcióba, mindenféle jelzés
   nélkül — miközben a gyökér (/) ugyanakkor már az utolsó megnyitott szekcióra
   vitt. Két átirányítás, két különböző cél, ugyanarra a kérdésre.

   ITT NINCS ÉRTELMES HIBAÜZENET. Egy elgépelt cím a szűrt nézetek miatt nem is
   megkülönböztethető egy kihalt szűrőtől, ezért az átirányítás a helyes válasz —
   csak oda kell vinnie, ahol a felhasználó dolgozott. (ELTÉRÉS: a megosztott
   idézet halott linkje NEM így viselkedik: az /quotes/:author/:id egy LÉTEZŐ
   címforma nem létező azonosítóval, ott a szerver mondja meg, hogy nincs ilyen —
   ezért ott beszédes üzenet áll, nem átirányítás. L. Quotes/public.tsx.)

   A tesztek az ÜRES listát adják vissza mindenre: minket nem a lista tartalma
   érdekel, hanem hogy hol kötünk ki. A címet a `window.location.pathname`-ből
   olvassuk, mert a `<Navigate>` valódi navigációt hajt végre a data routerben. */

const {auth, handleAxios} = await vi.hoisted(async () => {
    const {mockAuth} = await import("../test/mockAuth");
    return mockAuth({isLoggedIn: true});
});
vi.mock(import("../contexts/auth-context"), () => ({useAuth: () => auth}));

beforeEach(() => {
    localStorage.clear();
    handleAxios.mockReset();
    // Minden lekérés üres listával/nullával válaszol — a nézetek felállnak, de
    // nincs adat, amit a teszt véletlenül megfogna.
    handleAxios.mockImplementation((url, data, then) => {
        then(axiosResponse([]));
        return Promise.resolve();
    });
});

describe("ismeretlen út → az UTOLSÓ megnyitott szekció főoldala", () => {
    it("üres emlékezettel az első szekcióra visz", async () => {
        renderRoutes("/nincs-ilyen-oldal");

        await waitFor(() => expect(window.location.pathname).toBe(PATHS.todos));
    });

    it("ha legutóbb az idézetek közt jártunk, ODA visz — nem a to-do listára", async () => {
        rememberSection(PATHS.quotes);

        renderRoutes("/nincs-ilyen-oldal");

        await waitFor(() => expect(window.location.pathname).toBe(PATHS.quotes));
    });

    /* A to-do névtér elgépelése is a "*"-ágra esik (a /to-dos/valami egyik
       mintára sem illik), tehát az idézeteknél dolgozó felhasználót sem rántja át
       a to-dókhoz. */
    it("a szekción belüli elgépelés is az emlékezett szekcióba visz", async () => {
        rememberSection(PATHS.quotes);

        renderRoutes("/to-dos/nincs-ilyen-nezet");

        await waitFor(() => expect(window.location.pathname).toBe(PATHS.quotes));
    });

    it("a gyökér ugyanoda visz, mint az ismeretlen út", async () => {
        rememberSection(PATHS.quotes);

        renderRoutes(PATHS.root);

        await waitFor(() => expect(window.location.pathname).toBe(PATHS.quotes));
    });
});

/* A NÉMÁN ELROMLÓ RÉSZ, amiért ez a fájl külön blokkot kap.

   A route-fák MODUL SZINTŰ konstansok: a JSX propjai egyszer, a modul
   betöltésekor értékelődnek ki. Amíg az átirányítás célja `<Navigate
   to={lastSectionPath()}>` alakban ÁLLT A ROUTE MELLETT, ez az egy hívás a modul
   betöltésekor futott le, és az akkori értéket fagyasztotta be a route-fába —
   örökre. A későbbi szekció-váltás már nem látszott rajta.

   Ez pontosan az a fajta hiba, amit semmi nem jelez: nincs kivétel, nincs
   figyelmeztetés, az átirányítás működik, csak rossz helyre visz. Az őr egy
   apró komponens (RedirectToLastSection), ami a hívást a RENDERELÉS idejére
   teszi — és egy refaktor ezt némán visszaalakíthatná.

   A teszt ereje azon áll, hogy a szekció-emlékezetet a MODUL BETÖLTÉSE UTÁN
   írjuk át, és utána is a friss értéket várjuk. A fenti blokk ezt nem fedi le:
   ott a legelső renderelés már a végleges értékkel indul, amit egy befagyasztott
   hívás is eltalálhatna, ha véletlenül épp jó volt. */
/* MINDEN SZEKCIÓ ÚTJA ÉL A ROUTE-FÁBAN — a SECTIONS ↔ routes.tsx kötés őre.

   A szekció-lista (Navbar/sections.ts) és a route-fa két külön fájl, és semmi nem
   köti őket össze. Aki új szekciót vesz fel a listába, de a route-ot elfelejti,
   arról SEMMI nem szól: a szekció-váltó kirajzolja a menüpontot, a "+" gomb is
   megjelenik, csak épp nem visznek sehova.

   MÉRVE (2026-08-16), egy route nélküli "/movies" szekcióval — két arca van, és
   egyik sem hibaüzenet:
     - ha az emlékezett szekció MÁS: a cím némán átdob oda (a "*"-ág), tehát a
       menüpont "nem csinál semmit";
     - ha épp Ő az emlékezett: az oldal ÜRESEN marad, csak a navbarral — a "*" a
       saját címére irányítana, amit a react-router nem ismétel meg.

   A PRÓBA MÓDSZERE, és miért így: az emlékezetet SZÁNDÉKOSAN egy MÁSIK szekcióra
   állítjuk, mielőtt a vizsgált címre navigálunk. Így a hiányzó route esetén a
   fallback egy MÁS címre visz, ami mérhető — enélkül a lista első szekciójánál a
   fallback ugyanoda mutatna, és a hiba láthatatlan maradna (a fenti második arc).
   Ezért kell az előfeltétel-teszt is: két szekció alatt a módszer nem
   különböztetne meg semmit.

   MIÉRT NEM `waitFor`: az a feltétel TELJESÜLÉSÉIG próbálkozik újra, itt viszont
   azt állítjuk, hogy valami NEM változik meg. A `waitFor` az első, még
   átirányítás előtti pillanatban is zölden térne vissza. Ezért előbb hagyjuk
   lefutni a függőben lévő navigációt, és UTÁNA nézünk. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("minden szekció útja él a route-fában", () => {
    /* ELŐFELTÉTEL, nem dísz: a lenti próbák azon állnak, hogy van hova
       átirányítani. Egyetlen szekciónál a módszer némán semmit sem őrizne. */
    it("van legalább két szekció (a próba módszere ezen áll)", () => {
        expect(SECTIONS.length).toBeGreaterThan(1);
    });

    for (const section of SECTIONS) {
        /* A szekció listája ÉS a "+" gomb célja is route-ot kíván. A createPath-t
           azért külön, mert nem az útból származik: minden szekció maga mondja ki
           (l. sections.ts), tehát külön is elgépelhető. */
        const targets = [
            {what: "listája", path: section.path},
            {what: "létrehozó oldala", path: section.createPath},
        ];

        for (const target of targets) {
            it(`${section.label} — a szekció ${target.what} (${target.path}) valódi route`, async () => {
                const other = SECTIONS.find((candidate) => candidate.path !== section.path);
                if (!other) throw new Error(
                    "Csak egy szekció van, így nincs hova átirányítani — ez a próba nem " +
                    "különböztetne meg semmit. Alakítsd át, mielőtt zöldnek hiszed.");
                rememberSection(other.path);

                renderRoutes(target.path);
                await settle();

                expect(window.location.pathname,
                    `A ${target.path} címen nem áll route: az alkalmazás átdobott a ` +
                    `${other.path} címre. Vedd fel a hiányzó <Route>-ot a routes.tsx-be — ` +
                    "enélkül a szekció-váltó (és a '+' gomb) némán nem visz sehova.",
                ).toBe(target.path);
            });
        }
    }
});

/* A ROUTE-FA MINDEN ÚTJA A paths.ts-BŐL JÖN — eddig konvenció, mostantól ellenőrzés.

   Miért itt, és miért most? Mert egy MÁSIK őr feltevése ez. A
   Navbar/quoteSearchState.test.ts kapuja azt követeli meg, hogy minden
   idézet-útvonalról nyilatkozzon a navbar kereső-táblája — de az összevetést a
   PATHS-szal végzi. Ha valaki egy route-ot szó szerint ír be ide
   (`path="/quotes/favorites"`), az kikerüli a paths.ts-t, és vele együtt azt a
   kaput is: a navbar némán a `:author`-ágra esne, "favorites" szöveggel a
   mezőben. Vagyis a kapu zöld maradna egy olyan területre, amit nem véd — a
   CLAUDE.md szerint ez rosszabb, mint ha nem is lenne kapu.

   Ez a teszt a FORRÁST olvassa, nem a viselkedést, mert épp az ÍRÁSMÓD a tárgya:
   a felépült route-fából már nem látszik, hogy a "/quotes/create" a PATHS-ból
   jött-e vagy kézzel írták. (Forrás-olvasó teszt a repóban máshol is van:
   todoColors.test.ts, themeBoot.test.ts.)

   MÉRLEGELVE ÉS ELVETVE: a felépült route-fa vizsgálata. Az auth-határnál
   (backend/src/authBoundary.test.js) épp ez volt a helyes válasz a formázás-
   függőségre — ott a felépült Express router MEG TUDJA mondani, mi van
   regisztrálva. Itt NEM tudja: a route-fa csak a VÉGEREDMÉNY szövegét ismeri
   ("/quotes/create"), azt nem, hogy honnan származik. Az EREDET kérdésére
   futásidejű objektum nem tud felelni — ez a különbség dönti el, mikor érdemes a
   forrásról a valódi tárgyra váltani.

   Ráadásul volna ára is: a route-tömbök exportálása a routes.tsx-ből MÉRVE 2 db
   `react/only-export-components` figyelmeztetést hoz (az `allowConstantExport`
   nem fedi a függvényhívás eredményét), és rontja a Vite fast-refresh-t — pont
   azt, amiért az a szabály be van kapcsolva.

   A tét is más nagyságrendű: ott egy token nélkül elérhető végpont, itt egy
   rosszul kitöltött kereső-mező. Ezért itt a forrás-olvasás marad — de
   TÉRKÖZ-TŰRŐ mintával (l. lent), mert a néma kihagyás ellen az véd.

   A `*` KIVÉTEL: az a react-router saját joker-mintája, nem a mi utunk — nincs
   is helye a paths.ts-ben. */
describe("a route-fa útvonalai", () => {
    it("mind a paths.ts-ből jönnek (a '*' joker kivételével)", () => {
        const source = readFileSync(
            join(dirname(fileURLToPath(import.meta.url)), "routes.tsx"), "utf8");

        /* A `path=` prop értéke vagy JSX-kifejezés (`{PATHS.quotes}`), vagy szó
           szerinti szöveg (`"*"`). Mindkét alakot begyűjtjük, hogy a szó szerintiek
           SE tudjanak észrevétlenül elbújni.

           AZ EGYENLŐSÉGJEL KÖRÜL TÉRKÖZ IS ÁLLHAT (`\s*=\s*`), mert a JSX megengedi.
           MÉRVE (2026-08-16): enélkül a `path = "/quotes/x"` és a `path=` utáni
           sortörés is ÁTCSÚSZOTT — némán, hiszen a nem illeszkedő sor egyszerűen
           kimarad a gyűjtésből, és a lenti szűrő üres marad. Egy detektornál a
           merev formázás-feltevés pont a hamis zöld receptje. */
        /* A `.filter(…)` nem kozmetika: egy regex-csoport elvileg üresen is
           illeszkedhet, és az `undefined` a lenti `startsWith`-en némán elszállna
           — a teszt hibaüzenete pedig a detektorról szólna, nem a route-fáról. */
        const declared = [...source.matchAll(/\spath\s*=\s*(\{[^}]*\}|"[^"]*")/g)]
            .map((match) => match[1])
            .filter((value) => value !== undefined);

        /* Kontroll a hamis zöld ellen. Ha a minta egyszer nem illeszkedne (mert a
           JSX írásmódja megváltozik), az üres lista mindent átengedne — pont az a
           csapda, amit a projekt már megtapasztalt egy nem illeszkedő grepnél. */
        expect(declared.length).toBeGreaterThan(10);
        expect(declared.filter((value) => value !== "\"*\"" && !value.startsWith("{PATHS."))).toEqual([]);
    });
});

describe("az átirányítás célja NEM fagy be a modul betöltésekor", () => {
    it("a renderelések között megváltozott emlékezetet is követi", async () => {
        rememberSection(PATHS.todos);
        const first = renderRoutes("/nincs-ilyen-oldal");
        await waitFor(() => expect(window.location.pathname).toBe(PATHS.todos));
        first.unmount();

        // A felhasználó közben átment az idézetekhez (ezt írja a useRememberSection).
        rememberSection(PATHS.quotes);

        renderRoutes("/megint-nincs-ilyen");

        await waitFor(() => expect(window.location.pathname).toBe(PATHS.quotes));
    });
});
