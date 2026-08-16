import {act, fireEvent, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {renderRoutes} from "../../test/renderRoutes";
import {axiosResponse} from "../../test/axiosResponse";
import {requireElement} from "../../test/dom";
import type {AxiosResponse} from "axios";
import type {QuoteForEdit} from "../../types/api";

/* A lekérés törzséből az azonosítót VALÓDI vizsgálattal olvassuk ki (a kém felől
   `unknown`); egy `as` csak állítaná, hogy ott a mező. */
const idOf = (data: unknown): string => {
    if (typeof data === "object" && data !== null && "id" in data && typeof data.id === "string") return data.id;
    throw new Error(`a lekérés törzsében nincs id: ${JSON.stringify(data)}`);
};

/* Csak a SZERVERHÍVÁST cseréljük ki; a téma, a route-tábla és a szerkesztő maga
   valódi (a /quotes/create ↔ /quotes/update viselkedés épp a route-táblán múlik).
   A route-fa renderelésének kerete a közös test/renderRoutes segédben van. */

/* A /quotes/edit válasza SZŰKÍTETT: a backend (readForEdit.js) csak ezt a négy
   mezőt adja vissza — user-azonosítót és időbélyeget SOHA. A fixtúra ezért a
   QuoteForEdit szerződéshez méretik, nem a teljes Quote-hoz.

   A `fontSize` korábban SZÁNDÉKOSAN hiányzott innen (`Omit<QuoteForEdit,
   "fontSize">`), azzal az indokkal, hogy a szerkesztő alapértékre esik vissza
   nélküle. Csakhogy a szerver SOHA nem küld ilyen választ: a Mongoose az
   alapértéket a régi, mező nélkül mentett dokumentumokra is ráteszi betöltéskor
   (mérve a Pi élő adatán, 2026-08-15: 55 idézetből 17-ben nincs fontSize a
   lemezen, hidratálva mind az 55-ben van). A fixtúra tehát olyan választ
   utánzott, ami a valóságban nem fordul elő — a séma-ellenőrzés bevezetése ezt
   azonnal kimutatta. Egy pótlék akkor ér valamit, ha a VALÓSÁG helyett áll be. */
const QUOTE = {quote: "Az élet szép.", author: "Valaki", order: 1, fontSize: 155} satisfies QuoteForEdit;

/* Állandó handleAxios: a komponens effektjei az azonosságára függnek, egy
   rendernként újragyártott függvény végtelen újratöltő ciklust okozna. */
const {auth, handleAxios} = await vi.hoisted(async () => {
    const {mockAuth} = await import("../../test/mockAuth");
    return mockAuth({isLoggedIn: true});
});
vi.mock(import("../../contexts/auth-context"), () => ({useAuth: () => auth}));

// A jsdom nem ad valódi canvas-t; a validáció fieldAnchor-ja measureText-et hív.
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
        if (url === "/quotes/edit") then(axiosResponse(QUOTE));
        else if (url === "/quotes/last/order") then(axiosResponse(3));
        /* A mentés utáni leaveEditor a /quotes listát tölti, a szerző-mező pedig
           javaslatot kér — MINDKETTŐ tömböt vár. A kimaradó ág (a szerkesztő
           AuthorInputja) korábban a közös `{}` fallbackre esett: az a válasz a
           kódot ugyan nem zavarta (csak a [0]-át olvasta), de a szervertől SOSEM
           érkezhetett volna — a séma-ellenőrzés ezt is kimutatta. */
        else if (url === "/quotes" || url === "/quotes/author" || url === "/quotes/authors")
            then(axiosResponse([]));
        /* Ami marad, az az ÍRÁS-műveletek (create/update/delete) válasza: azokból
           a kód csak a státuszt nézi, törzset nem olvas — ezért marad a `{}`. */
        else then(axiosResponse({}));
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
        // maradunk. A gomb ilyenkor tiltott is (l. a fenti tesztet), de itt a
        // VÉGEREDMÉNYT állítjuk: szerzővel se lehessen idézet nélkül menteni.
        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/quotes/create");
        expect(window.location.pathname).toBe("/quotes/create");
    });

    it("Ctrl+B a kijelölt szöveget félkövérré teszi, ismételt nyomásra vissza (toggle, nem halmoz)", async () => {
        window.history.pushState({}, "", "/quotes/create");
        renderRoutes();
        // A mező textarea: a kijelölés-API (setSelectionRange, selectionStart)
        // csak azon létezik, a getBy* viszont HTMLElementet ad.
        const field = requireElement("#quoteField", HTMLTextAreaElement);

        await userEvent.type(field, "szép");
        field.setSelectionRange(0, 4);          // a teljes "szép" kijelölése
        await userEvent.keyboard("{Control>}b{/Control}");
        await waitFor(() => expect(field).toHaveValue("**szép**"));

        // A kijelölés a "szép"-en maradt (a ** kívül) — újabb Ctrl+B leveszi.
        await userEvent.keyboard("{Control>}b{/Control}");
        await waitFor(() => expect(field).toHaveValue("szép"));
    });

    /* A Tovább gomb a to-do mintájára addig TILTOTT, amíg a kötelező mező (az
       idézet szövege) üres — a szerző opcionális, az nem oldja fel. Az üres
       űrlapról tehát nem a Tovább visz ki (mint a to-dónál sem), hanem a logó
       vagy a Vissza gomb. */
    it("üres idézetnél a Tovább TILTOTT, a szerző beírása nem oldja fel", async () => {
        window.history.pushState({}, "", "/quotes/create");
        renderRoutes();
        await waitFor(() => expect(quoteField()).toBeInTheDocument());

        expect(screen.getByRole("button", {name: "Tovább"})).toBeDisabled();
        await userEvent.type(screen.getByPlaceholderText("Szerző"), "Én");
        expect(screen.getByRole("button", {name: "Tovább"})).toBeDisabled();
    });

    it("az idézet beírása FELOLDJA a Tovább gombot, kiürítése újra tiltja", async () => {
        window.history.pushState({}, "", "/quotes/create");
        renderRoutes();
        await waitFor(() => expect(quoteField()).toBeInTheDocument());

        await userEvent.type(quoteField(), "Új idézet");
        expect(screen.getByRole("button", {name: "Tovább"})).toBeEnabled();

        // Csak szóköz = üres (a trim dönt), tehát megint tiltott.
        await userEvent.clear(quoteField());
        await userEvent.type(quoteField(), "   ");
        expect(screen.getByRole("button", {name: "Tovább"})).toBeDisabled();
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
        // A mező textarea: a kijelölés-API (setSelectionRange, selectionStart)
        // csak azon létezik, a getBy* viszont HTMLElementet ad.
        const field = requireElement("#quoteField", HTMLTextAreaElement);
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
            const field = requireElement("#quoteField", HTMLTextAreaElement);
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
            fireEvent.change(requireElement("#quoteField", HTMLTextAreaElement), {target: {value: "Módosítva."}});
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

/* VERSENYHELYZET a betöltő effektben — a save.tsx `active` zászlójának őre, a to-do
   szerkesztőjének tesztjével azonos felállásban (Todos/save.test.tsx). A
   /quotes/update/:id route-on a szerkesztő NEM mountol újra, ha csak az :id
   változik (a route key="quote-update" mindkét címen ugyanaz), tehát az effekt fut
   le megint. A két betöltés válasza fordított sorrendben is visszaérhet, és a
   LEJÁRT kérés callbackje felülírhatná a friss mezőket ÉS a `loaded` pillanatképet
   is — az utóbbi a súlyosabb: a "változott-e?" ellenőrzés attól kezdve a MÁSIK
   idézethez hasonlítana. Néma hiba: semmi nem dob, a szerkesztő kitöltve áll, csak
   nem azzal, amit megnyitottunk.

   Amit ez a két teszt rögzít: a betöltés sikeres és hibás ága. A harmadik őrzött
   hívás (/quotes/last/order) szándékosan teszt nélkül marad: a két válasza
   ugyanabból a listahosszból jön, tehát az elcsúszásuk nem ad megfigyelhető
   különbséget — a rá írt teszt az Order-stepper újratesztelése volna. */
describe("QuoteSave — versenyhelyzet a betöltésben", () => {
    /* A /quotes/edit hívások callbackjeit összegyűjti ahelyett, hogy válaszolna; a
       többi végpont marad automatikus, különben a szerkesztő a betöltőn ragadna. */
    const capturePendingLoads = () => {
        /* A típus kimondja, mit tart a tömb: a kért azonosítót és azt a
           visszahívást, ami MAJD a szerkesztendő idézetet kapja. */
        const pending: {id: string; then: (response: AxiosResponse<typeof QUOTE>) => void}[] = [];
        handleAxios.mockImplementation((url, data, then) => {
            if (url === "/quotes/edit") pending.push({id: idOf(data), then});
            else if (url === "/quotes/last/order") then(axiosResponse(3));
            else if (url === "/quotes" || url === "/quotes/author" || url === "/quotes/authors")
                then(axiosResponse([]));
            else then(axiosResponse({}));
            return Promise.resolve();
        });
        return pending;
    };

    /* Két szerkesztő-cím egymás után az előzményben, majd a böngésző Vissza gombja
       (a data router popstate-re navigál): a q-2 kérése MÁR FUT, amikor a q-1 kérése
       elindul. A visszalépést nem akasztja meg a blocker, mert betöltetlen szerkesztő
       (loaded === null) nem "piszkos". */
    const openTwoEditorsAndGoBack = async () => {
        const pending = capturePendingLoads();
        window.history.pushState({}, "", "/quotes/update/q-1");
        window.history.pushState({}, "", "/quotes/update/q-2");
        renderRoutes();
        await waitFor(() => expect(pending).toHaveLength(1));

        window.history.back();
        await waitFor(() => expect(pending).toHaveLength(2));
        // A sorrend a teszt előfeltétele: előbb a lejárt q-2, utána a friss q-1.
        expect(pending.map((call) => call.id)).toEqual(["q-2", "q-1"]);
        return pending;
    };

    it("a lejárt :id KÉSVE érkező válasza nem írja felül a friss idézet mezőit", async () => {
        const pending = await openTwoEditorsAndGoBack();

        // Előbb a FRISS (q-1) válasza érkezik meg, és csak utána a lejárt q-2-é.
        act(() => pending[1].then(axiosResponse({...QUOTE, quote: "A friss idézet."})));
        /* A `_id` KIMARADT a lejárt válaszból: a /quotes/edit whitelistje nem is
           küldi (l. a fixtúra kommentjét) — eddig a fércmű-válaszban benne volt,
           holott a szerkesztő sosem kapja meg. */
        act(() => pending[0].then(axiosResponse({
            ...QUOTE, quote: "A lejárt idézet.", author: "Másvalaki",
        })));

        await waitFor(() => expect(quoteField()).toHaveValue("A friss idézet."));
        expect(screen.getByPlaceholderText("Szerző")).toHaveValue("Valaki");
    });

    it("a lejárt :id KÉSVE érkező HIBÁJA nem rángatja ki a szerkesztőből", async () => {
        const pending = await openTwoEditorsAndGoBack();
        // A hiba-ág a NEGYEDIK argumentum (a sikeres a harmadik).
        const staleCall = handleAxios.mock.calls
            .find((call) => call[0] === "/quotes/edit" && idOf(call[1]) === "q-2");
        if (!staleCall) throw new Error("nem indult lekérés a q-2-re");
        const staleError = staleCall[3];

        act(() => pending[1].then(axiosResponse({...QUOTE, quote: "A friss idézet."})));
        await waitFor(() => expect(quoteField()).toHaveValue("A friss idézet."));
        /* A lejárt kérés elszáll (idegen vagy közben törölt idézet: 403) — az ő
           hiba-ága a listára navigálna. Ez az az eset, amit a save.tsx komment a
           "leválás" alatt ír le: törlés után dupla, félrevezető navigáció lenne. */
        act(() => staleError({response: {status: 403}}));

        expect(window.location.pathname).toBe("/quotes/update/q-1");
        expect(quoteField()).toHaveValue("A friss idézet.");
    });
});
