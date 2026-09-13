import {act, render, screen, waitFor} from "@testing-library/react";
import {memo} from "react";
import {CookiesProvider} from "react-cookie";
import {MemoryRouter} from "react-router-dom";
import {beforeEach, describe, expect, it, vi} from "vitest";
import Read from "./read";
import {ThemeProvider} from "../../contexts/theme";
import {renderRoutes} from "../../test/renderRoutes";
import {axiosResponse} from "../../test/axiosResponse";
import {dragEndEvent, dragStartEvent} from "../../test/dndEvents";
import {requireElement} from "../../test/dom";
import type {DragEndEvent, DragStartEvent} from "@dnd-kit/core";
import type {AxiosResponse} from "axios";
import type {Todo} from "../../types/api";
import {at} from "../../test/at";

/* A Context-mock ÁLLANDÓ objektumot adjon vissza: a komponens effektje a
   handleAxios azonosságára van felfüggesztve, így egy rendernként újra gyártott
   függvény végtelen újratöltő ciklust okozna. A pótlék a közös segédből jön
   (test/mockAuth.ts), tehát a TELJES Auth alakot adja — a korábbi kézzel írt
   `{isLoggedIn, handleAxios}`-ból hiányzott a token, a login és a logout. */
const {auth, handleAxios} = await vi.hoisted(async () => {
    const {mockAuth} = await import("../../test/mockAuth");
    return mockAuth({isLoggedIn: true});
});
const {linkClicked} = vi.hoisted(() => ({linkClicked: vi.fn()}));

vi.mock(import("../../contexts/auth-context"), () => ({useAuth: () => auth}));

/* Valódi húzást jsdom-ban nem tudunk lejátszani: nincs benne elrendezés, tehát
   a dnd-kit nem tudja kiszámolni, mi fölött járunk. A húzás VÉGE viszont egy
   sima függvényhívás (onDragEnd), amit a könyvtár ad át — ezt kapjuk el, és
   hívjuk közvetlenül. A DndContext többi részét nem bántjuk.

   A pótlék `memo`-val készül (a valódi DndContext `NamedExoticComponent`, egy
   nyers függvénykomponens nem áll a helyére), a `vi.mock` pedig import()-tal veszi
   át a modult — enélkül az `importOriginal()` `unknown`-t adna, és a `...actual`
   szórás sem fordulna. */
/* A kém alakja KIMONDVA, a gyár VISSZATÉRÉSI TÍPUSAKÉNT — nem `null as (…) | null`
   alakban. Az `as` csak állítaná, hogy a `null` ilyen típusú; az annotáció
   ellenőrzi, hogy a visszaadott objektum tényleg az. A `null` kezdőérték típusát
   így is ki kell mondani (l. CLAUDE.md, "Kezdőérték ≠ típus"), csak ellenőrzött
   módon. Párja: DragAndDrop/dragAndDrop.test.tsx. */
type DndSpy = {
    endDrag: ((event: DragEndEvent) => void) | null;
    startDrag: ((event: DragStartEvent) => void) | null;
};
const dnd = vi.hoisted((): DndSpy => ({endDrag: null, startDrag: null}));

vi.mock(import("@dnd-kit/core"), async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        DndContext: memo(({children, onDragEnd, onDragStart}) => {
            dnd.endDrag = onDragEnd ?? null;
            dnd.startDrag = onDragStart ?? null;
            return children;
        }),
    };
});


/* A kérés TÖRZSE a kém felől `unknown` (bármit küldhet a hívó), a szűrt
   lekérésnél viszont a szűrő nevére van szükségünk. Ezt VALÓDI vizsgálattal
   olvassuk ki — `as`-szal csak állítanánk, hogy ott van. Ha a szűrt lekérés
   egyszer más alakú törzset küldene, ez azonnal, beszédesen bukik. */
const filterOf = (data: unknown): string => {
    if (typeof data === "object" && data !== null && "category" in data
        && typeof data.category === "string") return data.category;
    throw new Error(`a szűrt lekérés törzsében nincs category: ${JSON.stringify(data)}`);
};

