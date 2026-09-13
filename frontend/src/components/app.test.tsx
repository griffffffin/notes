import {act, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {CookiesProvider} from "react-cookie";
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import App from "./app";
import {ThemeProvider} from "../contexts/theme";
import {axiosResponse} from "../test/axiosResponse";
import type {AxiosResponse} from "axios";
import type {Todo} from "../types/api";
import {at} from "../test/at";
import {giveDraftKey} from "../test/draftKey";

/* Csak a SZERVERHÍVÁST cseréljük ki; a route-tábla, a navbar és a szerkesztő
   valódi. A providerek sorrendje a main.tsx-ét követi (CookiesProvider →
   ThemeProvider); az AuthProvider helyett a context-mock áll be. */

/* A `satisfies Todo` a fixtúrát a VALÓDI szerződéshez méri: pontosan a hálózatra
   szánt mezők vannak jelen, ahogy a szerver küldi. A `user` és az időbélyegek
   SZÁNDÉKOSAN nincsenek itt — a válasz whitelistje (backend models/todos.js
   toJSON) nem adja ki őket, a /to-dos/id (readById.js) is csak ezt a szűkített
   alakot adja. A fixtúra és a séma együtt mozog: ha valamelyik elcsúszik, a
   `satisfies` vagy a futásidejű séma-ellenőrzés hangosan jelez. */
const TODO = {
    _id: "todo-1", title: "Bevásárlás", color: "danger", category: "otthon", order: 1,
    percentage: 0, tasks: {}, taskOrder: [],
} satisfies Todo;

/* Állandó handleAxios: az App effektje az azonosságára függ, egy rendernként
   újragyártott függvény végtelen újratöltő ciklust okozna. A valódi
   auth-context is SZÁNDÉKOSAN stabilan tartja (a tokent refből olvassa), ezért
   a mock ebben hű a valósághoz — a közös pótlék (test/mockAuth.ts) egyszer
   építi fel a contextet, és a fordító a VALÓDI Auth alakjához méri. */
const {auth, handleAxios} = await vi.hoisted(async () => {
    const {mockAuth} = await import("../test/mockAuth");
    return mockAuth({isLoggedIn: true, session: {name: "teszt"}});
});
vi.mock(import("../contexts/auth-context"), () => ({useAuth: () => auth}));

/* A jsdom nem ad valódi canvas-t; a validáció fieldAnchor-ja measureText-et hív.
   A pótlék a getContext teljes típusát nem tudja betartani (l. a fieldAnchor
   tesztjének indoklását), ezért defineProperty-vel kerül a helyére, nem `as`-szal. */
beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
        value: () => ({font: "", measureText: () => ({width: 10})}),
        configurable: true,
    });
});

beforeEach(() => {
    window.history.pushState({}, "", "/");
    /* A szerkesztő CSAK piszkozat-kulccsal nyílik meg (l. draftKeySession.ts,
       useDraftKeyGate): kulcs nélkül a mentetlen munkának nem lenne helyi
       másolata, tehát meg sem írható. Élesben a bejelentkezés szerzi meg; itt a
       mockolt auth miatt kézzel adjuk oda — l. test/draftKey.ts. */
    giveDraftKey();
    handleAxios.mockReset();
});

const renderApp = () => render(
    <CookiesProvider>
        <ThemeProvider>
            <App/>
        </ThemeProvider>
    </CookiesProvider>,
);

// A kategóriák a navbar legördülőjében a szűrt nézetre mutató linkként jelennek meg.
const categoryLink = (name: string) => screen.queryByRole("link", {name});

/* VERSENYHELYZET a kategórialista lekérésében — az app.tsx sorszám-őre.
   Ez a lekérés ÖT helyről indulhat (a mount-effekt, a to-do törlése, és a
   szerkesztő három mentési útja), ezért NINCS egyetlen effekt-cleanup, amire a
   többi betöltőnél használt `active` zászlót fel lehetne fűzni — helyette
   sorszám dönti el, melyik válasz írhat.

   A hiba, amit megelőz: mentesz egy to-dót ÚJ kategóriával (a mentés utáni
   lekérés válasza már tartalmazza), de a lassabb, még a megnyitáskor indult
   lekérés válasza fut be utána a RÉGI listával — az új kategória némán eltűnik
   a legördülőből, és a következő lekérésig nincs is ott. */
