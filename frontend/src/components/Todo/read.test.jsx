import {act, render, screen, waitFor} from "@testing-library/react";
import {CookiesProvider} from "react-cookie";
import {MemoryRouter} from "react-router-dom";
import {beforeEach, describe, expect, it, vi} from "vitest";
import Read from "./read";
import {ThemeProvider} from "../../contexts/theme";
import {renderRoutes} from "../../test/renderRoutes";

/* A Context-mock ÁLLANDÓ objektumot adjon vissza: a komponens effektje a
   handleAxios azonosságára van felfüggesztve, így egy rendernként újra gyártott
   függvény végtelen újratöltő ciklust okozna. */
const {handleAxios, auth, linkClicked} = vi.hoisted(() => {
    const fn = vi.fn();
    return {handleAxios: fn, auth: {isLoggedIn: true, handleAxios: fn}, linkClicked: vi.fn()};
});
vi.mock("../../contexts/auth-context", () => ({useAuth: () => auth}));

/* Valódi húzást jsdom-ban nem tudunk lejátszani: nincs benne elrendezés, tehát
   a dnd-kit nem tudja kiszámolni, mi fölött járunk. A húzás VÉGE viszont egy
   sima függvényhívás (onDragEnd), amit a könyvtár ad át — ezt kapjuk el, és
   hívjuk közvetlenül. A DndContext többi részét nem bántjuk. */
const dnd = vi.hoisted(() => ({endDrag: null, startDrag: null}));
vi.mock("@dnd-kit/core", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        DndContext: ({children, onDragEnd, onDragStart}) => {
            dnd.endDrag = onDragEnd;
            dnd.startDrag = onDragStart;
            return children;
        },
    };
});


/* A sorszámok SZÁNDÉKOSAN nem 1,2,3: egy szűrt nézetben (kategória/szín) a
   lista részhalmaz, tehát a sorszámok hézagosak. A húzásnak ott is helyesen
   kell működnie — épp ezért nem az indexet küldjük a szervernek. */
const TODOS = [
    {_id: "a", title: "Alma", color: "warning", category: "x", order: 2, percentage: 0, tasks: {}, taskOrder: []},
    {_id: "b", title: "Banán", color: "warning", category: "x", order: 5, percentage: 0, tasks: {}, taskOrder: []},
    {_id: "c", title: "Cékla", color: "warning", category: "x", order: 9, percentage: 0, tasks: {}, taskOrder: []},
];

const renderRead = () => render(
    <CookiesProvider>
        <ThemeProvider>
            <MemoryRouter><Read url="/to-do" handleLinkClicked={linkClicked}/></MemoryRouter>
        </ThemeProvider>
    </CookiesProvider>
);

beforeEach(() => {
    linkClicked.mockClear();
    handleAxios.mockReset();
    handleAxios.mockImplementation((url, data, then) => {
        if (url === "/to-do") then({data: TODOS});
        else then({status: 200, data: {}});
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
    const dropOn = async (activeId, overId) => {
        renderRead();
        await screen.findByText("Alma");
        handleAxios.mockClear();   // a lista betöltése is egy hívás volt
        act(() => dnd.endDrag({active: {id: activeId}, over: overId && {id: overId}}));
    };

    it("másik kártyára húzva a CÉLKÁRTYA sorszámát küldi, nem az indexét", async () => {
        await dropOn("a", "c");
        // A "Cékla" sorszáma 9 (nem 2), mert a szűrt nézetek listája hézagos.
        expect(handleAxios).toHaveBeenCalledWith("/to-do/reorder", {id: "a", order: 9},
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
    const clickOn = (text) => {
        const event = new MouseEvent("click", {bubbles: true, cancelable: true});
        screen.getByText(text).closest("a").dispatchEvent(event);
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
        act(() => dnd.startDrag());
        const event = clickOn("Alma");
        expect(linkClicked).not.toHaveBeenCalled();      // a react-router nem visz el
        expect(event.defaultPrevented).toBe(true);       // és a böngésző sem tölt újra
    });

    it("a húzás utáni MÁSODIK kattintás már megint átmegy", async () => {
        renderRead();
        await screen.findByText("Alma");
        act(() => dnd.startDrag());
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
        const grid = document.querySelector(".todo-grid");
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
    it("/to-do/category/:name a dekódolt name-mel szűrt kérést küld", async () => {
        handleAxios.mockImplementation((url, data, then) => {
            then({data: url === "/to-do" ? TODOS : []});
            return Promise.resolve();
        });
        /* A %20 a szóköz, a %C5%91 az "ő" kódja: a Link encodeURIComponenttel
           kódol, a React Router dekódolva adja a :name-et — így a szóközös/ékezetes
           kategórianév is épen ér a szűrőbe. */
        renderRoutes("/to-do/category/otthoni%20teend%C5%91k");
        await waitFor(() => {
            const call = handleAxios.mock.calls.find((c) => c[0] === "/to-do/category");
            expect(call?.[1]).toEqual({category: "otthoni teendők"});
        });
    });

    it("csupasz /to-do/category a listát adja, nem szűr és nem pörög", async () => {
        renderRoutes("/to-do/category");
        // A főoldali lista betölt (Alma), szűrő nélküli kategória-kérés nem megy ki.
        await waitFor(() => expect(screen.getByText("Alma")).toBeInTheDocument());
        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/to-do/category");
    });

    it("csupasz /to-do/color a listát adja, nem szűr", async () => {
        renderRoutes("/to-do/color");
        await waitFor(() => expect(screen.getByText("Alma")).toBeInTheDocument());
        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/to-do/color");
    });

    it("ÜRES szűrt nézet a to-do listára irányít (átsorolt/törölt utolsó elem)", async () => {
        // A kategória-szűrő üres listát ad (nincs már ilyen kategóriájú elem), a
        // főlista viszont a to-dókat.
        handleAxios.mockImplementation((url, data, then) => {
            then({data: url === "/to-do" ? TODOS : []});
            return Promise.resolve();
        });
        renderRoutes("/to-do/category/otthon");
        // A kihalt szűrt nézet zsákutca → átirányít a főlistára, ahol a to-dók jönnek.
        await waitFor(() => expect(window.location.pathname).toBe("/to-do"));
        expect(screen.getByText("Alma")).toBeInTheDocument();
    });

    it("ÜRES FŐlista nem irányít át, marad a /to-do-n (legitim üres állapot)", async () => {
        // Egyetlen to-do sincs — ez legitim "nincs teendő", nem zsákutca.
        handleAxios.mockImplementation((url, data, then) => {
            then({data: []});
            return Promise.resolve();
        });
        renderRoutes("/to-do");
        // A /to-do-n maradunk (nincs redirect), és a betöltő sem pörög tovább.
        await waitFor(() => expect(document.querySelector(".min-vh-75")).not.toBeInTheDocument());
        expect(window.location.pathname).toBe("/to-do");
    });

    it("hiba esetén sem pörög örökké a betöltő-jelző", async () => {
        handleAxios.mockImplementation((url, data, then, catchError) => {
            catchError({response: {status: 500, data: "Sikertelen művelet."}});
            return Promise.resolve();
        });
        renderRoutes("/");
        // A pörgő karika azt ígéri, mindjárt jön az adat — hiba után ez hazugság.
        await waitFor(() => expect(document.querySelector(".min-vh-75")).not.toBeInTheDocument());
    });
});