/* A sorszámok SZÁNDÉKOSAN nem 1,2,3: egy szűrt nézetben (kategória/szín) a
   lista részhalmaz, tehát a sorszámok hézagosak. A húzásnak ott is helyesen
   kell működnie — épp ezért nem az indexet küldjük a szervernek. */
/* A közös mezők, amiket a szerver MINDEN to-dóval küld. A `user` és az időbélyegek
   SZÁNDÉKOSAN nincsenek itt: a lista-válasz whitelistje (backend models/todos.js
   toJSON) nem adja ki őket, mert a frontend nem használja. A fixtúra ezt tükrözi. */
const TODO_BASE = {
    percentage: 0, tasks: {}, taskOrder: [],
};

const TODOS = [
    {...TODO_BASE, _id: "a", title: "Alma", color: "warning", category: "x", order: 2},
    {...TODO_BASE, _id: "b", title: "Banán", color: "warning", category: "x", order: 5},
    {...TODO_BASE, _id: "c", title: "Cékla", color: "warning", category: "x", order: 9},
    /* A `satisfies` a szerződéshez méri a fixtúrát — egy hiányzó vagy elgépelt
       mező innentől fordítási hiba —, de megtartja a literál típusokat, így a
       "warning" a szűk TodoColor unióhoz illeszkedik, nem sima string-gé szürkül. */
] satisfies Todo[];

const renderRead = () => render(
    <CookiesProvider>
        <ThemeProvider>
            <MemoryRouter><Read url="/to-dos" handleLinkClicked={linkClicked}/></MemoryRouter>
        </ThemeProvider>
    </CookiesProvider>
);

beforeEach(() => {
    linkClicked.mockClear();
    handleAxios.mockReset();
    handleAxios.mockImplementation((url, data, then) => {
        if (url === "/to-dos") then(axiosResponse(TODOS));
        else then(axiosResponse({}));
        return Promise.resolve();
    });
});

