import {act, fireEvent, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {renderRoutes} from "../../test/renderRoutes";
import {axiosResponse} from "../../test/axiosResponse";
import {requireElement} from "../../test/dom";
import type {AxiosResponse} from "axios";
import type {QuoteForEdit} from "../../types/api";
import {at} from "../../test/at";
import {flushPendingSaves} from "../../pendingSave";

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
        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));

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
        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));

        // A hiányzó idézet miatt nem megy ki create-kérés, és a szerkesztőben
        // maradunk. A gomb ilyenkor tiltott is (l. a fenti tesztet), de itt a
        // VÉGEREDMÉNYT állítjuk: szerzővel se lehessen idézet nélkül menteni.
        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/quotes/create");
        expect(window.location.pathname).toMatch(/^\/quotes\/create\/[0-9a-f]{24}$/);
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

    /* A Mentés gomb a to-do mintájára addig TILTOTT, amíg a kötelező mező (az
       idézet szövege) üres — a szerző opcionális, az nem oldja fel. Az üres
       űrlapról tehát nem a Mentés visz ki (mint a to-dónál sem), hanem a logó
       vagy a Vissza gomb. */
    it("üres idézetnél a Mentés TILTOTT, a szerző beírása nem oldja fel", async () => {
        window.history.pushState({}, "", "/quotes/create");
        renderRoutes();
        await waitFor(() => expect(quoteField()).toBeInTheDocument());

        expect(screen.getByRole("button", {name: "Mentés"})).toBeDisabled();
        await userEvent.type(screen.getByPlaceholderText("Szerző"), "Én");
        expect(screen.getByRole("button", {name: "Mentés"})).toBeDisabled();
    });

    it("az idézet beírása FELOLDJA a Mentés gombot, kiürítése újra tiltja", async () => {
        window.history.pushState({}, "", "/quotes/create");
        renderRoutes();
        await waitFor(() => expect(quoteField()).toBeInTheDocument());

        await userEvent.type(quoteField(), "Új idézet");
        expect(screen.getByRole("button", {name: "Mentés"})).toBeEnabled();

        // Csak szóköz = üres (a trim dönt), tehát megint tiltott.
        await userEvent.clear(quoteField());
        await userEvent.type(quoteField(), "   ");
        expect(screen.getByRole("button", {name: "Mentés"})).toBeDisabled();
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
        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));

        await waitFor(() => {
            const call = handleAxios.mock.calls.find((c) => c[0] === "/quotes/update");
            expect(call?.[1]).toMatchObject({id: "q-1"});
        });
    });

    it("változatlan tartalommal a Mentés NEM ment (nincs /quotes/update)", async () => {
        window.history.pushState({}, "", "/quotes/update/q-1");
        renderRoutes();
        await waitFor(() => expect(quoteField()).toHaveValue("Az élet szép."));

        handleAxios.mockClear();
        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));

        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/quotes/update");
    });
});

/* A BETÖLTÉS HIBAÁGA — a SZERVER VÁLASZA dönt, nem a hiba puszta ténye.

   A to-do szerkesztőjének AZONOS blokkja (Todos/save.test.tsx) a részletes
   indoklás helye; itt azért áll meg a saját párja, mert a két szerkesztő
   viselkedése nem csúszhat szét némán. A backend szabálya is azonos: a
   readForEdit.js 403-at ad a nem létező ÉS az idegen idézetre egyaránt, 500-at a
   saját hibájára — a hálózati hibának pedig egyáltalán nincs státusza.

   A tétel: a kinavigálás azt ÁLLÍTJA, hogy nincs mit szerkeszteni. Ezt csak a
   403-ból tudjuk; minden másra maradunk és újrapróbálást kínálunk. */
