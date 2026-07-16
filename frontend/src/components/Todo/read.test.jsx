import {render, screen, waitFor} from "@testing-library/react";
import {CookiesProvider} from "react-cookie";
import {MemoryRouter} from "react-router-dom";
import {beforeEach, describe, expect, it, vi} from "vitest";
import Read from "./read";
import Routes from "../routes";
import {ThemeProvider} from "../../contexts/theme";

/* A Context-mock ÁLLANDÓ objektumot adjon vissza: a komponens effektje a
   handleAxios azonosságára van felfüggesztve, így egy rendernként újra gyártott
   függvény végtelen újratöltő ciklust okozna. */
const {handleAxios, auth} = vi.hoisted(() => {
    const fn = vi.fn();
    return {handleAxios: fn, auth: {isLoggedIn: true, handleAxios: fn}};
});
vi.mock("../../contexts/auth", () => ({useAuth: () => auth}));
vi.mock("@fortawesome/react-fontawesome", () => ({
    FontAwesomeIcon: ({icon, ...rest}) => <span data-icon={String(icon)} {...rest}/>,
}));


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
            <MemoryRouter><Read url="/" handleLinkClicked={vi.fn()}/></MemoryRouter>
        </ThemeProvider>
    </CookiesProvider>
);

beforeEach(() => {
    handleAxios.mockReset();
    handleAxios.mockImplementation((url, data, then) => {
        if (url === "/") then({data: TODOS});
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

describe("Hiányzó szűrő", () => {
    /* A szűrt nézetek a navigációs state-ből tudják, mire szűrjenek. Közvetlen
       URL-beírásnál vagy F5-nél az üres — a régi kód ilyenkor üres szűrőt
       küldött, a szerver elutasította, és a spinner ÖRÖKRE pörgött. */
    const renderRoutes = (path) => {
        window.history.pushState({}, "", path);
        return render(
            <CookiesProvider>
                <ThemeProvider>
                    <Routes categories={[]} handleLinkClicked={vi.fn()} handleCategoryChange={vi.fn()}
                            setIsColorAngleClicked={vi.fn()} isColorAngleClicked={false}
                            setIsCategoryAngleClicked={vi.fn()} isCategoryAngleClicked={false}/>
                </ThemeProvider>
            </CookiesProvider>
        );
    };

    it("/category szűrő nélkül a főoldalra visz, nem pörög örökké", async () => {
        renderRoutes("/category");
        await waitFor(() => expect(window.location.pathname).toBe("/"));
        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/category");
    });

    it("/color szűrő nélkül a főoldalra visz", async () => {
        renderRoutes("/color");
        await waitFor(() => expect(window.location.pathname).toBe("/"));
        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/color");
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