describe("Read", () => {
    it("kilistázza a to-dókat", async () => {
        renderRead();
        expect(await screen.findByText("Alma")).toBeVisible();
        expect(screen.getByText("Cékla")).toBeVisible();
    });

    it("a kártyák a húzáshoz szükséges kapaszkodót megkapják", async () => {
        renderRead();
        await screen.findByText("Alma");
        // A dnd-kit a húzható elemekre teszi ki ezt a szerepet.
        expect(document.querySelectorAll("[role='button'][aria-roledescription]").length).toBe(3);
    });

    /* A húzás vége. A "nem küld" állításokat CSAK a küldő ággal együtt szabad
       hinni: ha a mentés egyáltalán nem működne, az alábbi két teszt attól is
       zöld lenne. Ezért a sorrend: előbb a fő út. */
    const dropOn = async (activeId: string, overId: string | null) => {
        renderRead();
        await screen.findByText("Alma");
        handleAxios.mockClear();   // a lista betöltése is egy hívás volt
        if (!dnd.endDrag) throw new Error("a DndContext-pótlék nem kapott onDragEnd-et");
        const endDrag = dnd.endDrag;
        act(() => endDrag(dragEndEvent(activeId, overId)));
    };

    it("másik kártyára húzva a CÉLKÁRTYA sorszámát küldi, nem az indexét", async () => {
        await dropOn("a", "c");
        // A "Cékla" sorszáma 9 (nem 2), mert a szűrt nézetek listája hézagos.
        expect(handleAxios).toHaveBeenCalledWith("/to-dos/reorder", {id: "a", order: 9},
            expect.any(Function), expect.any(Function));
    });

    it("ugyanoda visszaengedve nem szól a szervernek", async () => {
        await dropOn("a", "a");
        expect(handleAxios).not.toHaveBeenCalled();
    });

    it("a listán kívül elengedve nem szól a szervernek", async () => {
        await dropOn("a", null);
        expect(handleAxios).not.toHaveBeenCalled();
    });

    /* A kártya tartalma LINK, és a húzás végén nem szabad navigálnia.

       A defaultPrevented ÖNMAGÁBAN nem mond semmit: a react-router <Link>-je is
       preventDefault-ot hív minden kattintáson (hiszen a natív navigáció helyett
       ő navigál), tehát mindig igaz. Ezért a link KEZELŐJÉT figyeljük: ha az nem
       fut, a react-router nem navigál. A natív oldalbetöltés elleni védelmet
       (preventDefault) csak ott állítjuk, ahol már tudjuk, hogy a Link kezelője
       nem futott — ott a hívás csak a mienk lehetett. */
    const clickOn = (text: string) => {
        const event = new MouseEvent("click", {bubbles: true, cancelable: true});
        const link = screen.getByText(text).closest("a");
        if (!link) throw new Error(`a(z) "${text}" szöveg nem linkben van`);
        link.dispatchEvent(event);
        return event;
    };

    it("húzás nélkül a kattintás átmegy a linkre", async () => {
        renderRead();
        await screen.findByText("Alma");
        clickOn("Alma");
        expect(linkClicked).toHaveBeenCalled();
    });

    it("a húzást lezáró kattintás nem navigál el sehova", async () => {
        renderRead();
        await screen.findByText("Alma");
        const startDrag = dnd.startDrag;
        if (!startDrag) throw new Error("a DndContext-pótlék nem kapott onDragStart-ot");
        act(() => startDrag(dragStartEvent("a")));
        const event = clickOn("Alma");
        expect(linkClicked).not.toHaveBeenCalled();      // a react-router nem visz el
        expect(event.defaultPrevented).toBe(true);       // és a böngésző sem tölt újra
    });

    it("a húzás utáni MÁSODIK kattintás már megint átmegy", async () => {
        renderRead();
        await screen.findByText("Alma");
        const startDrag = dnd.startDrag;
        if (!startDrag) throw new Error("a DndContext-pótlék nem kapott onDragStart-ot");
        act(() => startDrag(dragStartEvent("a")));
        clickOn("Alma");                    // ezt nyeli el
        clickOn("Alma");
        expect(linkClicked).toHaveBeenCalledTimes(1);
    });

    /* Magát a levágást nem tudjuk itt ellenőrizni: a jsdom nem számol
       elrendezést, tehát nincs mit kilógnia. Azt viszont igen, hogy a rács
       megkapja az osztályt, amire a szabály épül (index.css: .todo-grid).
       Enélkül húzás közben fél pixelen megjelenik a vízszintes gördítősáv, és a
       hiba NÉMA lenne: az osztály eltűnése semmit nem törne el látványosan. */
    it("a rács megkapja a vízszintes levágást vezérlő osztályt", async () => {
        renderRead();
        await screen.findByText("Alma");
        const grid = requireElement(".todo-grid", HTMLElement);
        expect(grid).toBeInTheDocument();
        // Ugyanazon a dobozon kell lennie, amiben a kártyák ülnek.
        expect(grid.querySelectorAll("[aria-roledescription]").length).toBe(3);
    });
});

