import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
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
vi.mock("../../contexts/auth-context", () => ({useAuth: () => auth}));

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
        if (url === "/quotes/edit") then({data: QUOTE});
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

const quoteField = () => screen.getByPlaceholderText("Idézet szövege");

describe("QuoteSave — create", () => {
    it("idézet mentése a /quotes/create-et hívja a szöveggel, szerzővel, alap sorszámmal és betűmérettel", async () => {
        window.history.pushState({}, "", "/quotes/create");
        renderRoutes();
        await waitFor(() => expect(quoteField()).toBeInTheDocument());

        await userEvent.type(quoteField(), "Új idézet");
        await userEvent.type(screen.getByPlaceholderText("Szerző"), "Én");
        handleAxios.mockClear();
        await userEvent.click(screen.getByRole("button", {name: "Tovább"}));

        // Az Order alapból 1 (a lista eleje), pontosan a to-do mintájára — az új
        // idézet ide kerül, hacsak a felhasználó nem lépteti lejjebb. A fontSize
        // alapból 155 (a Szerző-mező mérete), a "Betűméret"-stepperrel állítható.
        await waitFor(() => {
            const call = handleAxios.mock.calls.find((c) => c[0] === "/quotes/create");
            expect(call?.[1]).toMatchObject({quote: "Új idézet", author: "Én", order: 1, fontSize: 155});
        });
    });

    it("üres idézet + kitöltött szerző: a mentés megáll (a szerző kötelező NEM, az idézet igen)", async () => {
        window.history.pushState({}, "", "/quotes/create");
        renderRoutes();
        await waitFor(() => expect(quoteField()).toBeInTheDocument());

        await userEvent.type(screen.getByPlaceholderText("Szerző"), "Én");
        handleAxios.mockClear();
        await userEvent.click(screen.getByRole("button", {name: "Tovább"}));

        // A hiányzó idézet miatt nem megy ki create-kérés, és a szerkesztőben
        // maradunk. (A hibabuborék megjelenése react-tooltip portál — headless.)
        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/quotes/create");
        expect(window.location.pathname).toBe("/quotes/create");
    });

    it("Ctrl+B a kijelölt szöveget félkövérré teszi, ismételt nyomásra vissza (toggle, nem halmoz)", async () => {
        window.history.pushState({}, "", "/quotes/create");
        renderRoutes();
        const field = await screen.findByPlaceholderText("Idézet szövege");

        await userEvent.type(field, "szép");
        field.setSelectionRange(0, 4);          // a teljes "szép" kijelölése
        await userEvent.keyboard("{Control>}b{/Control}");
        await waitFor(() => expect(field).toHaveValue("**szép**"));

        // A kijelölés a "szép"-en maradt (a ** kívül) — újabb Ctrl+B leveszi.
        await userEvent.keyboard("{Control>}b{/Control}");
        await waitFor(() => expect(field).toHaveValue("szép"));
    });

    it("érintetlen create: a Tovább csak visszavisz a listára, nem ment", async () => {
        window.history.pushState({}, "", "/quotes/create");
        renderRoutes();
        await waitFor(() => expect(quoteField()).toBeInTheDocument());

        handleAxios.mockClear();
        await userEvent.click(screen.getByRole("button", {name: "Tovább"}));

        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/quotes/create");
        await waitFor(() => expect(window.location.pathname).toBe("/quotes"));
    });
});

