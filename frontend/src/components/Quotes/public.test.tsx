import {act, screen, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {renderRoutes} from "../../test/renderRoutes";
import {axiosResponse} from "../../test/axiosResponse";
import type {AxiosResponse} from "axios";
import type {Quote} from "../../types/api";


/* A fixtúra a szerver VALÓDI válaszának alakjában: a tulajdonos, a betűméret és
   az időbélyegek is benne vannak, még ha ez a teszt nem is vizsgálja őket. A
   `satisfies` a szerződéshez méri — egy hiányzó mező innentől fordítási hiba. */
const QUOTE = {
    _id: "q-1", user: "u-1", quote: "Megosztott idézet.", author: "Márai", order: 1, fontSize: 155,
    createdAt: "2026-01-01T10:00:00.000Z", updatedAt: "2026-01-01T10:00:00.000Z",
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
        act(() => pending[1].then(axiosResponse({...QUOTE, _id: "q-1", quote: "A friss idézet."})));
        act(() => pending[0].then(axiosResponse({...QUOTE, _id: "q-2", quote: "A lejárt idézet."})));

        expect(await screen.findByText("A friss idézet.")).toBeVisible();
        expect(screen.queryByText("A lejárt idézet.")).not.toBeInTheDocument();
    });
});
