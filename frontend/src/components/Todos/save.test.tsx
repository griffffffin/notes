import {act, fireEvent, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {renderRoutes as renderApp} from "../../test/renderRoutes";
import {axiosResponse} from "../../test/axiosResponse";
import {requireElement} from "../../test/dom";
import type {AxiosResponse} from "axios";
import type {Todo} from "../../types/api";
import {at} from "../../test/at";
import {flushPendingSaves} from "../../pendingSave";

/* A kérés TÖRZSE a kém felől `unknown` — az azonosítót VALÓDI vizsgálattal
   olvassuk ki belőle, nem `as`-szal. Ha a betöltő lekérés törzse egyszer más
   alakot venne fel, ez azonnal, beszédesen bukik. */
const idOf = (data: unknown): string => {
    if (typeof data === "object" && data !== null && "id" in data && typeof data.id === "string") return data.id;
    throw new Error(`a lekérés törzsében nincs id: ${JSON.stringify(data)}`);
};

/* Csak a SZERVERHÍVÁST cseréljük ki; a témát VALÓDIKÉNT használjuk (a téma és a
   to-do színének viszonya épp az egyik vizsgált kérdés), és a route-tábla is
   valódi — a /update → /create váltás viselkedése az ő felelőssége. A route-fa
   renderelésének kerete a közös test/renderRoutes segédben van. */

/* A fixtúra a szerver VALÓDI válaszának alakjában: a tulajdonos és az
   időbélyegek is benne vannak (a Mongoose mindig küldi őket), még ha ez a teszt
   nem is vizsgálja azokat. A `satisfies` a szerződéshez méri — egy hiányzó mező
   innentől fordítási hiba —, de megtartja a literálokat, így a "danger" a szűk
   TodoColor unióhoz illeszkedik. */
const TODO = {
    _id: "todo-1", user: "u-1", title: "Bevásárlás", color: "danger", category: "otthon",
    order: 1, percentage: 0, tasks: {}, taskOrder: [],
    createdAt: "2026-01-01T10:00:00.000Z", updatedAt: "2026-01-01T10:00:00.000Z",
} satisfies Todo;

/* A Context-mock ÁLLANDÓ objektumot adjon vissza: a komponensek effektjei a
   handleAxios azonosságára vannak felfüggesztve, így egy rendernként újra
   gyártott függvény végtelen újratöltő ciklust okozna a tesztben. */
/* A `token` a mockban is szerepel: a leváláskori mentés ezt zárványolja, és
   EXPLICIT ötödik argumentumként adja át a handleAxios-nak (kijelentkezéskor az
   élő token már törölve van). Az alábbi teszt épp ezt az átadást rögzíti. */
const TEST_TOKEN = "teszt-token";
const {auth, handleAxios} = await vi.hoisted(async () => {
    const {mockAuth} = await import("../../test/mockAuth");
    return mockAuth({isLoggedIn: true, token: "teszt-token"});
});

vi.mock(import("../../contexts/auth-context"), () => ({useAuth: () => auth}));

/* A to-do szerkesztőjéhez KELL egy létező kategória: a kategória-legördülő ebből
   a propból tölt, és a tesztek közül több épp a választását vizsgálja. Az utat a
   hívások maguk állítják be (pushState), ezért a path itt marad üresen. */
const renderRoutes = () => renderApp(undefined, {categories: ["otthon"]});

// A kártya színe a szegély-osztályból olvasható ki ("border-danger").
const cardColor = () => [...requireElement("form", HTMLFormElement).classList]
    .find((c) => c.startsWith("border-") && c !== "border-2");

/* A jsdom nem ad valódi canvas-t; a fieldOf a placeholder szélességét
   measureText-tel méri a buborék vízszintes horgonyához. Egy egyszerű mock elég:
   a pontos szélesség itt nem számít, mert a buborék MEGJELENÉSÉT vizsgáljuk, nem
   a pixelpozícióját (azt élőben, headless renderrel néztük). */
beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
        value: () => ({font: "", measureText: () => ({width: 10})}),
        configurable: true,
    });
});

