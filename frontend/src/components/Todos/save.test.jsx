import {act, fireEvent, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {renderRoutes as renderApp} from "../../test/renderRoutes";

/* Csak a SZERVERHÍVÁST cseréljük ki; a témát VALÓDIKÉNT használjuk (a téma és a
   to-do színének viszonya épp az egyik vizsgált kérdés), és a route-tábla is
   valódi — a /update → /create váltás viselkedése az ő felelőssége. A route-fa
   renderelésének kerete a közös test/renderRoutes segédben van. */

const TODO = {
    _id: "todo-1", title: "Bevásárlás", color: "danger", category: "otthon", order: 1,
    percentage: 0, tasks: {}, taskOrder: [],
};

/* A Context-mock ÁLLANDÓ objektumot adjon vissza: a komponensek effektjei a
   handleAxios azonosságára vannak felfüggesztve, így egy rendernként újra
   gyártott függvény végtelen újratöltő ciklust okozna a tesztben. */
/* A `token` a mockban is szerepel: a leváláskori mentés ezt zárványolja, és
   EXPLICIT ötödik argumentumként adja át a handleAxios-nak (kijelentkezéskor az
   élő token már törölve van). Az alábbi teszt épp ezt az átadást rögzíti. */
const {handleAxios, auth, TEST_TOKEN} = vi.hoisted(() => {
    const fn = vi.fn();
    const token = "teszt-token";
    return {handleAxios: fn, TEST_TOKEN: token, auth: {isLoggedIn: true, handleAxios: fn, token}};
});

vi.mock("../../contexts/auth-context", () => ({useAuth: () => auth}));

/* A to-do szerkesztőjéhez KELL egy létező kategória: a kategória-legördülő ebből
   a propból tölt, és a tesztek közül több épp a választását vizsgálja. Az utat a
   hívások maguk állítják be (pushState), ezért a path itt marad üresen. */
const renderRoutes = () => renderApp(undefined, {categories: ["otthon"]});

// A kártya színe a szegély-osztályból olvasható ki ("border-danger").
const cardColor = () => [...document.querySelector("form").classList]
    .find((c) => c.startsWith("border-") && c !== "border-2");

/* A jsdom nem ad valódi canvas-t; a fieldOf a placeholder szélességét
   measureText-tel méri a buborék vízszintes horgonyához. Egy egyszerű mock elég:
   a pontos szélesség itt nem számít, mert a buborék MEGJELENÉSÉT vizsgáljuk, nem
   a pixelpozícióját (azt élőben, headless renderrel néztük). */
beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = () => ({font: "", measureText: () => ({width: 10})});
});

beforeEach(() => {
    window.history.pushState({}, "", "/");
    handleAxios.mockReset();
    handleAxios.mockImplementation((url, data, then) => {
        if (url === "/to-dos/id") then({data: TODO});
        else if (url === "/to-dos/last/order") then({data: 3});
        else if (url === "/to-dos") then({data: [TODO]});
        else then({status: 200, data: {}});
        return Promise.resolve();
    });
});

afterEach(() => {
    document.cookie = "backgroundColor=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("Save útvonalai", () => {
    it("/update azonosító nélkül a listát adja, nem a szerkesztőt, és nem hasal el", async () => {
        /* Közvetlen URL-beírás vagy F5 azonosító nélkül: a csupasz /to-dos/update
           nem illeszkedik a /to-dos/update/:id mintára, így a "*" ág átirányítja a
           to-do listára — nincs mit szerkeszteni, a szerkesztő meg sem jelenik. */
        window.history.pushState({}, "", "/to-dos/update");

        renderRoutes();

        // A lista betölt (a to-do címe kártyaként megjelenik), a Cím mező nem.
        await waitFor(() => expect(screen.getByText("Bevásárlás")).toBeInTheDocument());
        expect(screen.queryByPlaceholderText("Cím")).not.toBeInTheDocument();
    });

    it("/update-ról /create-re váltva üres űrlapot ad, nem a szerkesztett to-do-t", async () => {
        renderRoutes();

        // A listáról a to-do kártyájára kattintva jutunk a szerkesztőbe.
        await userEvent.click(await screen.findByText("Bevásárlás"));
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));

        // Onnan a navbar "+" gombjával az új to-do űrlapra.
        await userEvent.click(document.querySelector('[data-icon="fas plus"]'));

        await waitFor(() => expect(window.location.pathname).toBe("/to-dos/create"));
        expect(screen.getByPlaceholderText("Cím")).toHaveValue("");
        expect(screen.getByPlaceholderText("Kategória")).toHaveValue("");
    });

    it("ha a to-do betöltése hibázik, a főoldalra visz, nem pörög a betöltő", async () => {
        // A /id kérés elszáll (pl. timeout) — a szerkesztő NEM ragadhat a
        // spinneren, mert a setIsLoading(false) a betöltött adathoz kötött.
        handleAxios.mockImplementation((url, data, then, catchError) => {
            if (url === "/to-dos/id") catchError({message: "timeout of 15000ms exceeded"});
            else if (url === "/to-dos/last/order") then({data: 3});
            else if (url === "/to-dos") then({data: [TODO]});
            else then({status: 200, data: {}});
            return Promise.resolve();
        });
        renderRoutes();

        // A listáról a kártyára kattintva indul a szerkesztő betöltése.
        await userEvent.click(await screen.findByText("Bevásárlás"));

        // A betöltés hibája visszavisz a főoldalra; a Cím mező meg sem jelenik.
        await waitFor(() => expect(window.location.pathname).toBe("/to-dos"));
        expect(screen.queryByPlaceholderText("Cím")).not.toBeInTheDocument();
    });
});