describe("QuoteSave — az idézet betöltése elbukik", () => {
    const failQuoteLoad = (error: unknown) =>
        handleAxios.mockImplementation((url, data, then, catchError) => {
            if (url === "/quotes/edit") catchError(error);
            else if (url === "/quotes/last/order") then(axiosResponse(3));
            else if (url === "/quotes" || url === "/quotes/author" || url === "/quotes/authors")
                then(axiosResponse([]));
            else then(axiosResponse({}));
            return Promise.resolve();
        });

    it("hálózati hibánál a szerkesztőben maradunk, újrapróbálási lehetőséggel", async () => {
        failQuoteLoad({message: "timeout of 15000ms exceeded"});
        window.history.pushState({}, "", "/quotes/update/q-1");

        renderRoutes();

        expect(await screen.findByText(/Hiba az oldal betöltése közben/)).toBeVisible();
        expect(screen.getByRole("button", {name: "Adatok ismételt lekérése"})).toBeVisible();
        // NEM navigáltunk el: a szerkesztő címén állunk.
        expect(window.location.pathname).toBe("/quotes/update/q-1");
        // A karika sem pörög tovább (ez volt a kinavigálás eredeti indoka).
        expect(document.querySelector(".spinner-border")).not.toBeInTheDocument();
    });

    it("500-nál is maradunk: a szerver akadt meg, nem az idézet tűnt el", async () => {
        failQuoteLoad({response: {status: 500}});
        window.history.pushState({}, "", "/quotes/update/q-1");

        renderRoutes();

        expect(await screen.findByText(/Hiba az oldal betöltése közben/)).toBeVisible();
        expect(window.location.pathname).toBe("/quotes/update/q-1");
    });

    it("403-nál a listára visz: az idézet tényleg nem érhető el", async () => {
        failQuoteLoad({response: {status: 403}});
        window.history.pushState({}, "", "/quotes/update/q-1");

        renderRoutes();

        await waitFor(() => expect(window.location.pathname).toBe("/quotes"));
        expect(screen.queryByText(/Hiba az oldal betöltése közben/)).not.toBeInTheDocument();
    });

    it("az ÚJRA gomb megismétli a lekérést, és megnyílik a szerkesztő", async () => {
        let shouldFail = true;
        handleAxios.mockImplementation((url, data, then, catchError) => {
            if (url === "/quotes/edit" && shouldFail) catchError(new Error("Network Error"));
            else if (url === "/quotes/edit") then(axiosResponse(QUOTE));
            else if (url === "/quotes/last/order") then(axiosResponse(3));
            else if (url === "/quotes" || url === "/quotes/author" || url === "/quotes/authors")
                then(axiosResponse([]));
            else then(axiosResponse({}));
            return Promise.resolve();
        });
        window.history.pushState({}, "", "/quotes/update/q-1");
        renderRoutes();
        expect(await screen.findByText(/Hiba az oldal betöltése közben/)).toBeVisible();

        shouldFail = false;
        await userEvent.click(screen.getByRole("button", {name: "Adatok ismételt lekérése"}));

        /* EGY waitFor, KÉT állítással: ÁTMENET van, és két külön pillanatban
           kérdezve a második elkaphatja a félidőt (l. Quotes/read.test.tsx). */
        await waitFor(() => {
            expect(quoteField()).toHaveValue("Az élet szép.");
            expect(screen.queryByText(/Hiba az oldal betöltése közben/)).not.toBeInTheDocument();
        });
    });
});

