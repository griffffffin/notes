import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";
import QuoteSearch from "./quoteSearch";
import {axiosResponse} from "../../test/axiosResponse";

/* A kereső beküldés-viselkedése: a /quotes/search-mode válasza (szerző- vs
   szöveg-mód) alapján a helyes URL-re navigál-e. A navigate-et és a handleAxios-t
   mockoljuk; a ghost-text (AuthorInput) magát külön teszt fedi.

   A `vi.mock` MINDHÁROM modult import()-tal veszi át, nem szöveges útvonallal: a
   Vitest a string-alaknál `Partial<unknown>`-t vár a gyártól (vagyis semmit nem
   ellenőriz), az import()-osnál viszont a modul VALÓDI típusához méri a pótlékot.

   A `vi.hoisted` azért kell, mert a mock-gyárak a fájl tetejére kerülnek, az
   importok elé — a segédet ezért dinamikus importtal, magában a hoisted blokkban
   kérjük el. */
const {auth, handleAxios} = await vi.hoisted(async () => {
    const {mockAuth} = await import("../../test/mockAuth");
    return mockAuth({isLoggedIn: true});
});
const {navigate} = vi.hoisted(() => ({navigate: vi.fn()}));

vi.mock(import("../../contexts/auth-context"), () => ({useAuth: () => auth}));

/* A téma pótléka a TELJES alakot adja meg. A korábbi `{color: "dark"}` két
   sebből vérzett: hiányzott belőle a többi hat mező, a "dark" pedig olyan érték,
   amit a valódi téma SOSEM ad — a `color` a CSS-változókra mutató "theme"
   jelölő, ebből lesz a `text-theme` osztály. A teszt nem is a színt vizsgálja,
   de amit a pótlék állít, annak igaznak kell lennie. */
/* A pótlék a modul TÖBBI exportját MEGTARTJA (`importOriginal`), és csak a
   hookot cseréli ki. Enélkül a modul konstansai (pl. az ACCENT_RED, amit a
   hibabuborék használ) `undefined`-ra tűnnének el, és a komponens futásidőben
   szállna el — mérve: e nélkül a fájl mind a nyolc tesztje elbukott, olyan
   hibával, aminek semmi köze nem volt a vizsgált viselkedéshez. */
vi.mock(import("../../contexts/theme-context"), async (importOriginal) => ({
    ...await importOriginal(),
    useTheme: () => ({
        color: "theme", colorHex: "#284ec0", pageBackground: "black",
        todoDefaultColor: "warning", isChecked: false,
        handleCheckedChange: vi.fn(), setAccentOverride: vi.fn(),
    }),
}));

vi.mock(import("react-router-dom"), () => ({useNavigate: () => navigate}));

beforeEach(() => {
    handleAxios.mockReset();
    navigate.mockReset();
});

describe("QuoteSearch — beküldés", () => {
    it("szöveg-módban a találati URL-re navigál (a kifejezés kódolva)", async () => {
        handleAxios.mockImplementation((url, body, then) => {
            if (url === "/quotes/search-mode") then(axiosResponse({mode: "text"}));
            return Promise.resolve();
        });
        render(<QuoteSearch initialTerm="" handleLinkClicked={vi.fn()} onFocusChange={vi.fn()}/>);

        await userEvent.type(screen.getByPlaceholderText("Keresés..."), "szeretet{Enter}");

        expect(handleAxios).toHaveBeenCalledWith(
            "/quotes/search-mode", {term: "szeretet"}, expect.any(Function), expect.any(Function));
        expect(navigate).toHaveBeenCalledWith("/quotes/search/szeretet");
    });

    it("szerző-módban a szerző-szűrt oldalra navigál, a TÁROLT írásmóddal", async () => {
        handleAxios.mockImplementation((url, body, then) => {
            if (url === "/quotes/search-mode") then(axiosResponse({mode: "author", author: "Ady"}));
            return Promise.resolve();
        });
        render(<QuoteSearch initialTerm="" handleLinkClicked={vi.fn()} onFocusChange={vi.fn()}/>);

        // Kisbetűvel keresünk, a szerver a tárolt "Ady"-t adja vissza.
        await userEvent.type(screen.getByPlaceholderText("Keresés..."), "ady{Enter}");

        expect(navigate).toHaveBeenCalledWith("/quotes/Ady");
    });

    it("'Anonymous' (kis/nagybetűtől függetlenül) a névtelen szerző-nézetre visz, mód-döntés nélkül", async () => {
        render(<QuoteSearch initialTerm="" handleLinkClicked={vi.fn()} onFocusChange={vi.fn()}/>);

        await userEvent.type(screen.getByPlaceholderText("Keresés..."), "aNoNYMous{Enter}");

        expect(navigate).toHaveBeenCalledWith("/quotes/Anonymous");
        // Nem a mód-döntésen át megy (a szöveg-mód a szó előfordulásait keresné).
        expect(handleAxios).not.toHaveBeenCalledWith(
            "/quotes/search-mode", expect.anything(), expect.anything(), expect.anything());
    });

    it("üres (csak szóköz) kereséssel a teljes listára (/quotes) navigál", async () => {
        render(<QuoteSearch initialTerm="" handleLinkClicked={vi.fn()} onFocusChange={vi.fn()}/>);

        await userEvent.type(screen.getByPlaceholderText("Keresés..."), "   {Enter}");

        expect(navigate).toHaveBeenCalledWith("/quotes");
        // Nem a mód-döntésen át megy (nincs mit keresni).
        expect(handleAxios).not.toHaveBeenCalledWith(
            "/quotes/search-mode", expect.anything(), expect.anything(), expect.anything());
    });
});

