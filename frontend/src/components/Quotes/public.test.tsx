import {act, screen, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {renderRoutes} from "../../test/renderRoutes";
import {axiosResponse} from "../../test/axiosResponse";
import type {AxiosResponse} from "axios";
import type {Quote} from "../../types/api";
import {at} from "../../test/at";


/* A fixtúra a Quote alakjában (a `satisfies` a szerződéshez méri). A `user` és az
   időbélyegek NINCSENEK benne: a hálózati válasz whitelistje (backend
   models/quotes.js toJSON) nem adja ki őket. A publikus /quotes/id ennél is
   szűkebbet küld (csak quote/author/fontSize, l. readById.js), de a fixtúra a
   teljesebb Quote-alakot használja — a publikus nézet úgyis csak a maga mezőit
   olvassa. */
const QUOTE = {
    _id: "q-1", quote: "Megosztott idézet.", author: "Márai", order: 1, fontSize: 155,
} satisfies Quote;

const {auth, handleAxios} = await vi.hoisted(async () => {
    const {mockAuth} = await import("../../test/mockAuth");
    return mockAuth({isLoggedIn: true});
});
vi.mock(import("../../contexts/auth-context"), () => ({useAuth: () => auth}));

/* A lekérés törzséből az azonosítót VALÓDI vizsgálattal olvassuk ki (a kém felől
   `unknown`); egy `as` csak állítaná, hogy ott a mező. */
const idOf = (data: unknown): string => {
    if (typeof data === "object" && data !== null && "id" in data && typeof data.id === "string") return data.id;
    throw new Error(`a lekérés törzsében nincs id: ${JSON.stringify(data)}`);
};

beforeEach(() => {
    handleAxios.mockReset();
});

describe("QuotePublic (megosztott idézet)", () => {
    it("betölti és megjeleníti a megosztott idézetet a szerzővel", async () => {
        handleAxios.mockImplementation((url, data, then) => {
            if (url === "/quotes/id") then(axiosResponse(QUOTE));
            return Promise.resolve();
        });
        renderRoutes("/quotes/M%C3%A1rai/q-1");

        expect(await screen.findByText("Megosztott idézet.")).toBeVisible();
        expect(screen.getByText("Márai")).toBeVisible();
    });

    it("a **…** markert félkövérként rendereli, a marker maga nem látszik", async () => {
        handleAxios.mockImplementation((url, data, then) => {
            if (url === "/quotes/id") then(axiosResponse({...QUOTE, quote: "Sima **félkövér** rész."}));
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

/* VERSENYHELYZET a betöltő effektben — a public.tsx `active` zászlójának őre.
   A /quotes/:author/:id route-on a komponens NEM mountol újra, ha csak az :id
   változik: az effekt fut le megint. A két kérés válasza fordított sorrendben is
   visszaérhet, és a LEJÁRT kérés callbackje felülírhatná a frisset. Ez néma hiba:
   semmi nem dob, a betöltő eltűnik, csak épp a MÁSIK idézet szövege áll a lapon.

   A teszt a legkisebb, ami a kötést rögzíti: a válaszokat nem a mock süti el,
   hanem mi, kézzel, szándékosan rossz sorrendben. */
describe("QuotePublic — versenyhelyzet a betöltésben", () => {
    it("a lejárt :id KÉSVE érkező válasza nem írja felül a frisset", async () => {
        // A /quotes/id hívások callbackjeit összegyűjtjük ahelyett, hogy azonnal
        // válaszolnánk; a többi hívás (navbar stb.) érdektelen.
        /* A típus kimondja, mit tart a tömb: a kért azonosítót és azt a
           visszahívást, ami MAJD a megosztott idézetet kapja. */
        const pending: {id: string; then: (response: AxiosResponse<Quote>) => void}[] = [];
        handleAxios.mockImplementation((url, data, then) => {
            if (url === "/quotes/id") pending.push({id: idOf(data), then});
            return Promise.resolve();
        });

        /* Két megosztott idézet egymás után az előzményben, majd a böngésző Vissza
           gombja (window.history.back — a data router popstate-re navigál). Így a
           q-2 kérése MÁR FUT, amikor a q-1 kérése elindul. */
        window.history.pushState({}, "", "/quotes/M%C3%A1rai/q-1");
        renderRoutes("/quotes/M%C3%A1rai/q-2");
        await waitFor(() => expect(pending).toHaveLength(1));

        window.history.back();
        await waitFor(() => expect(pending).toHaveLength(2));
        // A sorrend a teszt előfeltétele: előbb a lejárt q-2, utána a friss q-1.
        expect(pending.map((call) => call.id)).toEqual(["q-2", "q-1"]);

        // Előbb a FRISS (q-1) válasza érkezik meg, és csak utána a lejárt q-2-é.
        act(() => at(pending, 1).then(axiosResponse({...QUOTE, _id: "q-1", quote: "A friss idézet."})));
        act(() => at(pending, 0).then(axiosResponse({...QUOTE, _id: "q-2", quote: "A lejárt idézet."})));

        expect(await screen.findByText("A friss idézet.")).toBeVisible();
        expect(screen.queryByText("A lejárt idézet.")).not.toBeInTheDocument();
    });
});

/* NEM LÉTEZŐ kontra NEM ELÉRHETŐ — az átvizsgálás találata (2026-08-18).

   A megosztott link egy konkrét idézetre mutat. Ha a szerver azt mondja, hogy
   nincs ilyen (400/404), azt ki KELL mondani. Ha viszont a kérés el sem jutott
   odáig (időtúllépés, megszakadt hálózat, elcsúszott szerződés), akkor a
   látogató nem tudhatja meg, hogy az idézet létezik-e — és mi sem állíthatjuk,
   hogy nem. Eddig mindkettő "Nem létező idézet." volt: egy pillanatnyi hálózati
   zökkenő így úgy nézett ki, mintha az idézetet törölték volna. */
describe("QuotePublic — a hiba FAJTÁJA", () => {
    it("a szerver 404-ére kimondja, hogy nem létező idézet", async () => {
        handleAxios.mockImplementation((url, data, then, catchError) => {
            if (url === "/quotes/id") catchError({response: {status: 404, data: "Nincs ilyen idézet."}});
            return Promise.resolve();
        });

        renderRoutes("/quotes/M%C3%A1rai/q-1");

        expect(await screen.findByText("Nem létező idézet.")).toBeVisible();
    });

    it("HÁLÓZATI hibánál NEM állítja, hogy nem létezik", async () => {
        handleAxios.mockImplementation((url, data, then, catchError) => {
            if (url === "/quotes/id") catchError(new Error("Network Error"));
            return Promise.resolve();
        });

        renderRoutes("/quotes/M%C3%A1rai/q-1");

        expect(await screen.findByText(/Hiba az oldal betöltése közben/)).toBeVisible();
        expect(screen.queryByText("Nem létező idézet.")).not.toBeInTheDocument();
    });

    it("a szerver 400-ára is: a rossz ALAKÚ azonosítóhoz nem tartozhat idézet", async () => {
        handleAxios.mockImplementation((url, data, then, catchError) => {
            if (url === "/quotes/id") catchError({response: {status: 400}});
            return Promise.resolve();
        });

        renderRoutes("/quotes/M%C3%A1rai/nem-objectid");

        expect(await screen.findByText("Nem létező idézet.")).toBeVisible();
    });

    /* AZ 500 NEM HIÁNY. A backend a váratlan hibáit is elküldi (serverError.js:
       egy adatbázis-zökkenő is 500), és ez a vizsgálat korábban `=== undefined`
       volt — vagyis MINDEN státuszos választ a "nem létezik" ágra küldött. Egy
       megosztott link megnyitója így azt hihette, hogy az idézetet törölték,
       pedig csak a szerver akadt meg egy pillanatra. */
    it("az 500 NEM jelenti azt, hogy nincs ilyen idézet", async () => {
        handleAxios.mockImplementation((url, data, then, catchError) => {
            if (url === "/quotes/id") catchError({response: {status: 500, data: "Sikertelen művelet."}});
            return Promise.resolve();
        });

        renderRoutes("/quotes/M%C3%A1rai/q-1");

        expect(await screen.findByText(/Hiba az oldal betöltése közben/)).toBeVisible();
        expect(screen.queryByText("Nem létező idézet.")).not.toBeInTheDocument();
    });

    it("elcsúszott SZERZŐDÉSNÉL sem állítja (a séma bukása sem jelent hiányt)", async () => {
        handleAxios.mockImplementation((url, data, then) => {
            if (url === "/quotes/id") then(axiosResponse({nem: "idézet"}));
            return Promise.resolve();
        });

        renderRoutes("/quotes/M%C3%A1rai/q-1");

        expect(await screen.findByText(/Hiba az oldal betöltése közben/)).toBeVisible();
    });
});