/* A szerkesztő ELHAGYÁSA (logóra kattintás, Vissza gomb, bármely navigáció) a
   szerkesztő leválását (unmount) jelenti — ilyenkor ugyanaz a mentés fusson le, mint
   a Mentés/Escape-nél, csak navigáció nélkül. A leválást a teszt az unmount()-tal
   modellezi. A legfontosabb a NEGATÍV eset: a Mentés utáni leválás ne mentsen újra
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

    it("Mentés után a leválás NEM ment újra (nincs dupla create)", async () => {
        window.history.pushState({}, "", "/quotes/create");
        const view = renderRoutes();
        await waitFor(() => expect(quoteField()).toBeInTheDocument());

        await userEvent.type(quoteField(), "Új idézet");
        handleAxios.mockClear();
        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));
        // A Mentés ment (create), majd a /quotes-ra navigál — a szerkesztő leválik.
        await waitFor(() => expect(handleAxios.mock.calls.some((c) => c[0] === "/quotes/create")).toBe(true));
        view.unmount();

        const creates = handleAxios.mock.calls.filter((c) => c[0] === "/quotes/create");
        expect(creates).toHaveLength(1);
    });
});

/* A VISSZA GOMB (böngésző POP) a useBlocker-en át pontosan úgy viselkedik, mint a
   Mentés/logó: van mentenivaló → ellenőriz; érvényesnél MENT, majd folytatja a
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
        await waitFor(() => expect(window.location.pathname).toMatch(/^\/quotes\/create\/[0-9a-f]{24}$/));
        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/quotes/create");
    });
});

/* A LOGÓRA (és minden szerkesztőn kívüli linkre) kattintás a Mentés-sel AZONOS
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
        expect(window.location.pathname).toMatch(/^\/quotes\/create\/[0-9a-f]{24}$/);
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
        act(() => at(pending, 1).then(axiosResponse({...QUOTE, quote: "A friss idézet."})));
        /* A `_id` KIMARADT a lejárt válaszból: a /quotes/edit whitelistje nem is
           küldi (l. a fixtúra kommentjét) — eddig a fércmű-válaszban benne volt,
           holott a szerkesztő sosem kapja meg. */
        act(() => at(pending, 0).then(axiosResponse({
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

        act(() => at(pending, 1).then(axiosResponse({...QUOTE, quote: "A friss idézet."})));
        await waitFor(() => expect(quoteField()).toHaveValue("A friss idézet."));
        /* A lejárt kérés elszáll (idegen vagy közben törölt idézet: 403) — az ő
           hiba-ága a listára navigálna. Ez az az eset, amit a save.tsx komment a
           "leválás" alatt ír le: törlés után dupla, félrevezető navigáció lenne. */
        act(() => staleError({response: {status: 403}}));

        expect(window.location.pathname).toBe("/quotes/update/q-1");
        expect(quoteField()).toHaveValue("A friss idézet.");
    });
});

/* A PISZKOZAT — a néma adatvesztés ellen (2026-08-18).

   A leváláskori mentés (kijelentkezés) a legkockázatosabb út: a képernyő épp
   megszűnik, tehát ha a kérés elbukik, NINCS kinek szólni, és a beírt szöveg
   nyomtalanul elvész. Ezért a hibaágon helyi másolat készül (drafts.ts), amit a
   szerkesztő legközelebbi megnyitásakor felajánlunk.

   A tesztek a VALÓDI localStorage-ot használják (a jsdom ad ilyet), és minden
   eset után ürítik — a piszkozat modul-szintű állapotot nem tart, a tároló
   viszont igen. */
