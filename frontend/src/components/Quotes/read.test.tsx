import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {renderRoutes} from "../../test/renderRoutes";
import {axiosResponse} from "../../test/axiosResponse";
import type {Quote} from "../../types/api";

/* A lista-válasz a VÉGPONTOK KÖZÖTTI TITKOSÍTÁS (E2EE) után a HÁLÓZATRA SZÁNT mezőket
   adja (whitelist a backend models/quotes.js toJSON-jában): `_id`, `order` és a
   titkosított boríték (`ciphertext`) — a `user` és az időbélyegek NEM jönnek. A
   tartalmat (szöveg/szerző/betűméret) a KÁRTYA fejti vissza a mesterkulccsal; itt a
   quoteContent modult MOCKOLJUK, hogy a boríték egyszerű JSON legyen, így a lista-
   tesztet nem terheli a valódi kriptó. (A valódi titkosítás kör-mérése az
   e2ee/content.test.ts-ben és a quoteContent egységtesztjében van.)

   A `satisfies Quote[]` méri, hogy a fixtúra pontosan azt tartalmazza, amit a szerver küld. */
const envelope = (content: {quote: string; author?: string; fontSize: number}): string =>
    JSON.stringify({...content, createdAt: "2026-01-01T00:00:00.000Z"});

const QUOTES = [
    {_id: "a", ciphertext: envelope({quote: "Első idézet", author: "Márai", fontSize: 155}), order: 1},
    {_id: "b", ciphertext: envelope({quote: "Második idézet", author: "", fontSize: 155}), order: 2},
] satisfies Quote[];

/* A mockolt visszafejtés: a boríték a tartalom JSON-ja, a decryptQuote visszaparse-olja.
   Hibás (nem-JSON) borítéknál DOB — pont mint a valódi (megbuherált blob), így a
   kártya hibakártya-ága is mérhető. */
vi.mock(import("./quoteContent"), () => ({
    decryptQuote: (_id: string, ciphertext: string) => JSON.parse(ciphertext),
    encryptQuote: (_id: string, content: unknown) => JSON.stringify(content),
}));

const {auth, handleAxios} = await vi.hoisted(async () => {
    const {mockAuth} = await import("../../test/mockAuth");
    return mockAuth({isLoggedIn: true});
});
vi.mock(import("../../contexts/auth-context"), () => ({useAuth: () => auth}));

beforeEach(() => {
    handleAxios.mockReset();
    handleAxios.mockImplementation((url, data, then) => {
        if (url === "/quotes") then(axiosResponse(QUOTES));
        else then(axiosResponse({}));
        return Promise.resolve();
    });
});

afterEach(() => {
    // A világos-téma sütit töröljük, hogy a többi teszt az alap (sötét) témával induljon.
    document.cookie = "backgroundColor=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("QuoteRead", () => {
    it("kilistázza az idézeteket a (visszafejtett) szövegükkel", async () => {
        renderRoutes("/quotes");
        expect(await screen.findByText("Első idézet")).toBeVisible();
        expect(screen.getByText("Második idézet")).toBeVisible();
    });

    it("egy NEM visszafejthető elem hibakártyát kap, a többi épen marad", async () => {
        /* A szerver ELLENSÉGES: egy megbuherált/olvashatatlan boríték nem viheti
           magával az egész listát (l. E2EE.md 10., card.tsx per-elem catch). */
        handleAxios.mockImplementation((url, data, then) => {
            if (url === "/quotes") then(axiosResponse([
                {_id: "a", ciphertext: envelope({quote: "Ép idézet", fontSize: 155}), order: 1},
                {_id: "b", ciphertext: "nem-json-boríték", order: 2},
            ]));
            else then(axiosResponse({}));
            return Promise.resolve();
        });
        renderRoutes("/quotes");
        expect(await screen.findByText("Ép idézet")).toBeVisible();
        expect(screen.getByText("Ez az idézet nem fejthető vissza.")).toBeVisible();
    });

    it("a teljes listában az akcentus a TÉMÁÉ marad (nem a hiba-piros)", async () => {
        renderRoutes("/quotes");
        await screen.findByText("Első idézet");
        expect(document.documentElement.style.getPropertyValue("--theme-accent")).not.toBe("#db1937");
    });

    it("a quotes-lista VILÁGOS témán a szekció tinta-kékjét kapja (#284ec0, nem a globális #0b5ed7)", async () => {
        // Világos témával indítunk (a ThemeProvider a backgroundColor sütiből olvassa).
        document.cookie = "backgroundColor=white; path=/";
        renderRoutes("/quotes");
        await screen.findByText("Első idézet");
        // A szekció-override (useQuoteAccent) egy effektben áll be — waitForrel várjuk ki.
        await waitFor(() =>
            expect(document.documentElement.style.getPropertyValue("--theme-accent")).toBe("#284ec0"));
    });
});