beforeEach(() => {
    window.history.pushState({}, "", "/");
    handleAxios.mockReset();
    handleAxios.mockImplementation((url, data, then) => {
        if (url === "/to-dos/id") then(axiosResponse(TODO));
        else if (url === "/to-dos/last/order") then(axiosResponse(3));
        else if (url === "/to-dos") then(axiosResponse([TODO]));
        else then(axiosResponse({}));
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
        await userEvent.click(requireElement('[data-icon="plus"]', SVGSVGElement));

        await waitFor(() => expect(window.location.pathname).toMatch(/^\/to-dos\/create\/[0-9a-f]{24}$/));
        expect(screen.getByPlaceholderText("Cím")).toHaveValue("");
        expect(screen.getByPlaceholderText("Kategória")).toHaveValue("");
    });

    /* A BETÖLTÉS HIBAÁGA — a SZERVER VÁLASZA dönt, nem a hiba puszta ténye.

       Korábban itt EGYETLEN teszt állt, és az a régi viselkedést rögzítette: egy
       időtúllépés a listára navigált. Vagyis a szerkesztő egy múló hálózati
       zökkenőt (wifi-váltás, épp újrainduló szerver) ugyanúgy kezelt, mint egy
       törölt elemet — kirakta a felhasználót, és ezzel azt ÁLLÍTOTTA, hogy az
       eleme odalett. A backend viszont pontosan megmondja, melyikről van szó:
       403 a nem létező ÉS az idegen elemre (ownership.js), 500 a saját hibájára
       (serverError.js), és semmilyen státusz a hálózatiakra.

       A három eset ezért három teszt. Ugyanaz a szabály, mint a publikus
       idézetnél (Quotes/public.tsx) — ott a `notFound`, itt a kinavigálás az,
       amit csak valódi szerver-válaszra szabad kimondani. */
    describe("a to-do betöltése elbukik", () => {
        const failTodoLoad = (error: unknown) =>
            handleAxios.mockImplementation((url, data, then, catchError) => {
                if (url === "/to-dos/id") catchError(error);
                else if (url === "/to-dos/last/order") then(axiosResponse(3));
                else if (url === "/to-dos") then(axiosResponse([TODO]));
                else then(axiosResponse({}));
                return Promise.resolve();
            });

        // A listáról a kártyára kattintva indul a szerkesztő betöltése.
        const openEditor = async () => {
            renderRoutes();
            await userEvent.click(await screen.findByText("Bevásárlás"));
        };

        it("hálózati hibánál a szerkesztőben maradunk, újrapróbálási lehetőséggel", async () => {
            failTodoLoad({message: "timeout of 15000ms exceeded"});

            await openEditor();

            expect(await screen.findByText(/Hiba az oldal betöltése közben/)).toBeVisible();
            expect(screen.getByRole("button", {name: "Adatok ismételt lekérése"})).toBeVisible();
            // NEM navigáltunk el: a szerkesztő címén állunk.
            expect(window.location.pathname).toBe("/to-dos/update/todo-1");
            /* A karika sem pörög tovább — ez volt a kinavigálás EREDETI indoka, és
               a jelzés ezt is megoldja (a loadFailed a spinner előtt térít el). */
            expect(document.querySelector(".spinner-border")).not.toBeInTheDocument();
        });

        it("500-nál is maradunk: a szerver akadt meg, nem az elem tűnt el", async () => {
            failTodoLoad({response: {status: 500}});

            await openEditor();

            expect(await screen.findByText(/Hiba az oldal betöltése közben/)).toBeVisible();
            expect(window.location.pathname).toBe("/to-dos/update/todo-1");
        });

        it("403-nál a listára visz: az elem tényleg nem érhető el", async () => {
            failTodoLoad({response: {status: 403}});

            await openEditor();

            await waitFor(() => expect(window.location.pathname).toBe("/to-dos"));
            expect(screen.queryByPlaceholderText("Cím")).not.toBeInTheDocument();
            expect(screen.queryByText(/Hiba az oldal betöltése közben/)).not.toBeInTheDocument();
        });

        it("az ÚJRA gomb megismétli a to-do lekérését, és megnyílik a szerkesztő", async () => {
            let shouldFail = true;
            handleAxios.mockImplementation((url, data, then, catchError) => {
                if (url === "/to-dos/id" && shouldFail) catchError(new Error("Network Error"));
                else if (url === "/to-dos/id") then(axiosResponse(TODO));
                else if (url === "/to-dos/last/order") then(axiosResponse(3));
                else if (url === "/to-dos") then(axiosResponse([TODO]));
                else then(axiosResponse({}));
                return Promise.resolve();
            });

            await openEditor();
            expect(await screen.findByText(/Hiba az oldal betöltése közben/)).toBeVisible();

            shouldFail = false;
            await userEvent.click(screen.getByRole("button", {name: "Adatok ismételt lekérése"}));

            /* EGY waitFor, KÉT állítással: itt ÁTMENET van (a hibaüzenet fentebb
               még látszott), és két külön pillanatban kérdezve a második
               elkaphatja a félidőt (l. Quotes/read.test.tsx mérése). */
            await waitFor(() => {
                expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás");
                expect(screen.queryByText(/Hiba az oldal betöltése közben/)).not.toBeInTheDocument();
            });
        });
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
    it("ha semmit nem módosítok, a Mentés NEM megy a szerverhez", async () => {
        renderRoutes();

        await userEvent.click(await screen.findByText("Bevásárlás"));
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));

        handleAxios.mockClear();
        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));

        /* Egyetlen /to-dos/update kérés sem mehet ki: a mentés updatedAt-et is
           írna, tehát egy üres "Mentés" hazudná, hogy hozzányúltunk. */
        const calls = handleAxios.mock.calls.map((call) => call[0]);
        expect(calls).not.toContain("/to-dos/update");
        // ...de a főoldalra azért visszavisz.
        await waitFor(() => expect(window.location.pathname).toBe("/to-dos"));
    });

    it("Escape a szerkesztőben a Mentés gombbal egyenértékű: a főoldalra visz", async () => {
        renderRoutes();

        await userEvent.click(await screen.findByText("Bevásárlás"));
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));

        // Az Escape a formot süti el (mint a Mentés); változatlan to-dónál ez a
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
        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));

        /* A hiányzó cím megállítja a mentést: create-kérés nem megy ki, és a
           szerkesztőben maradunk. A hibabuborék MEGJELENÉSE react-tooltip portál +
           canvas-mérés — azt élőben, headless renderrel igazoltuk; jsdom-ban a
           portál nem rajzol, ezért itt a megfigyelhető VISELKEDÉST rögzítjük. */
        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/to-dos/create");
        expect(window.location.pathname).toMatch(/^\/to-dos\/create\/[0-9a-f]{24}$/);
    });

    it("ha módosítok, a Mentés elküldi a szervernek", async () => {
        renderRoutes();

        await userEvent.click(await screen.findByText("Bevásárlás"));
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));

        await userEvent.type(screen.getByPlaceholderText("Cím"), " ma");
        handleAxios.mockClear();
        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));

        await waitFor(() => expect(handleAxios.mock.calls.map((c) => c[0])).toContain("/to-dos/update"));
    });
});

