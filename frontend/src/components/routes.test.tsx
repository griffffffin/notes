import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {act, render, waitFor} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {renderRoutes} from "../test/renderRoutes";
import {axiosResponse} from "../test/axiosResponse";
import {rememberSection, SECTIONS} from "./Navbar/sections";
import {CreateEntry} from "./routes";
import {PATHS} from "../paths";
import {giveDraftKey} from "../test/draftKey";
import {clearDraftKey} from "../draftCrypto";
import {draftKey, saveDraft} from "../drafts";

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

/* AZ AZONOSÍTÓ-GYÁRTÁS SZÁMLÁLÓJA — a VALÓDI megvalósítás marad, csak megszámoljuk,
   hányszor hívták. Egy konstansra cserélt pótlék itt kárt tenne: a lenti próbák egy
   része épp azt kéri számon, hogy két nekifutás KÜLÖNBÖZŐ azonosítót kap. */
const {mintCount} = vi.hoisted(() => ({mintCount: vi.fn()}));
vi.mock(import("../objectId"), async (importOriginal) => {
    const actual = await importOriginal();
    return {newObjectId: (...args: Parameters<typeof actual.newObjectId>) => {
        mintCount();
        return actual.newObjectId(...args);
    }};
});

beforeEach(() => {
    localStorage.clear();
    /* A LÉTREHOZÓ BELÉPŐ IS a piszkozat-kulcsra vár (routes.tsx CreateEntry): a
       félbehagyott create azonosítója TITKOSÍTVA fekszik a tárolóban, tehát kulcs
       nélkül nem olvasható ki — és egy új azonosítóval mentve MÁSODPÉLDÁNY
       keletkezne. Élesben a bejelentkezés szerzi meg a kulcsot; itt a mockolt auth
       miatt kézzel adjuk oda (l. test/draftKey.ts). */
    giveDraftKey();
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

                /* NEM pontos egyenlőség, hanem "ott vagy alatta". A létrehozó cím
                   ugyanis TOVÁBB IRÁNYÍT: az új elem azonosítóját fűzi hozzá
                   (/to-dos/create → /to-dos/create/<id>, l. routes.tsx CreateEntry).
                   Amit ez a próba őriz, az nem a cím betűje, hanem hogy nem estünk
                   a `*`-ágra — vagyis nem a MÁSIK szekcióban kötöttünk ki. */
                expect(window.location.pathname,
                    `A ${target.path} címen nem áll route: az alkalmazás átdobott a ` +
                    `${other.path} címre. Vedd fel a hiányzó <Route>-ot a routes.tsx-be — ` +
                    "enélkül a szekció-váltó (és a '+' gomb) némán nem visz sehova.",
                ).toMatch(new RegExp("^" + target.path.replace(/\//g, "\\/") + "(\\/|$)"));
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

/* A LÉTREHOZÁS BELÉPŐJE: honnan kapja az új elem az azonosítóját.

   A "+" gomb a csupasz `/create` címre mutat — linkként, hogy megmaradjon az
   állapotsori cím és az "új lapon megnyitás". Az azonosítót ezért az odaérkezés
   adja hozzá, és ez NEM kényelmi kérdés: a létrehozás idempotenciája ezen az
   azonosítón áll (backend/src/controllers/createOnce.js). Az útvonalban azért él,
   hogy egy F5-öt is túléljen — enélkül a visszatöltött szöveg mentése ÚJ elemként
   menne át, épp abban a helyzetben duplikálva, ami ellen a védelem készült.

   Két dolgot kell egyszerre tudnia, és a kettő ellentétes irányba húz: minden ÚJ
   nekifutás kapjon SAJÁT azonosítót, de egy FÉLBEHAGYOTT nekifutás folytatása
   ugyanazt kapja vissza. Ezért néz bele a piszkozatba. */
describe("a létrehozás belépője azonosítót ad az új elemnek", () => {
    for (const section of SECTIONS) {
        it(`${section.label} — a csupasz létrehozó cím azonosítóra irányít`, async () => {
            renderRoutes(section.createPath);
            await settle();

            expect(window.location.pathname)
                .toMatch(new RegExp("^" + section.createPath.replace(/\//g, "\\/") + "\\/[0-9a-f]{24}$"));
        });
    }

    it("két külön nekifutás KÜLÖNBÖZŐ azonosítót kap", async () => {
        /* Ha az azonosító egyszer születne és ottragadna (mondjuk egy memózott
           linkben), a MÁSODIK létrehozás a szerver szemében a már megtörtént első
           ismétlése volna: az idempotencia miatt csendben NEM jönne létre semmi.
           Ez a próba pont azt a némaságot zárja ki. */
        renderRoutes(PATHS.todoCreate);
        await settle();
        const first = window.location.pathname;

        renderRoutes(PATHS.todoCreate);
        await settle();

        expect(window.location.pathname).not.toBe(first);
    });

    it("FÜGGŐ piszkozat esetén annak az azonosítóját folytatja", async () => {
        /* A félbehagyott létrehozás szövege a "+"-ra ugyanúgy visszatér, mint
           eddig — és ami fontosabb: UGYANAZZAL az azonosítóval megy majd a
           szerverre. Ha itt új azonosító születne, egy elbukottnak hitt, valójában
           célba ért mentés után másodpéldány keletkezne. */
        const PENDING = "507f1f77bcf86cd799439011";
        localStorage.setItem("notes-draft:to-dos:create", JSON.stringify({
            savedAt: Date.now(),
            itemId: PENDING,
            payload: {title: "Félbehagyott", category: "otthon", color: "danger", order: 1,
                tasks: {}, taskOrder: []},
        }));

        renderRoutes(PATHS.todoCreate);
        await settle();

        expect(window.location.pathname).toBe(PATHS.todoCreateItem(PENDING));
    });

    it("KULCS NÉLKÜL nem gyárt azonosítót — megvárja, és a piszkozatét folytatja", async () => {
        /* EZ A LEGALATTOMOSABB ESET, és a titkosítással KELETKEZETT: a piszkozat
           azonosítója titkosítva fekszik a tárolóban, tehát kulcs nélkül nem
           olvasható. Ha ilyenkor új azonosító születne (a lapbetöltés utáni ~61
           ms-ban), a visszatöltött szöveg MÁS azonosítóval menne a szerverre — és
           egy elbukottnak hitt, valójában célba ért mentés után MÁSODPÉLDÁNY
           keletkezne. Semmi nem hibázna közben. */
        const PENDING = "507f1f77bcf86cd799439011";
        saveDraft(draftKey("to-dos", null),
            {title: "Félbehagyott", category: "otthon", color: "danger", order: 1,
                tasks: {}, taskOrder: []},
            undefined, PENDING);
        // A lap újratöltése: a kulcs a memóriából eltűnik, a piszkozat marad.
        clearDraftKey();
        mintCount.mockClear();

        renderRoutes(PATHS.todoCreate);
        await settle();

        expect(mintCount, "Kulcs nélkül nem szabad azonosítót gyártani — a piszkozaté elveszne.")
            .not.toHaveBeenCalled();
        expect(window.location.pathname).toBe(PATHS.todoCreate);

        // A kulcs megérkezik: innentől a piszkozat azonosítóját folytatjuk.
        act(() => { giveDraftKey(); });

        await waitFor(() => expect(window.location.pathname).toBe(PATHS.todoCreateItem(PENDING)));
        expect(mintCount).not.toHaveBeenCalled();
    });

    it("LEJÁRT piszkozat azonosítóját NEM folytatja", async () => {
        // Lejárt piszkozatból nem folytatunk: a szerkesztő úgyis eldobja a szövegét.
        const EIGHT_DAYS = 8 * 24 * 60 * 60 * 1000;
        localStorage.setItem("notes-draft:to-dos:create", JSON.stringify({
            savedAt: Date.now() - EIGHT_DAYS,
            itemId: "507f1f77bcf86cd799439011",
            payload: {title: "Régi", category: "otthon", color: "danger", order: 1, tasks: {}, taskOrder: []},
        }));

        renderRoutes(PATHS.todoCreate);
        await settle();

        expect(window.location.pathname).not.toBe(PATHS.todoCreateItem("507f1f77bcf86cd799439011"));
        expect(window.location.pathname).toMatch(/^\/to-dos\/create\/[0-9a-f]{24}$/);
    });
});

/* AZ AZONOSÍTÓ EGYSZER SZÜLETIK — az újrarender nem gyárt másikat.

   Ezt a route-fán át nem lehet számon kérni: a belépő egyetlen render után
   továbbnavigál, tehát a rendernkénti újragyártás a végső címben nem látszana meg
   (a mutáció-próba pontosan ezt mutatta: a `useState` kivételére EGYETLEN teszt
   sem bukott meg). Ezért itt KÖZVETLENÜL rendereljük, és kikényszerítünk egy
   újrarendert — ez élesben sem elméleti: a belépő az App propjai alatt ül, tehát
   egy beérkező kategória-lista is újrarendereli, mielőtt a navigáció lefutna.

   Ha az azonosító renderenként születne, a `<Navigate>` célja MENET KÖZBEN
   változna: a felhasználó egy másik azonosítójú címen kötne ki, mint ahova az
   első render küldte volna — némán, és a piszkozatától elszakadva. */
describe("a belépő azonosítója újrarenderre sem változik", () => {
    it("kétszeri render mellett is EGYSZER gyárt azonosítót", () => {
        mintCount.mockClear();
        /* MINDEN HÍVÁS ÚJ ELEMET ad. Ha ugyanazt a referenciát adnánk vissza, a React
           kihagyná az újrarenderelést (azonos elem = nincs mit tenni), és a próba
           némán semmit sem mérne — először pontosan ez történt. */
        const entry = () => (
            <MemoryRouter initialEntries={["/to-dos/create"]}>
                <CreateEntry section="to-dos" build={PATHS.todoCreateItem}/>
            </MemoryRouter>
        );

        const {rerender} = render(entry());
        rerender(entry());

        expect(mintCount).toHaveBeenCalledTimes(1);
    });
});