describe("Szűrő az URL-ből", () => {
    /* A szűrt nézetek a :name URL-szegmensből tudják, mire szűrjenek. A csupasz
       /category vagy /color (name nélkül) nem illeszkedik a /category/:name
       mintára, ezért a "*" ág főoldali listája jön — nem a szűrt nézet, és
       főleg nem egy örökké pörgő betöltő (a régi, navigációs state-re épülő kód
       F5-nél üres szűrőt küldött, amit a szerver elutasított, a spinner meg
       örökre pörgött). */
    it("/to-dos/category/:name a dekódolt name-mel szűrt kérést küld", async () => {
        handleAxios.mockImplementation((url, data, then) => {
            then(axiosResponse(url === "/to-dos" ? TODOS : []));
            return Promise.resolve();
        });
        /* A %20 a szóköz, a %C5%91 az "ő" kódja: a Link encodeURIComponenttel
           kódol, a React Router dekódolva adja a :name-et — így a szóközös/ékezetes
           kategórianév is épen ér a szűrőbe. */
        renderRoutes("/to-dos/category/otthoni%20teend%C5%91k");
        await waitFor(() => {
            const call = handleAxios.mock.calls.find((c) => c[0] === "/to-dos/category");
            expect(call?.[1]).toEqual({category: "otthoni teendők"});
        });
    });

    it("csupasz /to-dos/category a listát adja, nem szűr és nem pörög", async () => {
        renderRoutes("/to-dos/category");
        // A főoldali lista betölt (Alma), szűrő nélküli kategória-kérés nem megy ki.
        await waitFor(() => expect(screen.getByText("Alma")).toBeInTheDocument());
        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/to-dos/category");
    });

    it("csupasz /to-dos/color a listát adja, nem szűr", async () => {
        renderRoutes("/to-dos/color");
        await waitFor(() => expect(screen.getByText("Alma")).toBeInTheDocument());
        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/to-dos/color");
    });

    it("ÜRES szűrt nézet a to-do listára irányít (átsorolt/törölt utolsó elem)", async () => {
        // A kategória-szűrő üres listát ad (nincs már ilyen kategóriájú elem), a
        // főlista viszont a to-dókat.
        handleAxios.mockImplementation((url, data, then) => {
            then(axiosResponse(url === "/to-dos" ? TODOS : []));
            return Promise.resolve();
        });
        renderRoutes("/to-dos/category/otthon");
        // A kihalt szűrt nézet zsákutca → átirányít a főlistára, ahol a to-dók jönnek.
        await waitFor(() => expect(window.location.pathname).toBe("/to-dos"));
        expect(screen.getByText("Alma")).toBeInTheDocument();
    });

    it("ÜRES FŐlista nem irányít át, marad a /to-dos-n (legitim üres állapot)", async () => {
        // Egyetlen to-do sincs — ez legitim "nincs teendő", nem zsákutca.
        handleAxios.mockImplementation((url, data, then) => {
            then(axiosResponse([]));
            return Promise.resolve();
        });
        renderRoutes("/to-dos");
        // A /to-dos-n maradunk (nincs redirect), és a betöltő sem pörög tovább.
        await waitFor(() => expect(document.querySelector(".min-vh-75")).not.toBeInTheDocument());
        expect(window.location.pathname).toBe("/to-dos");
    });

    it("hiba esetén sem pörög örökké a betöltő-jelző", async () => {
        handleAxios.mockImplementation((url, data, then, catchError) => {
            catchError({response: {status: 500, data: "Sikertelen művelet."}});
            return Promise.resolve();
        });
        renderRoutes("/");

        /* A pörgő karika azt ígéri, mindjárt jön az adat — hiba után ez hazugság.
           A helyére viszont NEM üres lista kerül (az meg azt állítaná, hogy nincs
           egyetlen to-dód sem), hanem a hiány kimondása. A `.spinner-border` a
           Bootstrap karikája; a magasság-osztályt (`min-vh-75`) a hibajelzés is
           használja, tehát arra keresni félrevezető lenne. */
        expect(await screen.findByText(/Hiba az oldal betöltése közben/)).toBeVisible();
        expect(document.querySelector(".spinner-border")).not.toBeInTheDocument();
    });
});

/* VERSENYHELYZET a lista betöltésében — a useSortableCards.ts `active` zászlójának
   őre. Ez a hook szolgálja ki MIND A HÁROM lista-nézetet (to-do, idézet, keresési
   találat), és ez az az őr, amelynek a hiánya már ÉLESBEN is kárt okozott: a
   törlés utáni két lekérés fordított sorrendben ért vissza, és a régi válasz
   ragasztotta vissza a törölt to-do "szellemét". A kiváltó okra van teszt
   (Todos/modal.test.tsx: a modál gombjai type="button"-ok), magára az őrre — a
   MÁSODIK védvonalra — eddig nem volt.

   A szűrő-váltás (/category/otthon → /category/munka) ugyanazt a route-elemet
   használja, csak a :name paraméter más, tehát a komponens NEM mountol újra: a
   `filter` memo változik, és a betöltő effekt fut le megint. */