describe("Szerkesztőből kilépés célja", () => {
    it("update mentése a szűrt nézetbe tér vissza, ahonnan indult (nem a főoldalra)", async () => {
        // A szűrt kategória-nézet is a to-dót adja, hogy legyen mire kattintani.
        handleAxios.mockImplementation((url, data, then) => {
            if (url === "/to-dos/id") then(axiosResponse(TODO));
            else if (url === "/to-dos/last/order") then(axiosResponse(3));
            else if (url === "/to-dos/category") then(axiosResponse([TODO]));
            else then(axiosResponse({}));
            return Promise.resolve();
        });
        window.history.pushState({}, "", "/to-dos/category/otthon");
        renderRoutes();

        // A szűrt listáról a kártyára kattintva jutunk a szerkesztőbe (history-lépés).
        await userEvent.click(await screen.findByText("Bevásárlás"));
        await waitFor(() => expect(window.location.pathname).toBe("/to-dos/update/todo-1"));

        // Módosítunk, majd mentünk.
        await userEvent.type(screen.getByPlaceholderText("Cím"), " ma");
        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));

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
        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));

        await waitFor(() => expect(window.location.pathname).toBe("/to-dos"));
    });
});

/* A VISSZA GOMB (böngésző POP) a useBlocker-en át pontosan úgy viselkedik, mint a
   Mentés: van mentenivaló → ellenőriz; érvényesnél MENT, majd folytatja a
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
   a Mentés/Escape-nél, csak navigáció nélkül. A leválást a teszt az unmount()-tal
   modellezi. A legfontosabb a NEGATÍV eset: a Mentés utáni leválás ne mentsen újra. */
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

    it("Mentés után a leválás NEM ment újra (nincs dupla mentés)", async () => {
        window.history.pushState({}, "", "/to-dos/update/todo-1");
        const view = renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));

        await userEvent.type(screen.getByPlaceholderText("Cím"), " ma");
        handleAxios.mockClear();
        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));
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
            fireEvent.change(requireElement("#createColumn", HTMLInputElement), {target: {value: "Módosított cím"}});
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
            fireEvent.change(requireElement("#createColumn", HTMLInputElement), {target: {value: "Módosított cím"}});
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
    const orderValue = () => requireElement('[data-tooltip-id="order-tooltip"]', HTMLElement).textContent;
    const stepUpToLimit = async () => {
        const plus = requireElement(".bi-plus-circle", SVGSVGElement);
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

/* VERSENYHELYZET a betöltő effektben — a save.tsx `active` zászlójának őre.
   A /to-dos/update/:id route-on a szerkesztő NEM mountol újra, ha csak az :id
   változik (a route key="update" mindkét címen ugyanaz), tehát az effekt fut le
   megint. A két betöltés válasza fordított sorrendben is visszaérhet, és a LEJÁRT
   kérés callbackje felülírhatná a friss to-do mezőit ÉS a loadedTodo pillanatképet
   is — az utóbbi a súlyosabb: a "változott-e?" ellenőrzés attól kezdve a MÁSIK
   to-dóhoz hasonlítana, és a mentés a szerkesztett elemre írná a rossz adatot.
   Néma hiba: semmi nem dob, az űrlap kitöltve áll, csak nem azzal, amit nyitottunk.

   A válaszokat itt nem a mock süti el, hanem a teszt, kézzel, rossz sorrendben. */
describe("Save — versenyhelyzet a betöltésben", () => {
    /* A /to-dos/id hívások callbackjeit összegyűjti ahelyett, hogy válaszolna; a
       többi végpont (sorszám, lista) marad automatikus, különben a szerkesztő a
       betöltőn ragadna. */
    const capturePendingLoads = () => {
        /* A típus kimondja, mit tart a tömb: a kért to-do azonosítóját és azt a
           visszahívást, ami MAJD a to-dót kapja. */
        const pending: {id: string; then: (response: AxiosResponse<Todo>) => void}[] = [];
        handleAxios.mockImplementation((url, data, then) => {
            if (url === "/to-dos/id") pending.push({id: idOf(data), then});
            else if (url === "/to-dos/last/order") then(axiosResponse(3));
            else if (url === "/to-dos") then(axiosResponse([TODO]));
            else then(axiosResponse({}));
            return Promise.resolve();
        });
        return pending;
    };

    /* Két szerkesztő-cím egymás után az előzményben, majd a böngésző Vissza gombja
       (a data router popstate-re navigál): a todo-2 kérése MÁR FUT, amikor a todo-1
       kérése elindul. A visszalépést nem akasztja meg a blocker, mert betöltetlen
       szerkesztő (loadedTodo === null) nem "piszkos". */
    const openTwoEditorsAndGoBack = async () => {
        const pending = capturePendingLoads();
        window.history.pushState({}, "", "/to-dos/update/todo-1");
        window.history.pushState({}, "", "/to-dos/update/todo-2");
        renderRoutes();
        await waitFor(() => expect(pending).toHaveLength(1));

        window.history.back();
        await waitFor(() => expect(pending).toHaveLength(2));
        // A sorrend a teszt előfeltétele: előbb a lejárt todo-2, utána a friss todo-1.
        expect(pending.map((call) => call.id)).toEqual(["todo-2", "todo-1"]);
        return pending;
    };

    it("a lejárt :id KÉSVE érkező válasza nem írja felül a friss to-do mezőit", async () => {
        const pending = await openTwoEditorsAndGoBack();

        // Előbb a FRISS (todo-1) válasza érkezik meg, és csak utána a lejárt todo-2-é.
        act(() => at(pending, 1).then(axiosResponse({...TODO, _id: "todo-1", title: "Friss to-do"})));
        act(() => at(pending, 0).then(axiosResponse({
            ...TODO, _id: "todo-2", title: "Lejárt to-do", color: "success", category: "munka",
        })));

        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Friss to-do"));
        // A lejárt válasz sem a kategóriát, sem a színt nem hozta magával.
        expect(screen.getByPlaceholderText("Kategória")).toHaveValue("otthon");
        expect(cardColor()).toBe("border-danger");
    });

    it("a lejárt :id KÉSVE érkező HIBÁJA nem rángatja ki a szerkesztőből", async () => {
        const pending = await openTwoEditorsAndGoBack();
        // A hiba-ág a NEGYEDIK argumentum (a sikeres a harmadik).
        const staleCall = handleAxios.mock.calls
            .find((call) => call[0] === "/to-dos/id" && idOf(call[1]) === "todo-2");
        if (!staleCall) throw new Error("nem indult lekérés a todo-2-re");
        const staleError = staleCall[3];

        act(() => at(pending, 1).then(axiosResponse({...TODO, _id: "todo-1", title: "Friss to-do"})));
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Friss to-do"));
        // A lejárt kérés elszáll (pl. timeout) — az ő hiba-ága a listára navigálna.
        act(() => staleError({message: "timeout of 15000ms exceeded"}));

        expect(window.location.pathname).toBe("/to-dos/update/todo-1");
        expect(screen.getByPlaceholderText("Cím")).toHaveValue("Friss to-do");
    });
});

/* A SORSZÁM-KORLÁT LEKÉRÉSÉNEK BUKÁSA — ezt az átvizsgálás találta (2026-08-18).

   A szerkesztő két kérést indít: a to-dót (csak /update-nél) és a sorszám felső
   korlátját (/to-dos/last/order, MINDIG). A betöltő karika akkor tűnik el, ha
   `lastOrder` megérkezett — a hibaága viszont csak naplózott. Vagyis a korlát
   lekérésének bukása után a karika ÖRÖKKÉ pörög, és pont azt ígéri, ami sosem
   jön. A /create ágon ez a KIZÁRÓLAGOS kérés, tehát ott egy hálózati zökkenő
   használhatatlan képernyőt hagy maga után.

   Ugyanaz a hibaosztály, mint a listáé volt: a felület nem hazudik szándékosan,
   csak épp semmit nem mond — a felhasználó vár valamire, ami nem fog megjönni. */
describe("A sorszám-korlát lekérése elbukik", () => {
    const failLastOrder = () => handleAxios.mockImplementation((url, data, then, catchError) => {
        if (url === "/to-dos/last/order") catchError(new Error("Network Error"));
        else if (url === "/to-dos/id") then(axiosResponse(TODO));
        else if (url === "/to-dos") then(axiosResponse([TODO]));
        else then(axiosResponse({}));
        return Promise.resolve();
    });

    it("/create: nem pörög örökké a karika, hanem kimondja, hogy nem tölthető be", async () => {
        failLastOrder();
        window.history.pushState({}, "", "/to-dos/create");

        renderRoutes();

        expect(await screen.findByText(/Hiba az oldal betöltése közben/)).toBeVisible();
        expect(document.querySelector(".spinner-border")).not.toBeInTheDocument();
    });

    it("/update: ugyanígy (a to-do maga megjött, a korlát nem)", async () => {
        failLastOrder();
        window.history.pushState({}, "", "/to-dos/update/todo-1");

        renderRoutes();

        expect(await screen.findByText(/Hiba az oldal betöltése közben/)).toBeVisible();
    });

    it("az ÚJRA gomb megismétli a lekérést, és siker után megnyílik a szerkesztő", async () => {
        let shouldFail = true;
        handleAxios.mockImplementation((url, data, then, catchError) => {
            if (url === "/to-dos/last/order" && shouldFail) catchError(new Error("Network Error"));
            else if (url === "/to-dos/last/order") then(axiosResponse(3));
            else if (url === "/to-dos/id") then(axiosResponse(TODO));
            else then(axiosResponse({}));
            return Promise.resolve();
        });
        window.history.pushState({}, "", "/to-dos/create");
        renderRoutes();
        expect(await screen.findByText(/Hiba az oldal betöltése közben/)).toBeVisible();

        shouldFail = false;
        await userEvent.click(screen.getByRole("button", {name: "Adatok ismételt lekérése"}));

        /* EGY waitFor, KÉT állítással: itt ÁTMENET van (a hibaüzenet fentebb még
           látszott), és két külön pillanatban kérdezve a második elkaphatja a
           félidőt. A részletes indoklás és a mérés: Quotes/read.test.tsx. */
        await waitFor(() => {
            expect(screen.getByPlaceholderText("Cím")).toBeVisible();
            expect(screen.queryByText(/Hiba az oldal betöltése közben/)).not.toBeInTheDocument();
        });
    });

    it("SIKERES betöltésnél nincs hibaüzenet (kontroll)", async () => {
        window.history.pushState({}, "", "/to-dos/create");

        renderRoutes();

        expect(await screen.findByPlaceholderText("Cím")).toBeVisible();
        expect(screen.queryByText(/Hiba az oldal betöltése közben/)).not.toBeInTheDocument();
    });
});

/* A PISZKOZAT a to-do szerkesztőjében. A mechanizmus közös (drafts.ts), és a
   részletes eseteket az idézet-szerkesztő tesztje fedi le — itt azt bizonyítjuk,
   hogy a to-do SAJÁT mezői (alsorok, kategória, szín) is átjönnek. Ez a
   szekciók közti ELTÉRÉS pontja: az idézetnek négy mezője van, a to-dónak hat,
   köztük két összetett szerkezet. */
describe("TodoSave — piszkozat", () => {
    const DRAFT_KEY = "notes-draft:to-dos:todo-1";

    afterEach(() => localStorage.clear());

    it("a leváláskori mentés bukása után az ALSOROK is megmaradnak a piszkozatban", async () => {
        window.history.pushState({}, "", "/to-dos/update/todo-1");
        const view = renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));
        await userEvent.type(screen.getByPlaceholderText("Cím"), " ma");

        handleAxios.mockImplementation((url, data, then, catchError) => {
            if (url === "/to-dos/update") catchError(new Error("Network Error"));
            else then(axiosResponse({}));
            return Promise.resolve();
        });
        // A piszkozat csak a három próba után születik meg (l. saveRetry.ts).
        vi.useFakeTimers();
        view.unmount();
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        vi.useRealTimers();

        const stored = localStorage.getItem(DRAFT_KEY);
        expect(stored).not.toBeNull();
        expect(stored).toContain("Bevásárlás ma");
        // A to-do saját szerkezetei is benne vannak, nem csak a cím.
        expect(stored).toContain("taskOrder");
        expect(stored).toContain("category");
    });

    it("a visszaállítás a címet, a kategóriát ÉS az alsorokat is helyreállítja", async () => {
        /* A `base` a szerver AKKORI állapota — itt pontosan az, amit a fixtúra ad,
           tehát a szerveren azóta semmi nem változott: a piszkozat MAGÁTÓL
           visszaáll, kérdés nélkül. A to-do saját szerkezetei (alsorok, sorrend)
           is átjönnek — ez a szekciók közti különbség pontja. */
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
            savedAt: Date.now(),
            payload: {
                title: "Piszkozat-cím", category: "otthon", color: "danger", order: 1,
                tasks: {7: {id: "7", content: "Piszkozat-alsor", done: false}},
                taskOrder: [7],
            },
            base: {
                title: TODO.title, category: TODO.category, color: TODO.color, order: TODO.order,
                tasks: TODO.tasks, taskOrder: TODO.taskOrder,
            },
        }));
        window.history.pushState({}, "", "/to-dos/update/todo-1");

        renderRoutes();

        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Piszkozat-cím"));
        expect(screen.getByPlaceholderText("Kategória")).toHaveValue("otthon");
        expect(screen.getByDisplayValue("Piszkozat-alsor")).toBeInTheDocument();
        expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });
});