describe("QuoteSave — update", () => {
    it("betölti a szerkesztendő idézetet a /quotes/edit-ről", async () => {
        window.history.pushState({}, "", "/quotes/update/q-1");
        renderRoutes();

        await waitFor(() => expect(quoteField()).toHaveValue("Az élet szép."));
        expect(screen.getByPlaceholderText("Szerző")).toHaveValue("Valaki");
    });

    it("update: a mező fókuszált, és a kurzor a szöveg VÉGÉN áll", async () => {
        window.history.pushState({}, "", "/quotes/update/q-1");
        renderRoutes();
        const field = await screen.findByPlaceholderText("Idézet szövege");
        await waitFor(() => expect(field).toHaveValue("Az élet szép."));

        const end = "Az élet szép.".length;
        await waitFor(() => {
            expect(document.activeElement).toBe(field);
            expect(field.selectionStart).toBe(end);
            expect(field.selectionEnd).toBe(end);
        });
    });

    it("10 perc tétlenség után autosave: menti a módosítást és a listára navigál", async () => {
        vi.useFakeTimers();
        try {
            window.history.pushState({}, "", "/quotes/update/q-1");
            renderRoutes();
            // A betöltés (handleAxios → setState) lefuttatása a hamis órán.
            await act(async () => { await vi.advanceTimersByTimeAsync(0); });
            const field = document.querySelector("#quoteField");
            // Módosítás → dirty ÉS érvényes.
            fireEvent.change(field, {target: {value: "Az élet szép. Módosítva."}});
            handleAxios.mockClear();

            // 10 perc tétlenség (közben SEMMI aktivitás) → az autosave elsül.
            await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60 * 1000); });

            const call = handleAxios.mock.calls.find((c) => c[0] === "/quotes/update");
            expect(call?.[1]).toMatchObject({id: "q-1"});
            // Siker után a listára navigál (kilép a szerkesztőből).
            expect(window.location.pathname).toBe("/quotes");
        } finally {
            vi.useRealTimers();
        }
    });

    it("aktivitás újraindítja az autosave-órát (nem ment idő előtt)", async () => {
        vi.useFakeTimers();
        try {
            window.history.pushState({}, "", "/quotes/update/q-1");
            renderRoutes();
            await act(async () => { await vi.advanceTimersByTimeAsync(0); });
            fireEvent.change(document.querySelector("#quoteField"), {target: {value: "Módosítva."}});
            handleAxios.mockClear();

            // 9 perc tétlenség, egy billentyű, majd újabb 9 perc — összesen 18 perc, de
            // tétlenül csak 9 → NEM autosave-el, és bent maradunk a szerkesztőben.
            await act(async () => { await vi.advanceTimersByTimeAsync(9 * 60 * 1000); });
            await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown")); });
            await act(async () => { await vi.advanceTimersByTimeAsync(9 * 60 * 1000); });

            expect(handleAxios.mock.calls.some((c) => c[0] === "/quotes/update")).toBe(false);
            expect(window.location.pathname).toBe("/quotes/update/q-1");
        } finally {
            vi.useRealTimers();
        }
    });

    it("módosítás után a /quotes/update-et hívja az id-val", async () => {
        window.history.pushState({}, "", "/quotes/update/q-1");
        renderRoutes();
        await waitFor(() => expect(quoteField()).toHaveValue("Az élet szép."));

        await userEvent.type(quoteField(), " Tényleg.");
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
        await waitFor(() => expect(quoteField()).toHaveValue("Az élet szép."));

        handleAxios.mockClear();
        await userEvent.click(screen.getByRole("button", {name: "Tovább"}));

        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/quotes/update");
    });
});

/* A szerkesztő ELHAGYÁSA (logóra kattintás, Vissza gomb, bármely navigáció) a
   szerkesztő leválását (unmount) jelenti — ilyenkor ugyanaz a mentés fusson le, mint
   a Tovább/Escape-nél, csak navigáció nélkül. A leválást a teszt az unmount()-tal
   modellezi. A legfontosabb a NEGATÍV eset: a Tovább utáni leválás ne mentsen újra
   (create-nél nehogy DUPLÁN hozzon létre). */
describe("QuoteSave — mentés leváláskor (logó/Vissza/navigáció)", () => {
    it("módosított idézet a szerkesztő leválásakor (unmount) mentődik", async () => {
        window.history.pushState({}, "", "/quotes/update/q-1");
        const view = renderRoutes();
        await waitFor(() => expect(quoteField()).toHaveValue("Az élet szép."));

        await userEvent.type(quoteField(), " Tényleg.");
        handleAxios.mockClear();
        view.unmount();

        const call = handleAxios.mock.calls.find((c) => c[0] === "/quotes/update");
        expect(call?.[1]).toMatchObject({id: "q-1", quote: "Az élet szép. Tényleg."});
    });

    it("érintetlen szerkesztő leválása NEM ment", async () => {
        window.history.pushState({}, "", "/quotes/update/q-1");
        const view = renderRoutes();
        await waitFor(() => expect(quoteField()).toHaveValue("Az élet szép."));

        handleAxios.mockClear();
        view.unmount();

        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/quotes/update");
    });

    it("Tovább után a leválás NEM ment újra (nincs dupla create)", async () => {
        window.history.pushState({}, "", "/quotes/create");
        const view = renderRoutes();
        await waitFor(() => expect(quoteField()).toBeInTheDocument());

        await userEvent.type(quoteField(), "Új idézet");
        handleAxios.mockClear();
        await userEvent.click(screen.getByRole("button", {name: "Tovább"}));
        // A Tovább ment (create), majd a /quotes-ra navigál — a szerkesztő leválik.
        await waitFor(() => expect(handleAxios.mock.calls.some((c) => c[0] === "/quotes/create")).toBe(true));
        view.unmount();

        const creates = handleAxios.mock.calls.filter((c) => c[0] === "/quotes/create");
        expect(creates).toHaveLength(1);
    });
});

