import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {renderRoutes} from "../../test/renderRoutes";
import {axiosResponse} from "../../test/axiosResponse";
import type {Quote} from "../../types/api";


/* A lista-válasz a TELJES idézeteket adja (a szerkesztő szűkített alakja külön
   szerződés, l. QuoteForEdit). A `satisfies` a fixtúrát ehhez méri: a tulajdonos,
   a betűméret és az időbélyegek is jelen vannak, ahogy a szerver küldi. */
const QUOTE_BASE = {
    user: "u-1", fontSize: 155,
    createdAt: "2026-01-01T10:00:00.000Z", updatedAt: "2026-01-01T10:00:00.000Z",
};

const QUOTES = [
    {...QUOTE_BASE, _id: "a", quote: "Első idézet", author: "Márai", order: 1},
    {...QUOTE_BASE, _id: "b", quote: "Második idézet", author: "", order: 2},
] satisfies Quote[];

const {auth, handleAxios} = await vi.hoisted(async () => {
    const {mockAuth} = await import("../../test/mockAuth");
    return mockAuth({isLoggedIn: true});
});
vi.mock(import("../../contexts/auth-context"), () => ({useAuth: () => auth}));

beforeEach(() => {
    handleAxios.mockReset();
    handleAxios.mockImplementation((url, data, then) => {
        if (url === "/quotes" || url === "/quotes/author") then(axiosResponse(QUOTES));
        else then(axiosResponse({}));
        return Promise.resolve();
    });
});

