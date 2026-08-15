import {waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {renderRoutes} from "../test/renderRoutes";
import {axiosResponse} from "../test/axiosResponse";
import {rememberSection} from "./Navbar/sections";
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