/* A VISSZA GOMB (böngésző POP) a useBlocker-en át pontosan úgy viselkedik, mint a
   Tovább/logó: van mentenivaló → ellenőriz; érvényesnél MENT, majd folytatja a
   visszalépést (proceed); érvénytelennél a helyén marad (reset). A böngésző Vissza
   gombját a teszt a window.history.back()-kal modellezi (a data router popstate-re
   ugyanazt az utat futtatja). */
describe("QuoteSave — Vissza gomb (böngésző POP) a blockeren át", () => {
    it("érvényes módosítást MENT, majd visszaenged az előző oldalra", async () => {
        // Előzmény: a lista, majd a szerkesztő — így van hová visszalépni.
        window.history.pushState({}, "", "/quotes");
        window.history.pushState({}, "", "/quotes/update/q-1");
        renderRoutes();
        await waitFor(() => expect(quoteField()).toHaveValue("Az élet szép."));

        await userEvent.type(quoteField(), " Tényleg.");
        handleAxios.mockClear();
        window.history.back();

        // A blocker elkapja a POP-ot, ment, majd folytatja a visszalépést a listára.
        await waitFor(() => expect(handleAxios.mock.calls.some((c) => c[0] === "/quotes/update")).toBe(true));
        await waitFor(() => expect(window.location.pathname).toBe("/quotes"));
    });

    it("érvénytelen (üres) idézettel NEM enged vissza, és nem ment", async () => {
        window.history.pushState({}, "", "/quotes");
        window.history.pushState({}, "", "/quotes/create");
        renderRoutes();
        await waitFor(() => expect(quoteField()).toBeInTheDocument());

        // Csak a szerzőt írjuk be, az idézet üres → érvénytelen.
        await userEvent.type(screen.getByPlaceholderText("Szerző"), "Én");
        handleAxios.mockClear();
        window.history.back();

        // A blocker blokkol, érvénytelen → visszaállít (reset): a szerkesztőben maradunk.
        await waitFor(() => expect(window.location.pathname).toBe("/quotes/create"));
        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/quotes/create");
    });
});

/* A LOGÓRA (és minden szerkesztőn kívüli linkre) kattintás a Tovább-bal AZONOS
   ellenőrzés+mentést fut: érvénytelennél MARAD a szerkesztőben (nem enged a listára),
   érvényesnél MENT, majd a mentés BEFEJEZŐDÉSE UTÁN navigál (friss lista). A logó
   felirata az aktuális szekció ("Quotes"). */
describe("QuoteSave — logóra kattintás a szerkesztőben (ellenőrzés + mentés)", () => {
    it("ÉRVÉNYTELEN idézettel a logó NEM enged a listára, és nem ment", async () => {
        window.history.pushState({}, "", "/quotes/create");
        renderRoutes();
        await waitFor(() => expect(quoteField()).toBeInTheDocument());

        // Csak a szerzőt írjuk be, az idézet üres → érvénytelen.
        await userEvent.type(screen.getByPlaceholderText("Szerző"), "Én");
        handleAxios.mockClear();
        await userEvent.click(screen.getByText("Quotes"));

        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/quotes/create");
        expect(window.location.pathname).toBe("/quotes/create");
    });

    it("ÉRVÉNYES idézetet a logó MENT, majd a listára visz", async () => {
        window.history.pushState({}, "", "/quotes/create");
        renderRoutes();
        await waitFor(() => expect(quoteField()).toBeInTheDocument());

        await userEvent.type(quoteField(), "Új idézet");
        handleAxios.mockClear();
        await userEvent.click(screen.getByText("Quotes"));

        await waitFor(() => expect(handleAxios.mock.calls.some((c) => c[0] === "/quotes/create")).toBe(true));
        await waitFor(() => expect(window.location.pathname).toBe("/quotes"));
    });
});