/* MENTÉS KÖZBEN A SZERKESZTŐ NEM HAGYHATÓ EL.

   Ez a blokk a projekt egyik legdrágább hibáját őrzi. Korábban EGYETLEN jelző
   (`leftViaForm`) jelentette azt is, hogy "most mentek", és azt is, hogy "a mentés
   kész, megyek" — a shouldBlock pedig ezt nézte. Emiatt a mentés TELJES ideje alatt
   (a 15 másodperces időkorlátig!) bárki navigációja szabadon átment: a türelmetlen
   második kattintás vagy a logó elvitte a felhasználót a szerkesztőből, a mentés
   utána bukott el, és a beírt szöveg NYOMTALANUL elveszett — se mentés, se
   piszkozat, se üzenet. Mérve, 2026-08-20.

   A mai őr a `savingRef`: amíg a kérés úton van, a shouldBlock igazat ad, tehát a
   logó, a "+", az Escape és a böngésző Vissza gombja is tehetetlen. Az őr egyetlen
   sor, amit egy refaktor némán kivehet — ezért kell rá teszt. */
describe("Save — mentés közben nem lehet elhagyni a szerkesztőt", () => {
    /* A mentés VÁLASZÁT visszatartjuk: így a teszt abban az ablakban vizsgálódik,
       amikor a kérés már elment, de még nem jött rá felelet. Élesben ez akár 15
       másodperc (a kérés időkorlátja) — bőven elég ahhoz, hogy a felhasználó
       türelmetlen legyen. */
    const pendingSave = (): Array<{ok: () => void; fail: () => void}> => {
        const pending: Array<{ok: () => void; fail: () => void}> = [];
        handleAxios.mockImplementation((url, data, then, catchError) => {
            if (url === "/to-dos/id") then(axiosResponse(TODO));
            else if (url === "/to-dos/last/order") then(axiosResponse(3));
            else if (url === "/to-dos") then(axiosResponse([TODO]));
            else if (url === "/to-dos/update") pending.push({
                ok: () => then(axiosResponse({})),
                fail: () => catchError({message: "timeout of 15000ms exceeded"}),
            });
            else then(axiosResponse({}));
            return Promise.resolve();
        });
        return pending;
    };

    const openAndEdit = async () => {
        window.history.pushState({}, "", "/to-dos");
        const view = renderRoutes();
        await userEvent.click(await screen.findByText("Bevásárlás"));
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));
        await userEvent.type(screen.getByPlaceholderText("Cím"), " ma");
        return view;
    };

    afterEach(() => localStorage.clear());

    it("a LOGÓ nem visz ki a futó mentés alól (a szöveg nem veszhet el)", async () => {
        const pending = pendingSave();
        await openAndEdit();

        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));
        await waitFor(() => expect(pending).toHaveLength(1));

        // A válasz MÉG NINCS itt. A logó a szekció gyökerére vivő link a navbarban.
        await userEvent.click(requireElement("a", HTMLAnchorElement));

        /* EGY PILLANATOT kérdezünk, két állítással: ott vagyunk-e még, és megvan-e
           a beírt szöveg. Korábban itt a /to-dos-on találtuk magunkat, üres kézzel. */
        await waitFor(() => {
            expect(window.location.pathname).toBe("/to-dos/update/todo-1");
            expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás ma");
        });
    });

    it("visszaírt eredeti szöveg mellett SEM enged ki a futó mentés alól", async () => {
        /* EZ A TESZT MÉRI A `savingRef`-ET, a fenti logós NEM.

           Amíg az űrlap "piszkos" (eltér a szerverétől), a shouldBlock a dirty
           jelző miatt amúgy is blokkol — a mutáció-próba ezt le is leplezte: a
           `savingRef.current ||` kivételére EGYETLEN teszt sem bukott meg. Itt
           viszont a felhasználó a mentés MEGINDÍTÁSA UTÁN visszaírja az eredeti
           szöveget, tehát az űrlap újra érintetlennek látszik — pedig a kérés úton
           van. Ilyenkor egyedül a `savingRef` tart bent minket; nélküle a logó
           kivinne, a szerkesztő leválna, és a bukó mentés válaszát már senki nem
           kezelné (se piszkozat, se üzenet). */
        const pending = pendingSave();
        await openAndEdit();

        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));
        await waitFor(() => expect(pending).toHaveLength(1));

        // A mentés fut; a felhasználó közben visszaállítja az eredeti címet.
        await userEvent.clear(screen.getByPlaceholderText("Cím"));
        await userEvent.type(screen.getByPlaceholderText("Cím"), TODO.title);
        await userEvent.click(requireElement("a", HTMLAnchorElement));

        await waitFor(() => {
            expect(window.location.pathname).toBe("/to-dos/update/todo-1");
            expect(screen.getByPlaceholderText("Cím")).toHaveValue(TODO.title);
        });
    });

    it("a MENTÉS gomb tiltott és 'Mentés…' feliratú, amíg a válasz meg nem jön", async () => {
        const pending = pendingSave();
        await openAndEdit();

        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));

        await waitFor(() => expect(screen.getByRole("button", {name: "Mentés…"})).toBeDisabled());
        // A Törlés is tiltva: ne lehessen törölni azt, aminek épp úton van a mentése.
        expect(screen.getByRole("button", {name: "Törlés"})).toBeDisabled();

        // A siker után a felirat okafogyott: elhagyjuk a szerkesztőt.
        await act(async () => { at(pending, 0).ok(); });
        await waitFor(() => expect(window.location.pathname).toBe("/to-dos"));
    });

    it("a bukás visszaállítja a feliratot, PISZKOZATOT ír, és a gombra teszi a fókuszt", async () => {
        const pending = pendingSave();
        await openAndEdit();

        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));
        await waitFor(() => expect(pending).toHaveLength(1));
        act(() => at(pending, 0).fail());

        /* KÉT JELZÉS: a felirat visszaáll (ez maga a visszajelzés), és közben a
           szöveg biztonságba került a piszkozatba. A FÓKUSZ nem itt vizsgálandó —
           ezt a mentést a GOMB indította, tehát a kattintás miatt amúgy is rajta
           van a fókusz; a mutáció-próba pontosan ezt a hamis zöldet mutatta meg.
           A fókusz-visszajelzésnek a logóval indított mentésnél van értelme, és a
           tesztje is ott áll (l. lentebb). */
        const saveButton = await screen.findByRole("button", {name: "Mentés"});
        await waitFor(() => expect(saveButton).toBeEnabled());
        expect(window.location.pathname).toBe("/to-dos/update/todo-1");

        const draft: unknown = JSON.parse(localStorage.getItem("notes-draft:to-dos:todo-1") ?? "null");
        expect(draft).toMatchObject({payload: {title: "Bevásárlás ma"}});
    });

    it("a LOGÓval indított mentés bukása után a Mentés gombra kerül a fókusz", async () => {
        /* EZ A FUNKCIÓ ITT SZÜLETETT. A mentést nem csak a gomb indítja: a logó, a
           "+", az Escape és a böngésző Vissza gombja is (a blockeren át). Ilyenkor a
           felhasználó a LOGÓRA néz, nem az űrlap aljára — a "Mentés…" → "Mentés"
           visszaváltás elkerülné a figyelmét, és annyit látna, hogy a logó nem
           csinál semmit. A fókuszgyűrű odaviszi a szemet, ÚJ elem és
           elrendezés-tolás nélkül (a user kifejezett kérése volt, hogy ne ugorjon
           fel semmi). */
        const pending = pendingSave();
        await openAndEdit();

        // A mentést a LOGÓ indítja el, nem a gomb: a fókusz a linken van.
        await userEvent.click(requireElement("a", HTMLAnchorElement));
        await waitFor(() => expect(pending).toHaveLength(1));
        act(() => at(pending, 0).fail());

        await waitFor(() => expect(screen.getByRole("button", {name: "Mentés"})).toHaveFocus());
        expect(window.location.pathname).toBe("/to-dos/update/todo-1");
    });

    it("a KIJELENTKEZÉS MEGVÁRJA a futó mentést (nem indít másodikat, de nem is hagyja ott)", async () => {
        /* A pendingSave.ts szabálya: "előbb a mentés, aztán a kilépés". Ez a
           szabály KÉTFELŐL sérülhet, és mindkét irány néma:

             - ha a leváláskori mentés a futó MELLÉ indít egy másodikat, az
               create-nél két elemet hoz létre;
             - ha viszont csak annyit mondunk rá, hogy "nincs mit menteni", akkor a
               kijelentkezés MEG SEM VÁRJA a már úton lévő mentést.

           A második pontosan előfordult, amikor a `hasSilentWork()` megkapta a
           `!savingRef.current` feltételt: az őr helyes volt, de vele együtt a
           várakozás is elveszett. Ezért ad a szerkesztő a KIJELENTKEZÉSNEK a már
           futó mentés ígéretét (inFlightRef) — se dupla mentés, se otthagyott. */
        const pending = pendingSave();
        await openAndEdit();

        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));
        await waitFor(() => expect(pending).toHaveLength(1));

        let exited = false;
        const logout = flushPendingSaves().then(() => { exited = true; });

        /* A mentés MÉG FUT: a kilépésnek várnia kell rá. Egy mikrotaszk-forduló
           bőven elég ahhoz, hogy egy AZONNAL teljesülő ígéret lefusson — tehát ha
           a flush nem várna (a hibás viselkedés), az `exited` MÁR itt igaz lenne. */
        await act(async () => { await Promise.resolve(); });
        expect(exited).toBe(false);

        // Most beérkezik a mentés válasza — innentől mehet a kilépés.
        await act(async () => { at(pending, 0).ok(); });
        await logout;

        expect(exited).toBe(true);
    });

    it("futó mentés MELLÉ a leválás nem indít másodikat (nincs dupla mentés)", async () => {
        /* A kijelentkezés nem router-navigáció, ezért a blocker nem látja: a
           szerkesztő egyszerűen leválik. Ilyenkor a leváláskori mentés a MÁR FUTÓ
           mentés mellé indítana egy másodikat — create-nél az két to-do volna.
           Az őr a hasSilentWork() `!savingRef.current` feltétele. */
        const pending = pendingSave();
        const view = await openAndEdit();

        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));
        await waitFor(() => expect(pending).toHaveLength(1));
        handleAxios.mockClear();
        view.unmount();

        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/to-dos/update");
    });
});

