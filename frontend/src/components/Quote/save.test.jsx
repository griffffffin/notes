import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {CookiesProvider} from "react-cookie";
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import Routes from "../routes";
import {ThemeProvider} from "../../contexts/theme";

/* A szerverhívást és az ikonokat kicseréljük, a témát valódiként használjuk (a
   kártya színe a témából jön). A Routes is valódi: a /quotes/create ↔
   /quotes/update route-viselkedés a route-tábláé. */
vi.mock("@fortawesome/react-fontawesome", () => ({
    FontAwesomeIcon: ({icon, ...rest}) => <span data-icon={String(icon)} {...rest}/>,
}));

const QUOTE = {_id: "q-1", quote: "Az élet szép.", author: "Valaki", order: 1};

/* Állandó handleAxios: a komponens effektjei az azonosságára függnek, egy
   rendernként újragyártott függvény végtelen újratöltő ciklust okozna. */
const {handleAxios, auth} = vi.hoisted(() => {
    const fn = vi.fn();
    return {handleAxios: fn, auth: {isLoggedIn: true, handleAxios: fn}};
});
vi.mock("../../contexts/auth", () => ({useAuth: () => auth}));

const renderRoutes = () => render(
    <CookiesProvider>
        <ThemeProvider>
            <Routes categories={[]} handleLinkClicked={vi.fn()} handleCategoryChange={vi.fn()}
                    setIsColorAngleClicked={vi.fn()} isColorAngleClicked={false}
                    setIsCategoryAngleClicked={vi.fn()} isCategoryAngleClicked={false}/>
        </ThemeProvider>
    </CookiesProvider>
);

// A jsdom nem ad valódi canvas-t; a validáció fieldOf-ja measureText-et hív.
beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = () => ({font: "", measureText: () => ({width: 10})});
});

beforeEach(() => {
    window.history.pushState({}, "", "/");
    handleAxios.mockReset();
    handleAxios.mockImplementation((url, data, then) => {
        if (url === "/quotes/id") then({data: QUOTE});
        else if (url === "/quotes/last/order") then({data: 3});
        // A mentés utáni leaveEditor a /quotes listát tölti — az tömböt vár.
        else if (url === "/quotes" || url === "/quotes/author") then({data: []});
        else then({status: 200, data: {}});
        return Promise.resolve();
    });
});

afterEach(() => {
    document.cookie = "backgroundColor=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("QuoteSave — create", () => {
    it("idézet mentése a /quotes/create-et hívja a szöveggel, szerzővel és a lista végi sorszámmal", async () => {
        window.history.pushState({}, "", "/quotes/create");
        renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Idézet")).toBeInTheDocument());

        await userEvent.type(screen.getByPlaceholderText("Idézet"), "Új idézet");
        await userEvent.type(screen.getByPlaceholderText("Szerző"), "Én");
        handleAxios.mockClear();
        await userEvent.click(screen.getByRole("button", {name: "Tovább"}));

        // A last/order 3 volt, tehát az új idézet a 4. helyre (a lista végére) kerül.
        await waitFor(() => {
            const call = handleAxios.mock.calls.find((c) => c[0] === "/quotes/create");
            expect(call?.[1]).toMatchObject({quote: "Új idézet", author: "Én", order: 4});
        });
    });

    it("üres idézet + kitöltött szerző: a mentés megáll (a szerző kötelező NEM, az idézet igen)", async () => {
        window.history.pushState({}, "", "/quotes/create");
        renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Idézet")).toBeInTheDocument());

        await userEvent.type(screen.getByPlaceholderText("Szerző"), "Én");
        handleAxios.mockClear();
        await userEvent.click(screen.getByRole("button", {name: "Tovább"}));

        // A hiányzó idézet miatt nem megy ki create-kérés, és a szerkesztőben
        // maradunk. (A hibabuborék megjelenése react-tooltip portál — headless.)
        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/quotes/create");
        expect(window.location.pathname).toBe("/quotes/create");
    });

    it("érintetlen create: a Tovább csak visszavisz a listára, nem ment", async () => {
        window.history.pushState({}, "", "/quotes/create");
        renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Idézet")).toBeInTheDocument());

        handleAxios.mockClear();
        await userEvent.click(screen.getByRole("button", {name: "Tovább"}));

        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/quotes/create");
        await waitFor(() => expect(window.location.pathname).toBe("/quotes"));
    });
});

describe("QuoteSave — update", () => {
    it("betölti a szerkesztendő idézetet a /quotes/id-ról", async () => {
        window.history.pushState({}, "", "/quotes/update/q-1");
        renderRoutes();

        await waitFor(() => expect(screen.getByPlaceholderText("Idézet")).toHaveValue("Az élet szép."));
        expect(screen.getByPlaceholderText("Szerző")).toHaveValue("Valaki");
    });

    it("módosítás után a /quotes/update-et hívja az id-val", async () => {
        window.history.pushState({}, "", "/quotes/update/q-1");
        renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Idézet")).toHaveValue("Az élet szép."));

        await userEvent.type(screen.getByPlaceholderText("Idézet"), " Tényleg.");
        handleAxios.mockClear();
        await userEvent.click(screen.getByRole("button", {name: "Tovább"}));

        await waitFor(() => {
            const call = handleAxios.mock.calls.find((c) => c[0] === "/quotes/update");
            expect(call?.[1]).toMatchObject({id: "q-1"});
        });
    });

    it("változatlan tartalommal a Tovább NEM ment (nincs /quotes/update)", async () => {
        window.history.pushState({}, "", "/quotes/update/q-1");
        renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Idézet")).toHaveValue("Az élet szép."));

        handleAxios.mockClear();
        await userEvent.click(screen.getByRole("button", {name: "Tovább"}));

        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/quotes/update");
    });
});