describe("Save színe", () => {
    it("szerkesztéskor a to-do mentett színét mutatja, nem a témáét", async () => {
        renderRoutes();

        await userEvent.click(await screen.findByText("Bevásárlás"));
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));

        expect(cardColor()).toBe("border-danger");
    });

    it("témaváltás szerkesztés közben NEM írja felül a to-do színét", async () => {
        renderRoutes();

        await userEvent.click(await screen.findByText("Bevásárlás"));
        await waitFor(() => expect(cardColor()).toBe("border-danger"));

        // A navbar nap/hold kapcsolója: sötét -> világos téma.
        await userEvent.click(screen.getByRole("switch"));

        // A téma alapszíne most "primary" lenne — a to-do sajátja marad.
        expect(cardColor()).toBe("border-danger");
    });

    it("új to-do a téma alapszínével indul", async () => {
        window.history.pushState({}, "", "/to-dos/create");

        renderRoutes();

        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toBeInTheDocument());
        expect(cardColor()).toBe("border-warning");   // sötét téma alapértéke
    });
});

describe("Változatlan mentés", () => {
    it("ha semmit nem módosítok, a Tovább NEM megy a szerverhez", async () => {
        renderRoutes();

        await userEvent.click(await screen.findByText("Bevásárlás"));
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));

        handleAxios.mockClear();
        await userEvent.click(screen.getByRole("button", {name: "Tovább"}));

        /* Egyetlen /to-dos/update kérés sem mehet ki: a mentés updatedAt-et is
           írna, tehát egy üres "Tovább" hazudná, hogy hozzányúltunk. */
        const calls = handleAxios.mock.calls.map((call) => call[0]);
        expect(calls).not.toContain("/to-dos/update");
        // ...de a főoldalra azért visszavisz.
        await waitFor(() => expect(window.location.pathname).toBe("/to-dos"));
    });

    it("Escape a szerkesztőben a Tovább gombbal egyenértékű: a főoldalra visz", async () => {
        renderRoutes();

        await userEvent.click(await screen.findByText("Bevásárlás"));
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));

        // Az Escape a formot süti el (mint a Tovább); változatlan to-dónál ez a
        // "csak navigálás" ágra fut, tehát a főoldalra kerülünk.
        await userEvent.keyboard("{Escape}");
        await waitFor(() => expect(window.location.pathname).toBe("/to-dos"));
    });

    it("Escape ÉRINTETLEN create-en mentés nélkül a főoldalra visz (nem kényszerít)", async () => {
        window.history.pushState({}, "", "/to-dos/create");
        renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toBeInTheDocument());

        // Üres űrlaphoz hozzá sem nyúltunk: nem kérünk kötelező mezőt, csak elvetjük.
        await userEvent.keyboard("{Escape}");
        await waitFor(() => expect(window.location.pathname).toBe("/to-dos"));
        expect(screen.queryByText("Ez a mező kitöltése kötelező.")).not.toBeInTheDocument();
    });

    it("megkezdett, de hiányos create: a mentés megáll, nem navigál és nem ment", async () => {
        window.history.pushState({}, "", "/to-dos/create");
        renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toBeInTheDocument());

        /* A kategóriát kitöltjük, a címet üresen hagyjuk: így már NEM érintetlen az
           űrlap (nem a "csak elvetjük" ág), de egy kötelező mező hiányzik. */
        await userEvent.type(screen.getByPlaceholderText("Kategória"), "munka");
        handleAxios.mockClear();
        await userEvent.click(screen.getByRole("button", {name: "Tovább"}));

        /* A hiányzó cím megállítja a mentést: create-kérés nem megy ki, és a
           szerkesztőben maradunk. A hibabuborék MEGJELENÉSE react-tooltip portál +
           canvas-mérés — azt élőben, headless renderrel igazoltuk; jsdom-ban a
           portál nem rajzol, ezért itt a megfigyelhető VISELKEDÉST rögzítjük. */
        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/to-dos/create");
        expect(window.location.pathname).toBe("/to-dos/create");
    });

    it("ha módosítok, a Tovább elküldi a szervernek", async () => {
        renderRoutes();

        await userEvent.click(await screen.findByText("Bevásárlás"));
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));

        await userEvent.type(screen.getByPlaceholderText("Cím"), " ma");
        handleAxios.mockClear();
        await userEvent.click(screen.getByRole("button", {name: "Tovább"}));

        await waitFor(() => expect(handleAxios.mock.calls.map((c) => c[0])).toContain("/to-dos/update"));
    });
});