describe("QuoteSave — piszkozat sikertelen mentés után", () => {
    const DRAFT_KEY = "notes-draft:quotes:q-1";
    const failSave = () => handleAxios.mockImplementation((url, data, then, catchError) => {
        if (url === "/quotes/update" || url === "/quotes/create") catchError(new Error("Network Error"));
        else if (url === "/quotes/edit") then(axiosResponse(QUOTE));
        else if (url === "/quotes/last/order") then(axiosResponse(3));
        else then(axiosResponse({}));
        return Promise.resolve();
    });

    afterEach(() => localStorage.clear());

    it("a leváláskori mentés bukása után a szöveg PISZKOZATKÉNT megmarad", async () => {
        window.history.pushState({}, "", "/quotes/update/q-1");
        const view = renderRoutes();
        await waitFor(() => expect(quoteField()).toHaveValue("Az élet szép."));
        await userEvent.type(quoteField(), " Tényleg.");

        failSave();
        /* A PISZKOZAT CSAK A HÁROM PRÓBA UTÁN születik meg (saveRetry.ts: 1 s,
           majd 3 s várakozás). Az órát ezért előretekerjük — valódi várakozás
           négy másodpercig lassú lenne, és a gép terhelésétől függene. */
        vi.useFakeTimers();
        view.unmount();
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        vi.useRealTimers();

        const stored = localStorage.getItem(DRAFT_KEY);
        expect(stored).not.toBeNull();
        expect(stored).toContain("Az élet szép. Tényleg.");
    });

    it("a piszkozat a BASE-t is megőrzi (enélkül nem lehetne ütközést vizsgálni)", async () => {
        window.history.pushState({}, "", "/quotes/update/q-1");
        const view = renderRoutes();
        await waitFor(() => expect(quoteField()).toHaveValue("Az élet szép."));
        await userEvent.type(quoteField(), " Tényleg.");

        failSave();
        vi.useFakeTimers();
        view.unmount();
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        vi.useRealTimers();

        const stored = localStorage.getItem(DRAFT_KEY);
        expect(stored).not.toBeNull();
        /* A `base` a BETÖLTÉSKORI szerver-állapot — ehhez képest dől el a
           legközelebbi megnyitáskor, hogy a piszkozat magától visszaállhat-e. */
        const envelope: unknown = JSON.parse(stored ?? "null");
        expect(envelope).toMatchObject({base: {quote: "Az élet szép."}});
    });

    it("RÉGI formátumú (base nélküli) piszkozatot ELDOB: kétségnél a szerver nyer", async () => {
        /* A `base` nélkül nem tudjuk ellenőrizni, változott-e a szerveren valami a
           piszkozat óta. A szabály ilyenkor is ugyanaz, mint ütközésnél: a
           szerveren lévő (biztosan mentett) változat marad. */
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
            savedAt: Date.now(),
            payload: {quote: "Régi formátumú piszkozat", author: "Valaki", order: 1, fontSize: 155},
        }));
        window.history.pushState({}, "", "/quotes/update/q-1");

        renderRoutes();

        await waitFor(() => expect(quoteField()).toHaveValue("Az élet szép."));
        expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });

    it("SIKERES mentés TÖRLI a korábbi piszkozatot", async () => {
        /* A kiinduló helyzet: egy korábbi bukás piszkozatot hagyott. A felhasználó
           most újranyitja, dolgozik, és a mentés SIKERÜL — innentől a szerveren van
           a friss tartalom. Ha a régi piszkozat bent maradna, a következő
           megnyitáskor egy ELAVULT szöveget ajánlanánk fel, ami felülírná a
           frissebb, mentett változatot. */
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
            savedAt: Date.now(),
            payload: {quote: "Régi, elavult piszkozat", author: "", order: 1, fontSize: 155},
        }));
        window.history.pushState({}, "", "/quotes/update/q-1");
        const view = renderRoutes();
        await waitFor(() => expect(quoteField()).toHaveValue("Az élet szép."));
        /* A felajánlást SZÁNDÉKOSAN nem érintjük: a felhasználó rá se néz, csak
           dolgozik tovább. A piszkozatot így a SIKERES MENTÉS kell hogy eltakarítsa. */
        await userEvent.type(quoteField(), " Tényleg.");

        // Az alapértelmezett mock SIKERREL válaszol a mentésre.
        view.unmount();

        expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });

    it("nincs piszkozat → a szerver adata marad (kontroll)", async () => {
        window.history.pushState({}, "", "/quotes/update/q-1");

        renderRoutes();

        await waitFor(() => expect(quoteField()).toHaveValue("Az élet szép."));
        expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });
});

/* AZ ÚJRAPRÓBÁLÁS A PISZKOZAT ELŐTT (2026-08-19).

   A háttérben futó mentés bukása nagyrészt MÚLÓ ok miatt történik. Ilyenkor a
   helyes válasz még egy próba — a piszkozat csak akkor kerüljön elő, ha tényleg
   nincs kapcsolat. E nélkül a felhasználó minden wifi-zökkenő után egy felajánlott
   piszkozattal találkozna, ami zaj, nem segítség. */
describe("QuoteSave — a leváláskori mentés újrapróbál", () => {
    const DRAFT_KEY = "notes-draft:quotes:q-1";

    afterEach(() => localStorage.clear());

    it("az ELSŐ próba bukik, a MÁSODIK sikerül: nincs piszkozat", async () => {
        window.history.pushState({}, "", "/quotes/update/q-1");
        const view = renderRoutes();
        await waitFor(() => expect(quoteField()).toHaveValue("Az élet szép."));
        await userEvent.type(quoteField(), " Tényleg.");

        let saveCalls = 0;
        handleAxios.mockImplementation((url, data, then, catchError) => {
            if (url === "/quotes/update") {
                saveCalls += 1;
                if (saveCalls === 1) catchError(new Error("Network Error"));
                else then(axiosResponse({}));
            } else then(axiosResponse({}));
            return Promise.resolve();
        });

        vi.useFakeTimers();
        view.unmount();
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        vi.useRealTimers();

        expect(saveCalls).toBe(2);
        expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });
});

/* A KIJELENTKEZÉS MEGVÁRJA A MENTÉST (2026-08-19).

   Eddig a kijelentkezés azonnal törölte a tokent, a szerkesztő azonnal levált, és
   a mentése a háttérben, a leválás pillanatában indult el. Most ugyanaz a szabály
   érvényes rá, mint a navigációra: előbb a mentés, aztán a kilépés — így a kérés
   még a teljes jogú munkamenetben fut le, és a piszkozatra ritkábban van szükség. */
