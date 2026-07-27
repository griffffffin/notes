import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";
import QuoteSearch from "./quoteSearch";

/* A kereső beküldés-viselkedése: a /quotes/search-mode válasza (szerző- vs
   szöveg-mód) alapján a helyes URL-re navigál-e. A navigate-et és a handleAxios-t
   mockoljuk; a ghost-text (AuthorInput) magát külön teszt fedi. */
const {handleAxios, navigate} = vi.hoisted(() => ({handleAxios: vi.fn(), navigate: vi.fn()}));
vi.mock("../../contexts/auth-context", () => ({useAuth: () => ({handleAxios})}));
vi.mock("../../contexts/theme-context", () => ({useTheme: () => ({color: "dark"})}));
vi.mock("react-router-dom", () => ({useNavigate: () => navigate}));

beforeEach(() => {
    handleAxios.mockReset();
    navigate.mockReset();
});

describe("QuoteSearch — beküldés", () => {
    it("szöveg-módban a találati URL-re navigál (a kifejezés kódolva)", async () => {
        handleAxios.mockImplementation((url, body, then) => {
            if (url === "/quotes/search-mode") then({data: {mode: "text"}});
        });
        render(<QuoteSearch initialTerm="" handleLinkClicked={vi.fn()}/>);

        await userEvent.type(screen.getByPlaceholderText("Keresés..."), "szeretet{Enter}");

        expect(handleAxios).toHaveBeenCalledWith(
            "/quotes/search-mode", {term: "szeretet"}, expect.any(Function), expect.any(Function));
        expect(navigate).toHaveBeenCalledWith("/quotes/search/szeretet");
    });

    it("szerző-módban a szerző-szűrt oldalra navigál, a TÁROLT írásmóddal", async () => {
        handleAxios.mockImplementation((url, body, then) => {
            if (url === "/quotes/search-mode") then({data: {mode: "author", author: "Ady"}});
        });
        render(<QuoteSearch initialTerm="" handleLinkClicked={vi.fn()}/>);

        // Kisbetűvel keresünk, a szerver a tárolt "Ady"-t adja vissza.
        await userEvent.type(screen.getByPlaceholderText("Keresés..."), "ady{Enter}");

        expect(navigate).toHaveBeenCalledWith("/quotes/Ady");
    });

    it("'Anonymous' (kis/nagybetűtől függetlenül) a névtelen szerző-nézetre visz, mód-döntés nélkül", async () => {
        render(<QuoteSearch initialTerm="" handleLinkClicked={vi.fn()}/>);

        await userEvent.type(screen.getByPlaceholderText("Keresés..."), "aNoNYMous{Enter}");

        expect(navigate).toHaveBeenCalledWith("/quotes/Anonymous");
        // Nem a mód-döntésen át megy (a szöveg-mód a szó előfordulásait keresné).
        expect(handleAxios).not.toHaveBeenCalledWith(
            "/quotes/search-mode", expect.anything(), expect.anything(), expect.anything());
    });

    it("üres (csak szóköz) kereséssel a teljes listára (/quotes) navigál", async () => {
        render(<QuoteSearch initialTerm="" handleLinkClicked={vi.fn()}/>);

        await userEvent.type(screen.getByPlaceholderText("Keresés..."), "   {Enter}");

        expect(navigate).toHaveBeenCalledWith("/quotes");
        // Nem a mód-döntésen át megy (nincs mit keresni).
        expect(handleAxios).not.toHaveBeenCalledWith(
            "/quotes/search-mode", expect.anything(), expect.anything(), expect.anything());
    });
});