describe("Szerkesztőből kilépés célja", () => {
    it("update mentése a szűrt nézetbe tér vissza, ahonnan indult (nem a főoldalra)", async () => {
        // A szűrt kategória-nézet is a to-dót adja, hogy legyen mire kattintani.
        handleAxios.mockImplementation((url, data, then) => {
            if (url === "/to-dos/id") then({data: TODO});
            else if (url === "/to-dos/last/order") then({data: 3});
            else if (url === "/to-dos/category") then({data: [TODO]});
            else then({status: 200, data: {}});
            return Promise.resolve();
        });
        window.history.pushState({}, "", "/to-dos/category/otthon");
        renderRoutes();

        // A szűrt listáról a kártyára kattintva jutunk a szerkesztőbe (history-lépés).
        await userEvent.click(await screen.findByText("Bevásárlás"));
        await waitFor(() => expect(window.location.pathname).toBe("/to-dos/update/todo-1"));

        // Módosítunk, majd mentünk.
        await userEvent.type(screen.getByPlaceholderText("Cím"), " ma");
        await userEvent.click(screen.getByRole("button", {name: "Tovább"}));

        /* A mentés VISSZALÉP a böngésző-előzményben: a szűrt nézetbe, ahonnan
           indultunk — nem a /to-dos főoldalra. Így a szűrő nem vész el. */
        await waitFor(() => expect(window.location.pathname).toBe("/to-dos/category/otthon"));
    });

    it("update közvetlen megnyitás után (nincs app-előzmény) a to-do listára ment", async () => {
        /* F5 vagy közvetlen link: a szerkesztő az első history-bejegyzés
           (location.key === "default"), nincs hová visszalépni — a fallback a
           to-do lista, nem egy vak history-ugrás ki az appból. */
        window.history.pushState({}, "", "/to-dos/update/todo-1");
        renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));

        await userEvent.type(screen.getByPlaceholderText("Cím"), " ma");
        await userEvent.click(screen.getByRole("button", {name: "Tovább"}));

        await waitFor(() => expect(window.location.pathname).toBe("/to-dos"));
    });
});

/* A VISSZA GOMB (böngésző POP) a useBlocker-en át pontosan úgy viselkedik, mint a
   Tovább: van mentenivaló → ellenőriz; érvényesnél MENT, majd folytatja a
   visszalépést (proceed). A böngésző Vissza gombját a window.history.back() modellezi
   (a data router popstate-re ugyanazt az utat futtatja). */
describe("Save — Vissza gomb (böngésző POP) a blockeren át", () => {
    it("érvényes módosítást MENT, majd visszaenged az előző oldalra", async () => {
        // Előzmény: a lista, majd a szerkesztő — így van hová visszalépni.
        window.history.pushState({}, "", "/to-dos");
        window.history.pushState({}, "", "/to-dos/update/todo-1");
        renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));

        await userEvent.type(screen.getByPlaceholderText("Cím"), " ma");
        handleAxios.mockClear();
        window.history.back();

        await waitFor(() => expect(handleAxios.mock.calls.some((c) => c[0] === "/to-dos/update")).toBe(true));
        await waitFor(() => expect(window.location.pathname).toBe("/to-dos"));
    });
});