/* A LÉTREHOZÁS AZONOSÍTÓJA — a duplikáció elleni védelem kliens-oldali fele.

   A szerver az `_id` egyedi indexéből ismeri fel a megismételt létrehozást
   (backend/src/controllers/createOnce.js), de ehhez az azonosítónak a KLIENSTŐL
   kell jönnie, és UGYANANNAK kell maradnia a szerkesztő teljes élete alatt — az
   oldal újratöltését is beleértve. Ha új azonosító születne, a védelem nem
   hibázna, csak épp nem védene: a mentés új elemként menne át. */
describe("Save — a create azonosítója", () => {
    afterEach(() => localStorage.clear());

    const idOfCreate = () => {
        const call = handleAxios.mock.calls.find((c) => c[0] === "/to-dos/create");
        return call ? idOf(call[1]) : null;
    };

    const fillAndSave = async () => {
        await userEvent.type(screen.getByPlaceholderText("Cím"), "Új dolog");
        await userEvent.type(screen.getByPlaceholderText("Kategória"), "otthon");
        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));
        await waitFor(() => expect(idOfCreate()).not.toBeNull());
    };

    it("a létrehozás ObjectId-alakú azonosítót küld", async () => {
        /* A 24 hexa nem ízlés kérdése: a szerver validátora pontosan ezt engedi át
           (a két oldal egyezését a backend frontendContract.test.js-e őrzi). */
        window.history.pushState({}, "", "/to-dos/create");
        renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toBeInTheDocument());

        await fillAndSave();

        expect(idOfCreate()).toMatch(/^[0-9a-f]{24}$/);
    });

    it("F5 UTÁN ugyanazt az azonosítót küldi (a piszkozatból)", async () => {
        /* EZ A LÉNYEGI ESET. A felhasználó ír, a mentés elbukik (piszkozat), majd
           újratölti az oldalt — épp azért, mert valami nem stimmelt. Ha ilyenkor
           új azonosító születne, a következő mentés ÚJ elemet hozna létre azon
           felül, amit az első kérés esetleg mégis létrehozott. */
        const DRAFT_ID = "507f1f77bcf86cd799439011";
        localStorage.setItem("notes-draft:to-dos:create", JSON.stringify({
            savedAt: Date.now(),
            itemId: DRAFT_ID,
            payload: {title: "Félbehagyott", category: "otthon", color: "danger", order: 1, tasks: {}, taskOrder: []},
        }));
        window.history.pushState({}, "", "/to-dos/create");
        renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Félbehagyott"));

        await userEvent.type(screen.getByPlaceholderText("Cím"), "!");
        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));
        await waitFor(() => expect(idOfCreate()).not.toBeNull());

        expect(idOfCreate()).toBe(DRAFT_ID);
    });

    it("a piszkozatba is BEKERÜL az azonosító, ha a mentés elbukik", async () => {
        // Enélkül a fenti visszatöltésnek nem lenne mit visszaadnia.
        handleAxios.mockImplementation((url, data, then, catchError) => {
            if (url === "/to-dos/last/order") then(axiosResponse(3));
            else if (url === "/to-dos") then(axiosResponse([]));
            else if (url === "/to-dos/create") catchError({message: "timeout"});
            else then(axiosResponse({}));
            return Promise.resolve();
        });
        window.history.pushState({}, "", "/to-dos/create");
        renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toBeInTheDocument());

        await fillAndSave();

        const draft: unknown = JSON.parse(localStorage.getItem("notes-draft:to-dos:create") ?? "null");
        expect(draft).toMatchObject({itemId: idOfCreate()});
    });
});