describe("QuoteSave — kijelentkezéskor előbb ment", () => {
    afterEach(() => localStorage.clear());

    it("a kijelentkezés BEVÁRJA a mentést (a token törlése előtt fut le)", async () => {
        window.history.pushState({}, "", "/quotes/update/q-1");
        renderRoutes();
        await waitFor(() => expect(quoteField()).toHaveValue("Az élet szép."));
        await userEvent.type(quoteField(), " Tényleg.");

        const order: string[] = [];
        handleAxios.mockImplementation((url, data, then) => {
            if (url === "/quotes/update") order.push("mentés");
            then(axiosResponse({}));
            return Promise.resolve();
        });

        /* A kijelentkezés a Providerből jön (a próbafa valódi AuthProvidert
           használ): a flush a mentést a süti törlése ELŐTT futtatja le. */
        await act(async () => { await flushPendingSaves(); order.push("kilépés"); });

        expect(order).toEqual(["mentés", "kilépés"]);
    });
});

/* A PISZKOZAT MAGÁTÓL VISSZAÁLL — ha nincs mivel ütköznie (2026-08-19).

   A user kérése: ne kelljen a felhasználónak döntenie, ha nincs miről. A
   feltétel: a szerveren azóta SEMMI nem változott, hogy a piszkozat készült — ezt
   a piszkozatban őrzött `base` (a betöltéskori szerver-állapot) és a most
   betöltött állapot összevetése dönti el.

   Ha viszont eltér (másik eszközön módosították), marad a felajánlás: ott
   emberi döntés kell, mert két érvényes változat van. */
describe("QuoteSave — a piszkozat magától visszaáll", () => {
    const DRAFT_KEY = "notes-draft:quotes:q-1";
    const SERVER = {quote: "Az élet szép.", author: "Valaki", order: 1, fontSize: 155};

    afterEach(() => localStorage.clear());

    it("VÁLTOZATLAN szerver mellett magától visszatölt, felajánlás NÉLKÜL", async () => {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
            savedAt: Date.now(),
            payload: {...SERVER, quote: "A mentetlen szövegem"},
            base: SERVER,
        }));
        window.history.pushState({}, "", "/quotes/update/q-1");

        renderRoutes();

        await waitFor(() => expect(quoteField()).toHaveValue("A mentetlen szövegem"));
        expect(screen.queryByText(/Mentetlen piszkozat maradt/)).not.toBeInTheDocument();
        // A visszaállítás után a bejegyzés okafogyott: a szöveg a szerkesztőben él.
        expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });

    it("ha a szerver MÁR A PISZKOZAT tartalmát mutatja, nincs mit visszaállítani", async () => {
        /* A mentés valójában átment, csak a válasz veszett el — ezért hittük
           bukásnak, és ezért készült piszkozat. A szerveren már a mi szövegünk
           van: a visszaállítás ugyanazt írná be, a piszkozat pedig okafogyott. */
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
            savedAt: Date.now(),
            payload: {...SERVER, quote: "Az élet szép."},
            base: {...SERVER, quote: "Egy RÉGEBBI szöveg"},
        }));
        window.history.pushState({}, "", "/quotes/update/q-1");

        renderRoutes();

        await waitFor(() => expect(quoteField()).toHaveValue("Az élet szép."));
        expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });

    it("ha a szerveren KÖZBEN változott valami, a SZERVER nyer, a piszkozat elvész", async () => {
        /* A `base` egy RÉGEBBI szerver-állapotot őriz, mint amit most kaptunk —
           tehát más eszközön MENTETTEK azóta. A user döntése: a tudatosan
           elvégzett, mentett módosítás többet ér, mint egy el nem mentett szöveg.
           Kérdés sincs, és a piszkozat sem marad ott kísérteni. */
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
            savedAt: Date.now(),
            payload: {...SERVER, quote: "A mentetlen szövegem"},
            base: {...SERVER, quote: "Egy RÉGEBBI szöveg"},
        }));
        window.history.pushState({}, "", "/quotes/update/q-1");

        renderRoutes();

        await waitFor(() => expect(quoteField()).toHaveValue("Az élet szép."));
        expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });
});