/* A szerkesztő ELHAGYÁSA (logóra kattintás, Vissza gomb, bármely navigáció) a
   szerkesztő leválását (unmount) jelenti — ilyenkor ugyanaz a mentés fusson le, mint
   a Tovább/Escape-nél, csak navigáció nélkül. A leválást a teszt az unmount()-tal
   modellezi. A legfontosabb a NEGATÍV eset: a Tovább utáni leválás ne mentsen újra. */
describe("Save — mentés leváláskor (logó/Vissza/navigáció)", () => {
    it("módosított to-do a szerkesztő leválásakor (unmount) mentődik", async () => {
        window.history.pushState({}, "", "/to-dos/update/todo-1");
        const view = renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));

        await userEvent.type(screen.getByPlaceholderText("Cím"), " ma");
        handleAxios.mockClear();
        view.unmount();

        const call = handleAxios.mock.calls.find((c) => c[0] === "/to-dos/update");
        expect(call?.[1]).toMatchObject({id: "todo-1", title: "Bevásárlás ma"});
    });

    it("érintetlen szerkesztő leválása NEM ment", async () => {
        window.history.pushState({}, "", "/to-dos/update/todo-1");
        const view = renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));

        handleAxios.mockClear();
        view.unmount();

        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/to-dos/update");
    });

    it("Tovább után a leválás NEM ment újra (nincs dupla mentés)", async () => {
        window.history.pushState({}, "", "/to-dos/update/todo-1");
        const view = renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));

        await userEvent.type(screen.getByPlaceholderText("Cím"), " ma");
        handleAxios.mockClear();
        await userEvent.click(screen.getByRole("button", {name: "Tovább"}));
        await waitFor(() => expect(handleAxios.mock.calls.some((c) => c[0] === "/to-dos/update")).toBe(true));
        view.unmount();

        const updates = handleAxios.mock.calls.filter((c) => c[0] === "/to-dos/update");
        expect(updates).toHaveLength(1);
    });
});

/* AUTOSAVE: tétlenség után a szerkesztő magától ment és visszalép a listára. Ez
   védi az otthagyott munkát: a mentés még ÉRVÉNYES tokennel megy, mielőtt az auth
   15 perces tétlenségi kijelentkezése lejáratná a session-t. Az idézet-szerkesztő
   ugyanezt teszi, ugyanazzal a közös órával (Editor/useIdleTimer). */
describe("Save — autosave tétlenség után", () => {
    it("tétlenség után menti a módosítást és a listára navigál", async () => {
        vi.useFakeTimers();
        try {
            window.history.pushState({}, "", "/to-dos/update/todo-1");
            renderRoutes();
            // A betöltés (handleAxios → setState) lefuttatása a hamis órán.
            await act(async () => { await vi.advanceTimersByTimeAsync(0); });
            fireEvent.change(document.querySelector("#createColumn"), {target: {value: "Módosított cím"}});
            handleAxios.mockClear();

            // 10 perc tétlenség (közben SEMMI aktivitás) → az autosave elsül.
            await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60 * 1000); });

            const call = handleAxios.mock.calls.find((c) => c[0] === "/to-dos/update");
            expect(call?.[1]).toMatchObject({id: "todo-1", title: "Módosított cím"});
            // Siker után a listára navigál (kilép a szerkesztőből).
            expect(window.location.pathname).toBe("/to-dos");
        } finally {
            vi.useRealTimers();
        }
    });

    it("aktivitás újraindítja az órát (nem ment idő előtt)", async () => {
        vi.useFakeTimers();
        try {
            window.history.pushState({}, "", "/to-dos/update/todo-1");
            renderRoutes();
            await act(async () => { await vi.advanceTimersByTimeAsync(0); });
            fireEvent.change(document.querySelector("#createColumn"), {target: {value: "Módosított cím"}});
            handleAxios.mockClear();

            // 9 perc tétlenség, egy billentyű, majd újabb 9 perc — összesen 18 perc, de
            // tétlenül csak 9 → NEM autosave-el, és bent maradunk a szerkesztőben.
            await act(async () => { await vi.advanceTimersByTimeAsync(9 * 60 * 1000); });
            await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown")); });
            await act(async () => { await vi.advanceTimersByTimeAsync(9 * 60 * 1000); });

            expect(handleAxios.mock.calls.some((c) => c[0] === "/to-dos/update")).toBe(false);
            expect(window.location.pathname).toBe("/to-dos/update/todo-1");
        } finally {
            vi.useRealTimers();
        }
    });

    it("ÉRINTETLEN szerkesztőt nem ment és nem is navigál el", async () => {
        vi.useFakeTimers();
        try {
            window.history.pushState({}, "", "/to-dos/update/todo-1");
            renderRoutes();
            await act(async () => { await vi.advanceTimersByTimeAsync(0); });
            handleAxios.mockClear();

            await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60 * 1000); });

            // Nincs mentenivaló: a felhasználót hagyjuk a szerkesztőben — a 15 perces
            // tétlenségi kijelentkezés majd a szokott módon jön.
            expect(handleAxios.mock.calls.some((c) => c[0] === "/to-dos/update")).toBe(false);
            expect(window.location.pathname).toBe("/to-dos/update/todo-1");
        } finally {
            vi.useRealTimers();
        }
    });
});