afterEach(() => {
    // A világos-téma sütit töröljük, hogy a többi teszt az alap (sötét) témával induljon.
    document.cookie = "backgroundColor=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("QuoteRead", () => {
    it("kilistázza az idézeteket a szövegükkel", async () => {
        renderRoutes("/quotes");
        expect(await screen.findByText("Első idézet")).toBeVisible();
        expect(screen.getByText("Második idézet")).toBeVisible();
    });

    it("egy szerzőre szűrve a (dekódolt) nevet küldi a /quotes/author szűrőben", async () => {
        // A %C3%A1 az "á"; a Link encodeURIComponenttel kódol, a router dekódol.
        renderRoutes("/quotes/M%C3%A1rai");
        await waitFor(() => {
            const call = handleAxios.mock.calls.find((c) => c[0] === "/quotes/author");
            expect(call?.[1]).toEqual({author: "Márai"});
        });
    });

    it("az Anonymous URL-szegmens a NÉVTELEN idézeteket szűri (üres szerző)", async () => {
        renderRoutes("/quotes/Anonymous");
        await waitFor(() => {
            const call = handleAxios.mock.calls.find((c) => c[0] === "/quotes/author");
            expect(call?.[1]).toEqual({author: ""});
        });
    });

    it("a szerző-szűrt nézetben a téma-akcentus PIROSRA vált (#db1937)", async () => {
        renderRoutes("/quotes/M%C3%A1rai");
        await screen.findByText("Első idézet");
        // Az EGÉSZ app akcentusa (a html --theme-accent) piros lesz — ebből fest a
        // navbar, a scrollbar, a gombok és a kártyák is.
        await waitFor(() =>
            expect(document.documentElement.style.getPropertyValue("--theme-accent")).toBe("#db1937"));
    });

    it("a teljes listában az akcentus a TÉMÁÉ marad (nem piros)", async () => {
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

   Amíg a hibaág üres tömböt tett a listába, két dolog történt némán: a főlista
   azt állította, hogy nincs egyetlen idézet sem, egy SZŰRT nézet pedig magától
   visszavitte a felhasználót a főlistára (az `emptyRedirect` üres listára
   irányít). Egyik sem volt igaz: az adat nem üres volt, hanem meg sem érkezett.

   A hiba OKA nem számít a felhasználónak (hálózat, időtúllépés vagy elcsúszott
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

    it("SZŰRT nézetben nem irányít át a főlistára (az üres és a hibás nem ugyanaz)", async () => {
        handleAxios.mockImplementation((url, data, then, catchError) => {
            catchError(new Error("Network Error"));
            return Promise.resolve();
        });

        renderRoutes("/quotes/M%C3%A1rai");

        expect(await screen.findByText(MESSAGE)).toBeVisible();
        /* A cím maradjon a szűrt nézeten: az átirányítás azt üzenné, hogy ehhez a
           szerzőhöz nincs idézet — miközben csak a lekérés bukott el. */
        expect(window.location.pathname).toBe("/quotes/M%C3%A1rai");
    });

    it("egy SIKERES újratöltés eltünteti a hibaüzenetet (a hiba nem ragad be)", async () => {
        /* Enélkül a jelzés örökre ottmaradna: az első bukás után egy másik
           szűrőre váltva a friss, sikeres lista mellett is a hibaszöveg
           látszana. Ez néma hiba — a felület "működik", csak hazudik. */
        let shouldFail = true;
        handleAxios.mockImplementation((url, data, then, catchError) => {
            if (shouldFail) catchError(new Error("Network Error"));
            else if (url === "/quotes" || url === "/quotes/author") then(axiosResponse(QUOTES));
            else then(axiosResponse({}));
            return Promise.resolve();
        });

        // Az előzménybe két cím kerül, hogy a böngésző Vissza gombja új betöltést váltson ki.
        window.history.pushState({}, "", "/quotes");
        renderRoutes("/quotes/M%C3%A1rai");
        expect(await screen.findByText(MESSAGE)).toBeVisible();

        shouldFail = false;
        window.history.back();

        /* EGY waitFor, KÉT állítással — és ez nem stílus-kérdés.

           Korábban két lépésben állt itt: `await findByText(…)`, majd egy SZINKRON
           `queryByText(MESSAGE)`. Az kettő KÜLÖN pillanatot néz, és a köztük eltelő
           időben a React még dolgozhat. MÉRVE (2026-08-19): a teljes tesztsorban —
           ahol a vitest a Pi négy magján párhuzamos munkásokat futtat — ez a teszt
           EGYSZER elbukott azon, hogy a lista már ott volt, a hibaüzenet még szintén;
           izoláltan viszont 10/10 zöld maradt. Vagyis nem a KÓD romlott el, hanem a
           teszt kérdezett rosszkor.

           Így egyetlen KONZISTENS pillanatot követelünk meg: van olyan állapot,
           amelyben a lista LÁTSZIK és a hibaüzenet MÁR NINCS ott. Ez nem gyengébb
           állítás — ugyanazt mondja, csak nem köti egy tetszőleges ütemezéshez.

           A TÜRELEM viszont kevés volt hozzá. 2026-08-21-én ez a teszt HÁROMSZOR
           bukott el terhelt gépen (párhuzamosan futó commit-ellenőrzés mellett,
           8-as load a négy magon), és mindannyiszor ugyanúgy: a `waitFor`
           alapértelmezett EGY másodperce járt le, mielőtt a lista megjelent volna.
           Izoláltan 14/14 zöld. Amire itt várni kell, az nem egy render, hanem egy
           LÁNC: history.back → route-váltás → új lekérés → válasz → render.

           Az emelt korlát NEM gyengíti az állítást — a hibás kód a hosszabb
           várakozás alatt SEM állítaná elő ezt az állapotot —, csak nem köti a
           gép pillanatnyi terheltségéhez, hogy zöld-e a tesztsor. */
        await waitFor(() => {
            expect(screen.getByText("Első idézet")).toBeVisible();
            expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
        }, {timeout: 5000});
    });

    it("az ÚJRA gomb megismétli a lekérést, és siker után megjelenik a lista", async () => {
        /* A gomb nem oldalt frissít (az minden állapotot elvinne), hanem PONTOSAN
           azt a lekérést ismétli meg, ami elbukott. A hiba oka jellemzően múló,
           tehát a második nekifutás sikerülhet — ezt méri ez a teszt. */
        let shouldFail = true;
        handleAxios.mockImplementation((url, data, then, catchError) => {
            if (shouldFail) catchError(new Error("Network Error"));
            else if (url === "/quotes" || url === "/quotes/author") then(axiosResponse(QUOTES));
            else then(axiosResponse({}));
            return Promise.resolve();
        });
        renderRoutes("/quotes");
        expect(await screen.findByText(MESSAGE)).toBeVisible();

        shouldFail = false;
        await userEvent.click(screen.getByRole("button", {name: "Adatok ismételt lekérése"}));

        // Egy waitFor, két állítás — ugyanaz az átmenet (hibából sikerbe), ugyanaz az
        // ok, mint a fenti tesztnél.
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