/* A LAP BEZÁRÁSA — itt a mentésre már nincs idő (2026-08-19).

   A böngésző a lap eltűnésekor eldobja a függő kéréseket: az újrapróbálás
   második-harmadik köre biztosan nem fut le. Ezért a `beforeunload` nem mentést
   indít, hanem AZONNAL kiírja a piszkozatot — az localStorage-írás, tehát
   szinkron, még a bezárás előtt megtörténik. */
describe("QuoteSave — a lap bezárása", () => {
    const DRAFT_KEY = "notes-draft:quotes:q-1";

    afterEach(() => localStorage.clear());

    it("beforeunload-ra AZONNAL piszkozatot ír (nem vár mentésre)", async () => {
        window.history.pushState({}, "", "/quotes/update/q-1");
        renderRoutes();
        await waitFor(() => expect(quoteField()).toHaveValue("Az élet szép."));
        await userEvent.type(quoteField(), " Tényleg.");
        handleAxios.mockClear();

        act(() => { window.dispatchEvent(new Event("beforeunload")); });

        expect(localStorage.getItem(DRAFT_KEY)).toContain("Az élet szép. Tényleg.");
        // És NEM indított kérést: arra már úgysem lenne idő.
        expect(handleAxios.mock.calls.map((call) => call[0])).not.toContain("/quotes/update");
    });

    it("ÉRINTETLEN szerkesztőnél nem ír piszkozatot (kontroll)", async () => {
        window.history.pushState({}, "", "/quotes/update/q-1");
        renderRoutes();
        await waitFor(() => expect(quoteField()).toHaveValue("Az élet szép."));

        act(() => { window.dispatchEvent(new Event("beforeunload")); });

        expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });
});

/* MENTÉS KÖZBEN A SZERKESZTŐ NEM HAGYHATÓ EL — az idézet-szerkesztő oldala.

   A mechanizmus és az indoklás a to-do szerkesztőjével AZONOS (l.
   Todos/save.test.tsx ugyanezt a blokkot): a `savingRef` tart bent, amíg a kérés
   úton van, a bukás visszaállítja a feliratot és piszkozatot ír, és a
   navigációval indított mentés bukása után a Mentés gombra kerül a fókusz.
   Azért van külön teszt, mert a két szerkesztő KÜLÖN kódot futtat: egy javítás,
   ami csak az egyikbe megy át, itt bukna el. */