/* A KIJELENTKEZÉSKORI mentés a leváláskor még ÉRVÉNYES tokent zárványolja: a
   removeCookie a hívás pillanatára már törli az élőt, tehát token nélkül a mentés
   401-gyel elveszne. A handleAxios ötödik paramétere ez a felülíró token. */
describe("Save — a leváláskori mentés zárványolt tokennel megy", () => {
    it("az unmount-mentés EXPLICIT tokent ad át a hívásnak", async () => {
        window.history.pushState({}, "", "/to-dos/update/todo-1");
        const view = renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));

        await userEvent.type(screen.getByPlaceholderText("Cím"), " ma");
        handleAxios.mockClear();
        view.unmount();

        const call = handleAxios.mock.calls.find((c) => c[0] === "/to-dos/update");
        // Az ötödik argumentum a felülíró token (az auth-mock TEST_TOKEN-t ad).
        expect(call?.[4]).toBe(TEST_TOKEN);
    });
});

/* A SORSZÁM-VÁLASZTÓ felső korlátja. A szerkesztő a /last/order válaszából
   számolja: létrehozásnál a meglévő elemek száma (N), módosításnál N-1 — mert a
   szerkesztett elem a saját helyén MÁR bent van a listában. Az Order ehhez ad
   még egyet (max = last + 1), tehát a legnagyobb választható sorszám create-nél
   N+1, update-nél N.

   Elcsúszva ez NÉMÁN romlik el: a stepper felenged egy olyan sorszámot, amit a
   szerver eltolás után nem oda ad, ahova a felhasználó tette — a lista csak a
   következő betöltéskor mutatja meg, hogy máshova került. A mock 3 meglévő
   elemet jelent (/to-dos/last/order → 3). */
describe("Save — a sorszám-választó felső korlátja", () => {
    // A stepper száma a tooltip-horgonyon ül; a + gomb a Bootstrap-ikon.
    const orderValue = () => document.querySelector('[data-tooltip-id="order-tooltip"]').textContent;
    const stepUpToLimit = async () => {
        const plus = document.querySelector(".bi-plus-circle");
        fireEvent.mouseDown(plus);
        // Bőven több idő, mint amennyi a határig lépéshez kell — a stepper megáll a maxon.
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        fireEvent.mouseUp(plus);
        await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    };

    it("LÉTREHOZÁSNÁL a lista utáni új helyig enged (3 elem → 4)", async () => {
        vi.useFakeTimers();
        try {
            window.history.pushState({}, "", "/to-dos/create");
            renderRoutes();
            await act(async () => { await vi.advanceTimersByTimeAsync(0); });

            await stepUpToLimit();

            expect(orderValue()).toBe("4");
        } finally {
            vi.useRealTimers();
        }
    });

    it("MÓDOSÍTÁSNÁL csak a lista végéig (3 elem → 3), mert a szerkesztett már bent van", async () => {
        vi.useFakeTimers();
        try {
            window.history.pushState({}, "", "/to-dos/update/todo-1");
            renderRoutes();
            await act(async () => { await vi.advanceTimersByTimeAsync(0); });

            await stepUpToLimit();

            expect(orderValue()).toBe("3");
        } finally {
            vi.useRealTimers();
        }
    });
});
