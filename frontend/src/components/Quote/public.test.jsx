import {render, screen} from "@testing-library/react";
import {CookiesProvider} from "react-cookie";
import {beforeEach, describe, expect, it, vi} from "vitest";
import Routes from "../routes";
import {ThemeProvider} from "../../contexts/theme";

vi.mock("@fortawesome/react-fontawesome", () => ({FontAwesomeIcon: () => <span/>}));

const QUOTE = {_id: "q-1", quote: "Megosztott idézet.", author: "Márai", order: 1};

const {handleAxios, auth} = vi.hoisted(() => {
    const fn = vi.fn();
    return {handleAxios: fn, auth: {isLoggedIn: true, handleAxios: fn}};
});
vi.mock("../../contexts/auth", () => ({useAuth: () => auth}));

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

beforeEach(() => {
    handleAxios.mockReset();
});

describe("QuotePublic (megosztott idézet)", () => {
    it("betölti és megjeleníti a megosztott idézetet a szerzővel", async () => {
        handleAxios.mockImplementation((url, data, then) => {
            if (url === "/quotes/id") then({data: QUOTE});
            return Promise.resolve();
        });
        renderRoutes("/quotes/M%C3%A1rai/q-1");

        expect(await screen.findByText("Megosztott idézet.")).toBeVisible();
        expect(screen.getByText("Márai")).toBeVisible();
    });

    it("a **…** markert félkövérként rendereli, a marker maga nem látszik", async () => {
        handleAxios.mockImplementation((url, data, then) => {
            if (url === "/quotes/id") then({data: {...QUOTE, quote: "Sima **félkövér** rész."}});
            return Promise.resolve();
        });
        renderRoutes("/quotes/M%C3%A1rai/q-1");

        const bold = await screen.findByText("félkövér");
        expect(bold.tagName).toBe("STRONG");
        // A `**` marker a renderelt szövegben már nem szerepel.
        expect(document.body.textContent).not.toContain("**");
    });

    it("nem létező idézetnél a 'Nem létező idézet.' üzenetet mutatja, nem pörög a betöltő", async () => {
        handleAxios.mockImplementation((url, data, then, catchError) => {
            catchError({response: {status: 404}});
            return Promise.resolve();
        });
        renderRoutes("/quotes/x/nincs");

        expect(await screen.findByText("Nem létező idézet.")).toBeVisible();
    });
});