/* A SIKERTELEN BETÖLTÉS — és hogy miért nem üres lista.

   Amíg a hibaág üres tömböt tett a listába, a főlista azt állította, hogy nincs
   egyetlen idézet sem — miközben az adat nem üres volt, hanem meg sem érkezett. A
   hiba OKA nem számít a felhasználónak (hálózat, időtúllépés vagy elcsúszott
   szerződés) — ezért mindkét fajtára ugyanazt a viselkedést várjuk el. */
describe("QuoteRead — sikertelen betöltés", () => {
    const MESSAGE = /Hiba az oldal betöltése közben/;

    it("hálózati hibánál kiírja, hogy nem érhető el a lista (nem üres nézetet mutat)", async () => {
        handleAxios.mockImplementation((url, data, then, catchError) => {
            catchError(new Error("Network Error"));
            return Promise.resolve();
        });

        renderRoutes("/quotes");

        expect(await screen.findByText(MESSAGE)).toBeVisible();
    });

    it("elcsúszott SZERZŐDÉSNÉL ugyanígy viselkedik (a séma bukása is betöltési hiba)", async () => {
        // A válasz nem idézet-tömb: a séma elutasítja, a hiba a hibaágra kerül.
        handleAxios.mockImplementation((url, data, then) => {
            then(axiosResponse({nem: "idézet"}));
            return Promise.resolve();
        });

        renderRoutes("/quotes");

        expect(await screen.findByText(MESSAGE)).toBeVisible();
    });

    it("az ÚJRA gomb megismétli a lekérést, és siker után megjelenik a lista", async () => {
        /* A gomb nem oldalt frissít (az minden állapotot elvinne), hanem PONTOSAN
           azt a lekérést ismétli meg, ami elbukott. A hiba oka jellemzően múló,
           tehát a második nekifutás sikerülhet — ezt méri ez a teszt. */
        let shouldFail = true;
        handleAxios.mockImplementation((url, data, then, catchError) => {
            if (shouldFail) catchError(new Error("Network Error"));
            else if (url === "/quotes") then(axiosResponse(QUOTES));
            else then(axiosResponse({}));
            return Promise.resolve();
        });
        renderRoutes("/quotes");
        expect(await screen.findByText(MESSAGE)).toBeVisible();

        shouldFail = false;
        await userEvent.click(screen.getByRole("button", {name: "Adatok ismételt lekérése"}));

        /* Egy waitFor, két állítás — ugyanaz az átmenet (hibából sikerbe), ugyanaz az
           ok, mint a többi race-érzékeny tesztnél: egy KONZISTENS pillanatot kérünk,
           amelyben a lista LÁTSZIK és a hibaüzenet MÁR NINCS ott. */
        await waitFor(() => {
            expect(screen.getByText("Első idézet")).toBeVisible();
            expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
        });
    });

    it("ha az ÚJRA is elbukik, a jelzés marad (nem tűnik el hamis sikerrel)", async () => {
        handleAxios.mockImplementation((url, data, then, catchError) => {
            catchError(new Error("Network Error"));
            return Promise.resolve();
        });
        renderRoutes("/quotes");
        expect(await screen.findByText(MESSAGE)).toBeVisible();

        await userEvent.click(screen.getByRole("button", {name: "Adatok ismételt lekérése"}));

        expect(await screen.findByText(MESSAGE)).toBeVisible();
    });

    it("SIKERES betöltésnél nincs hibaüzenet (kontroll)", async () => {
        /* Itt SZÁNDÉKOSAN marad a kétlépéses alak, nem waitFor: ebben a tesztben nincs
           átmenet, amit el lehetne kapni félúton — a hibaüzenet SOHA nem jelenik meg,
           tehát a második állítás nem versenyezhet semmivel. */
        renderRoutes("/quotes");

        expect(await screen.findByText("Első idézet")).toBeVisible();
        expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    });
});

/* AZ EGÉSZ LAP PIROSRA VÁLT a betöltési hibánál (2026-08-19).

   Nem csak a hibajelzés kártyája: a navbar, a keretek és a gombok is. A
   mechanizmus a téma HIBA-akcentusa, ami a szekció-akcentus FÖLÖTT áll — mert a
   kettő sorrendje nem megbízható (a React a gyerek effektjeit futtatja előbb,
   tehát a szekció akcentusa felülírná a hibáét). */
describe("A hiba jelzésének színe", () => {
    it("a KÁRTYA piros, de a LAP a téma színén marad", async () => {
        /* Volt egy változat, ami az egész lapot (a navbart is) pirosra váltotta.
           Világos témán az riasztásnak hatott, és a navigáció is „hibás" színt
           kapott, pedig azzal semmi baj — a hiba ott jelezzen, AHOL VAN. */
        handleAxios.mockImplementation((url, data, then, catchError) => {
            catchError(new Error("Network Error"));
            return Promise.resolve();
        });

        renderRoutes("/quotes");
        const notice = await screen.findByRole("alert");

        // A jelzés kártyája piros keretű…
        expect(notice.closest(".border-danger")).not.toBeNull();
        // …a lap kiemelőszíne viszont NEM a hiba-piros (l. contexts/theme.tsx).
        expect(document.documentElement.style.getPropertyValue("--theme-accent")).not.toBe("#db1937");
    });
});