/* A VISSZATÖLTÖTT PISZKOZATOT MENTENI IS LEHET.

   Bejelentés nélküli, de valódi hiba, ami az idempotencia-tesztek írása közben
   bukott ki (2026-08-21). A kötelező mezők ÉRVÉNYESSÉGE külön jelzőben él, amit a
   felhasználó gépelése állít igazra — update-nél ezen felül a szerver-betöltés is.
   Create-nél viszont nincs betöltés, és a piszkozat PROGRAMBÓL tölti ki a mezőket:
   a jelzők hamisak maradtak, tehát a Mentés a kitöltött mezők fölé írta ki, hogy
   "kitöltése kötelező". A szöveg ott volt a képernyőn, mégsem lehetett elmenteni —
   pontosan az a fajta hiba, ami nem hibaüzenetnek látszik, hanem a mi hazugságunk.

   A teszt SEMMIHEZ NEM NYÚL a visszatöltés után: ha a mentés elindul, a jelzők
   helyesen álltak be. */
describe("Save — a visszatöltött create-piszkozat menthető", () => {
    afterEach(() => localStorage.clear());

    it("érintetlen visszatöltés után a Mentés MENT, nem hibabuborékot ad", async () => {
        localStorage.setItem("notes-draft:to-dos:create", JSON.stringify({
            savedAt: Date.now(),
            payload: {title: "Kész cím", category: "otthon", color: "danger", order: 1, tasks: {}, taskOrder: []},
        }));
        window.history.pushState({}, "", "/to-dos/create");
        renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Kész cím"));
        handleAxios.mockClear();

        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));

        await waitFor(() => expect(handleAxios.mock.calls.map((c) => c[0])).toContain("/to-dos/create"));
        // A hibabuborék a másik ág: ha megjelenne, a mentés el sem indult volna.
        expect(screen.queryByText(/kitöltése kötelező/)).not.toBeInTheDocument();
    });
});