describe("App — versenyhelyzet a kategórialista lekérésében", () => {
    it("a korábbi lekérés KÉSVE érkező válasza nem írja felül a friss kategóriákat", async () => {
        /* A kategória-lekérések callbackjeit gyűjtjük; a többi végpont automatikus.
           A típus kimondja, MIT fog kapni ez a visszahívás: a kategórialistát,
           ugyanabban az alakban, ahogy az app.tsx kéri (`Todo["category"][]`). Így
           a gyűjtő-tömb nem egy alaktalan `any[]`, és a lentebbi kézi
           válasz-elsütések is a valódi szerződéshez mérve fordulnak. */
        const pending: {then: (response: AxiosResponse<Todo["category"][]>) => void}[] = [];
        handleAxios.mockImplementation((url, data, then) => {
            if (url === "/to-dos/categories") pending.push({then});
            else if (url === "/to-dos/id") then(axiosResponse(TODO));
            else if (url === "/to-dos/last/order") then(axiosResponse(3));
            else if (url === "/to-dos") then(axiosResponse([TODO]));
            else then(axiosResponse({}));
            return Promise.resolve();
        });

        // A szerkesztő megnyitása: a mount-effekt elindítja az ELSŐ kategória-lekérést.
        window.history.pushState({}, "", "/to-dos/update/todo-1");
        renderApp();
        await waitFor(() => expect(pending).toHaveLength(1));
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));

        /* Mentés: a to-do ÚJ kategóriát kap. A sikeres mentés hívja a
           handleCategoryChange-t — ez a MÁSODIK lekérés, miközben az első még fut. */
        await userEvent.clear(screen.getByPlaceholderText("Kategória"));
        await userEvent.type(screen.getByPlaceholderText("Kategória"), "munka");
        await userEvent.click(screen.getByRole("button", {name: "Mentés"}));
        await waitFor(() => expect(pending).toHaveLength(2));

        // A kategóriák CSAK nyitott legördülőben renderelődnek linkként.
        await userEvent.click(screen.getByText("Kategória"));

        // A FRISS válasz (már tartalmazza a "munka"-t) érkezik meg előbb.
        act(() => at(pending, 1).then(axiosResponse(["otthon", "munka"])));
        await waitFor(() => expect(categoryLink("munka")).toBeInTheDocument());

        // És most fut be a lejárt, még a megnyitáskor indult lekérés RÉGI listája.
        act(() => at(pending, 0).then(axiosResponse(["otthon"])));

        /* A "munka" csak a legördülőben szerepel (a lista kártyája az "otthon"
           kategóriájára linkel), ezért ez az állítás egyértelmű: ha a lejárt válasz
           felülírná a listát, az új kategória eltűnne innen. */
        expect(categoryLink("munka")).toBeInTheDocument();
    });
});

/* A KATEGÓRIA-LEKÉRÉS HIBÁJA — a bekötés (2026-08-19).

   A navbar tesztje a MEGJELENÍTÉST méri (kapott hibajelzővel), ez pedig azt,
   hogy az App a lekérés hibáját tényleg továbbadja. Ez a kötés egyetlen sor,
   amit egy refaktor némán kivehet: a legördülő attól még megjelenne, csak
   üresen — vagyis azt állítaná, hogy nincs egyetlen kategóriád sem. */
describe("App — a kategóriák betöltése elbukott", () => {
    const MESSAGE = "A kategóriák betöltése sikertelen.";

    it("a legördülőben megjelenik a hibajelzés", async () => {
        handleAxios.mockImplementation((url, data, then, catchError) => {
            if (url === "/to-dos/categories") catchError(new Error("Network Error"));
            else then(axiosResponse([]));
            return Promise.resolve();
        });
        renderApp();

        await userEvent.click(screen.getByText("Kategória"));

        expect(await screen.findByText(MESSAGE)).toBeVisible();
    });

    it("SIKERES lekérésnél nincs hibajelzés (kontroll)", async () => {
        handleAxios.mockImplementation((url, data, then) => {
            then(axiosResponse(url === "/to-dos/categories" ? ["otthon"] : []));
            return Promise.resolve();
        });
        renderApp();

        await userEvent.click(screen.getByText("Kategória"));

        expect(await screen.findByText("otthon")).toBeVisible();
        expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
    });
});

/* A NAVBAR LINKJEI KIJELENTKEZÉS KÖZBEN (2026-08-24).

   A linkek mentés közben már eddig is a normál egérmutatót kapták (a blocker
   úgyis elnyeli a navigációt), de a KIJELENTKEZÉSRŐL a navbar nem tudott.

   A rés nem elméleti, és nem is a szélső eset. A kijelentkezés-karika 300 ms után
   gyullad ki, és amíg nincs ott, a teljes navbar látszik — egy egészséges mentés
   viszont századmásodpercek alatt lefut, tehát a TIPIKUS kijelentkezésnél a karika
   meg sem jelenik. Vagyis a felhasználó végig egy olyan navbart lát, aminek a
   linkjei kézzel hívogatnak, holott a lap pillanatokon belül eltűnik alóluk.

   A TESZT NEM IDŐZÍTÉSRE ÉPÜL. Nem a 300 ms-os ablakot próbálja eltalálni (az
   flaky volna), hanem közvetlenül azt az ÁLLAPOTOT állítja elő, ami abban a
   résben fennáll: fut a kijelentkezés, a karika még nem gyulladt ki. */
describe("App — a navbar linkjei kijelentkezés közben", () => {
    beforeEach(() => {
        handleAxios.mockImplementation((url, data, then) => {
            then(axiosResponse(url === "/to-dos/categories" ? ["otthon"] : []));
        });
    });
    /* A mockolt context objektumát a tesztek MUTÁLJÁK, mert a modul-szintű mock
       ugyanazt a példányt adja minden renderben. Ezért kötelező visszaállítani —
       különben a következő teszt egy félig kijelentkezett appot kapna. */
    afterEach(() => { auth.isLoggingOut = false; });

    it("kijelentkezés alatt a linkek NEM kapnak kéz-kurzort", () => {
        auth.isLoggingOut = true;

        renderApp();

        expect(screen.getByRole("navigation"),
            "kijelentkezés közben a linkek nem visznek sehova — a kéz-kurzor mást ígér")
            .toHaveClass("navbar-blocked");
    });

    it("kijelentkezés NÉLKÜL a linkek megtartják a kéz-kurzort (kontroll)", () => {
        /* A párja az előzőnek. Enélkül a fenti teszt akkor is zöld volna, ha az
           osztály MINDIG felkerülne — a kurzor pedig sosem mutatná, hogy a link
           visz valahova. */
        renderApp();

        expect(screen.getByRole("navigation")).not.toHaveClass("navbar-blocked");
    });
});