/* A KERESÉS HIBÁJA (2026-08-19).

   Eddig egy sikertelen keresés pontosan úgy nézett ki, mintha a felület meg sem
   hallotta volna az Entert: nem navigáltunk, és nem írtunk ki semmit. A
   felhasználó jellemzően újra megnyomta, majd feladta — közben nem tudta, hogy
   a keresés el sem indult.

   A buborék a keresősáv ALÁ kerül, a SÁV közepéhez igazítva (nem a beírt
   szöveghez): a hiba az egész műveletre vonatkozik. */
describe("QuoteSearch — a keresés nem indult el", () => {
    const MESSAGE = "Hiba a keresés indításakor.";
    const renderSearch = () =>
        render(<QuoteSearch initialTerm="" handleLinkClicked={vi.fn()} onFocusChange={vi.fn()}/>);

    it("hálózati hibánál kiírja a buborékot, és NEM navigál", async () => {
        handleAxios.mockImplementation((url, data, then, catchError) => {
            catchError(new Error("Network Error"));
            return Promise.resolve();
        });
        renderSearch();

        await userEvent.type(screen.getByPlaceholderText("Keresés..."), "Márai{Enter}");

        expect(await screen.findByText(MESSAGE)).toBeVisible();
        expect(navigate).not.toHaveBeenCalled();
    });

    it("elcsúszott SZERZŐDÉSNÉL ugyanígy (a séma bukása is a művelet kudarca)", async () => {
        handleAxios.mockImplementation((url, data, then) => {
            then(axiosResponse({mode: "author"}));   // hiányzik a szerző → séma-bukás
            return Promise.resolve();
        });
        renderSearch();

        await userEvent.type(screen.getByPlaceholderText("Keresés..."), "Márai{Enter}");

        expect(await screen.findByText(MESSAGE)).toBeVisible();
        expect(navigate).not.toHaveBeenCalled();
    });

    it("GÉPELÉSRE eltűnik a hibajelzés (kattintás nélkül is)", async () => {
        /* A billentyűzet-esemény KATTINTÁS NÉLKÜL megy (`keyboard`, nem `type`):
           a bukott keresés után a kurzor a mezőben marad, tehát a felhasználó
           tipikusan nem kattint, csak ír tovább. Ha `type`-ot használnánk, az
           előbb pointerdown-t küldene, amitől a buborék a "bárhova kattintva
           eltűnik" szabály miatt amúgy is becsukódna — a teszt akkor nem azt
           mérné, amit hisz magáról (mérve: e nélkül a megkülönböztetés nélkül a
           mutáció-próba átcsúszott). */
        handleAxios.mockImplementation((url, data, then, catchError) => {
            catchError(new Error("Network Error"));
            return Promise.resolve();
        });
        renderSearch();
        await userEvent.type(screen.getByPlaceholderText("Keresés..."), "Márai{Enter}");
        await screen.findByText(MESSAGE);

        /* A fókusz PROGRAMBÓL kerül a mezőbe (nem kattintással): a kattintás
           pointerdown-t küldene, amitől a buborék a "bárhova kattintva eltűnik"
           szabály miatt amúgy is becsukódna. Így tisztán az marad, amit mérni
           akarunk: a gépelés maga eltünteti-e a hibajelzést. */
        screen.getByPlaceholderText("Keresés...").focus();
        await userEvent.keyboard("x");

        expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    });

    it("SIKERES keresésnél nincs buborék (kontroll)", async () => {
        handleAxios.mockImplementation((url, body, then) => {
            if (url === "/quotes/search-mode") then(axiosResponse({mode: "text"}));
            return Promise.resolve();
        });
        renderSearch();

        await userEvent.type(screen.getByPlaceholderText("Keresés..."), "Márai{Enter}");

        await waitFor(() => expect(navigate).toHaveBeenCalled());
        expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    });
});