describe("Read — versenyhelyzet a lista betöltésében", () => {
    /* A fixtúra első elemét EGYSZER vesszük ki, hangos hibával, ha nincs: a
       `TODOS[0]` szétterítése `undefined` esetén CSENDBEN üres objektumot adna,
       és a "válasz" egy csupa-hiányzó-mezős to-do lenne — a teszt pedig nem azt
       mérné, amit hisz róla. */
    const BASE = at(TODOS, 0, "fixtúra to-do");
    const HOME = [{...BASE, _id: "h", title: "Otthoni teendő", category: "otthon"}];
    const WORK = [{...BASE, _id: "w", title: "Munkahelyi teendő", category: "munka"}];

    /* A szűrt lekérések callbackjeit gyűjti ahelyett, hogy válaszolna; a főlista
       marad automatikus (arra esik vissza az üres szűrt nézet átirányítása). */
    const capturePendingLoads = () => {
        /* A gyűjtő-tömb típusa kimondja, mit tart: a szűrő nevét és azt a
           visszahívást, ami MAJD a szűrt to-do-listát kapja. Így a lentebbi kézi
           válasz-elsütések a valódi szerződéshez mérve fordulnak. */
        const pending: {category: string; then: (response: AxiosResponse<Todo[]>) => void}[] = [];
        handleAxios.mockImplementation((url, data, then) => {
            if (url === "/to-dos/category") pending.push({category: filterOf(data), then});
            else if (url === "/to-dos") then(axiosResponse(TODOS));
            else then(axiosResponse({}));
            return Promise.resolve();
        });
        return pending;
    };

    /* Két szűrt nézet egymás után az előzményben, majd a böngésző Vissza gombja: az
       "otthon" kérése MÁR FUT, amikor a "munka" kérése elindul. */
    const openTwoFiltersAndGoBack = async () => {
        const pending = capturePendingLoads();
        window.history.pushState({}, "", "/to-dos/category/munka");
        renderRoutes("/to-dos/category/otthon");
        await waitFor(() => expect(pending).toHaveLength(1));

        window.history.back();
        await waitFor(() => expect(pending).toHaveLength(2));
        // A sorrend a teszt előfeltétele: előbb a lejárt "otthon", utána a friss "munka".
        expect(pending.map((call) => call.category)).toEqual(["otthon", "munka"]);
        return pending;
    };

    it("a lejárt szűrő KÉSVE érkező válasza nem írja felül a friss listát", async () => {
        const pending = await openTwoFiltersAndGoBack();

        // Előbb a FRISS ("munka") válasza érkezik meg, és csak utána a lejárt "otthon"-é.
        act(() => at(pending, 1).then(axiosResponse(WORK)));
        expect(await screen.findByText("Munkahelyi teendő")).toBeVisible();
        act(() => at(pending, 0).then(axiosResponse(HOME)));

        expect(screen.getByText("Munkahelyi teendő")).toBeVisible();
        // Ez a "szellem": a lejárt szűrő eleme nem jelenhet meg a friss nézetben.
        expect(screen.queryByText("Otthoni teendő")).not.toBeInTheDocument();
    });

    it("a lejárt szűrő KÉSVE érkező HIBÁJA nem irányít el a friss nézetből", async () => {
        const pending = await openTwoFiltersAndGoBack();
        // A hiba-ág a NEGYEDIK argumentum (a sikeres a harmadik).
        const staleCall = handleAxios.mock.calls
            .find((call) => call[0] === "/to-dos/category" && filterOf(call[1]) === "otthon");
        if (!staleCall) throw new Error("nem indult lekérés az 'otthon' szűrőre");
        const staleError = staleCall[3];

        act(() => at(pending, 1).then(axiosResponse(WORK)));
        expect(await screen.findByText("Munkahelyi teendő")).toBeVisible();
        /* A hiba-ág üres listát tesz ki (hogy a betöltő ne pörögjön örökké) — egy
           SZŰRT nézetben viszont az üres lista átirányítást jelent a főlistára.
           Őr nélkül tehát egy lejárt kérés hibája kirántana a friss nézetből. */
        act(() => staleError({response: {status: 500}}));

        expect(window.location.pathname).toBe("/to-dos/category/munka");
        expect(screen.getByText("Munkahelyi teendő")).toBeVisible();
    });
});
