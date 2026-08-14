import {fireEvent, render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {CookiesProvider} from "react-cookie";
import {MemoryRouter} from "react-router-dom";
import {describe, expect, it, vi} from "vitest";
import Navbar from "./navbar";
import type {NavbarProps} from "./navbar";
import {ThemeProvider} from "../../contexts/theme";
import {requireElement} from "../../test/dom";

/* Az ikonokat data-icon attribútummá alakítjuk: a fill/kijelentkezés gombok
   csak ikont hordoznak (nincs szöveges nevük), így ez teszi őket kereshetővé.
   A valódi library.add(fas) ráadásul mind az ikont behúzná (lassú a Pi-n). */

/* A kijelentkezéshez a `logout` kell, de a pótlék a TELJES contextet adja (közös
   segéd, l. test/mockAuth.ts): a korábbi kézzel írt `{logout, handleAxios}`-ból
   hiányzott a `token` és a `login`, és ezt semmi nem vetette össze a valósággal.
   A `vi.mock` import()-tal veszi át a modult — string-útvonallal a gyár
   visszatérését a fordító nem nézi meg. */
const {auth} = await vi.hoisted(async () => {
    const {mockAuth} = await import("../../test/mockAuth");
    return mockAuth({isLoggedIn: true});
});
const logout = auth.logout;

vi.mock(import("../../contexts/auth-context"), () => ({useAuth: () => auth}));

const setup = (overrides: Partial<NavbarProps> = {}, route = "/") => {
    const props = {
        isVisible: true, categories: ["otthon", "munka"], handleLinkClicked: vi.fn(),
        setIsCategoryClicked: vi.fn(), isCategoryClicked: false,
        setIsColorClicked: vi.fn(), isColorClicked: false, ...overrides,
    } satisfies NavbarProps;
    render(
        <CookiesProvider>
            <ThemeProvider>
                <MemoryRouter initialEntries={[route]}>
                    <Navbar {...props}/>
                </MemoryRouter>
            </ThemeProvider>
        </CookiesProvider>,
    );
    return props;
};

describe("Navbar szűrő-kapcsolók", () => {
    it("a Kategória gomb megnyitja a kategória-szűrőt és bezárja a szín-szűrőt", async () => {
        const props = setup();

        await userEvent.click(screen.getByText("Kategória"));

        // A kategória kinyílik (a jelenlegi false ellentettje), a szín pedig zár:
        // a kettő kölcsönösen kizárja egymást, hogy ne fedjék át egymást.
        expect(props.setIsCategoryClicked).toHaveBeenCalledWith(true);
        expect(props.setIsColorClicked).toHaveBeenCalledWith(false);
    });

    it("a szín gomb megnyitja a szín-szűrőt és bezárja a kategória-szűrőt", async () => {
        const props = setup();

        // A szín-gomb csak a kitöltés-ikont hordozza; a data-icon teszi kereshetővé.
        await userEvent.click(requireElement('[data-icon="fill"]', SVGSVGElement));

        expect(props.setIsColorClicked).toHaveBeenCalledWith(true);
        expect(props.setIsCategoryClicked).toHaveBeenCalledWith(false);
    });

    it("a kijelentkezés ikon a logout-ot hívja", async () => {
        setup();

        await userEvent.click(requireElement('[data-icon="right-from-bracket"]', SVGSVGElement));

        expect(logout).toHaveBeenCalled();
    });

    it("a nyitott kategória-legördülő az egyes kategóriákat a szűrt útvonalukra linkeli", () => {
        setup({isCategoryClicked: true});

        // A legördülőből az "otthon" a to-do kategória-szűrt nézetére visz.
        expect(screen.getByRole("link", {name: "otthon"}))
            .toHaveAttribute("href", "/to-dos/category/otthon");
    });

    it("a nyitott szín-legördülő az egyes színeket a szűrt útvonalukra linkeli", () => {
        setup({isColorClicked: true});

        // A színeknek nincs szöveges nevük (csak színfolt), ezért a href alapján
        // ellenőrizzük: a "danger" a to-do szín-szűrt nézetére visz.
        expect(document.querySelector('a[href="/to-dos/color/danger"]')).toBeInTheDocument();
    });
});

describe("Navbar — kereső fókusz (mobil kifeszülés)", () => {
    it("a keresőbe kattintva a container megkapja a quote-search-focused osztályt, blur-re elveszti", async () => {
        // A Quotes lista-oldalon jelenik meg a kereső.
        setup({}, "/quotes");
        const input = screen.getByPlaceholderText("Keresés...");
        const container = document.querySelector(".container-fluid");
        expect(container).not.toHaveClass("quote-search-focused");

        await userEvent.click(input);
        expect(container).toHaveClass("quote-search-focused");

        fireEvent.blur(input);
        expect(container).not.toHaveClass("quote-search-focused");
    });
});