describe("QuoteSave — mentés közben nem lehet elhagyni a szerkesztőt", () => {
    const pendingSave = () => {
        const pending: Array<{ok: () => void; fail: () => void}> = [];
        handleAxios.mockImplementation((url, data, then, catchError) => {
            if (url === "/quotes/edit") then(axiosResponse(QUOTE));
            else if (url === "/quotes/last/order") then(axiosResponse(3));
            else if (url === "/quotes" || url === "/quotes/author" || url === "/quotes/authors")
                then(axiosResponse([]));
            else if (url === "/quotes/update") pending.push({
                ok: () => then(axiosResponse({})),
                fail: () => catchError({message: "timeout of 15000ms exceeded"}),
            });
            else then(axiosResponse({}));
            return Promise.resolve();
        });
        return pending;
    };

    const openAndEdit = async () => {
        window.history.pushState({}, "", "/quotes/update/q-1");
        const view = renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Idézet szövege")).toHaveValue(QUOTE.quote));
        await userEvent.type(screen.getByPlaceholderText("Idézet szövege"), " Nagyon.");
        return view;
    };

    afterEach(() => localStorage.clear());

    it("a LOGÓ nem visz ki a futó mentés alól (a szöveg nem veszhet el)", async () => {
        const pending = pendingSave();
        await openAndEdit();

        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));
        await waitFor(() => expect(pending).toHaveLength(1));

        await userEvent.click(requireElement("a", HTMLAnchorElement));

        await waitFor(() => {
            expect(window.location.pathname).toBe("/quotes/update/q-1");
            expect(screen.getByPlaceholderText("Idézet szövege")).toHaveValue(QUOTE.quote + " Nagyon.");
        });
    });

    it("visszaírt eredeti szöveg mellett SEM enged ki a futó mentés alól", async () => {
        /* EZ A TESZT MÉRI A `savingRef`-ET (a fenti logós nem): amíg az űrlap eltér
           a szerverétől, a shouldBlock a dirty jelző miatt amúgy is blokkolna. Itt a
           felhasználó a mentés MEGINDÍTÁSA UTÁN visszaírja az eredeti szöveget,
           tehát az űrlap újra érintetlennek látszik — pedig a kérés úton van.
           A to-do oldalán a mutáció-próba pontosan ezt a rést mutatta meg. */
        const pending = pendingSave();
        await openAndEdit();

        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));
        await waitFor(() => expect(pending).toHaveLength(1));

        await userEvent.clear(screen.getByPlaceholderText("Idézet szövege"));
        await userEvent.type(screen.getByPlaceholderText("Idézet szövege"), QUOTE.quote);
        await userEvent.click(requireElement("a", HTMLAnchorElement));

        await waitFor(() => {
            expect(window.location.pathname).toBe("/quotes/update/q-1");
            expect(screen.getByPlaceholderText("Idézet szövege")).toHaveValue(QUOTE.quote);
        });
    });

    it("a MENTÉS gomb tiltott és 'Mentés…' feliratú, amíg a válasz meg nem jön", async () => {
        const pending = pendingSave();
        await openAndEdit();

        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));

        await waitFor(() => expect(screen.getByRole("button", {name: "Mentés…"})).toBeDisabled());
        expect(screen.getByRole("button", {name: "Törlés"})).toBeDisabled();

        await act(async () => { at(pending, 0).ok(); });
        await waitFor(() => expect(window.location.pathname).toBe("/quotes"));
    });

    it("a bukás PISZKOZATOT ír és visszaállítja a feliratot", async () => {
        const pending = pendingSave();
        await openAndEdit();

        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));
        await waitFor(() => expect(pending).toHaveLength(1));
        act(() => at(pending, 0).fail());

        await waitFor(() => expect(screen.getByRole("button", {name: "Mentés"})).toBeEnabled());
        expect(window.location.pathname).toBe("/quotes/update/q-1");

        const draft: unknown = JSON.parse(localStorage.getItem("notes-draft:quotes:q-1") ?? "null");
        expect(draft).toMatchObject({payload: {quote: QUOTE.quote + " Nagyon."}});
    });

    it("a LOGÓval indított mentés bukása után a Mentés gombra kerül a fókusz", async () => {
        const pending = pendingSave();
        await openAndEdit();

        await userEvent.click(requireElement("a", HTMLAnchorElement));
        await waitFor(() => expect(pending).toHaveLength(1));
        act(() => at(pending, 0).fail());

        await waitFor(() => expect(screen.getByRole("button", {name: "Mentés"})).toHaveFocus());
    });

    it("futó mentés MELLÉ a leválás nem indít másodikat (nincs dupla mentés)", async () => {
        const pending = pendingSave();
        const view = await openAndEdit();

        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));
        await waitFor(() => expect(pending).toHaveLength(1));
        handleAxios.mockClear();
        view.unmount();

        expect(handleAxios.mock.calls.map((c) => c[0])).not.toContain("/quotes/update");
    });
});

/* A VISSZATÖLTÖTT PISZKOZATOT MENTENI IS LEHET — l. a Todos/save.test.tsx azonos
   blokkját az indoklásért. Create-nél nincs szerver-betöltés, ami az idézet
   érvényesség-jelzőjét igazra állítaná, a piszkozat pedig programból tölti ki a
   mezőt: a jelző nélkül a Mentés a kitöltött mező fölé írt hibabuborékot. */
describe("QuoteSave — a visszatöltött create-piszkozat menthető", () => {
    afterEach(() => localStorage.clear());

    it("érintetlen visszatöltés után a Mentés MENT, nem hibabuborékot ad", async () => {
        localStorage.setItem("notes-draft:quotes:create", JSON.stringify({
            savedAt: Date.now(),
            payload: {quote: "Kész idézet", author: "Valaki", order: 1, fontSize: 155},
        }));
        window.history.pushState({}, "", "/quotes/create");
        renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Idézet szövege")).toHaveValue("Kész idézet"));
        handleAxios.mockClear();

        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));

        await waitFor(() => expect(handleAxios.mock.calls.map((c) => c[0])).toContain("/quotes/create"));
        expect(screen.queryByText(/kitöltése kötelező/)).not.toBeInTheDocument();
    });
});
