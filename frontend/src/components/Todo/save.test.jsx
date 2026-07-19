import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {CookiesProvider} from "react-cookie";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import Routes from "../routes";
import {ThemeProvider} from "../../contexts/theme";

/* A szerverhívást és az ikonokat kicseréljük, a témát viszont VALÓDIKÉNT
   használjuk: a téma és a to-do színének viszonya épp az egyik vizsgált kérdés.
   A Routes is valódi (nem másoljuk le a route-táblát), mert a /update → /create
   váltás viselkedése épp a route-tábla felelőssége.

   Az ikon-mock nem kényelmi kérdés: a library.add(fas) mind az ~1600 ikont
   behúzná, amit a Pi percekig transzformál — a teszt időtúllépéssel elszállt. */
vi.mock("@fortawesome/react-fontawesome", () => ({
    FontAwesomeIcon: ({icon, ...rest}) => <span data-icon={String(icon)} {...rest}/>,
}));

const TODO = {
    _id: "todo-1", title: "Bevásárlás", color: "danger", category: "otthon", order: 1,
    percentage: 0, tasks: {}, taskOrder: [],
};

/* A Context-mock ÁLLANDÓ objektumot adjon vissza: a komponensek effektjei a
   handleAxios azonosságára vannak felfüggesztve, így egy rendernként újra
   gyártott függvény végtelen újratöltő ciklust okozna a tesztben. */
const {handleAxios, auth} = vi.hoisted(() => {
    const fn = vi.fn();
    return {handleAxios: fn, auth: {isLoggedIn: true, handleAxios: fn}};
});

vi.mock("../../contexts/auth", () => ({useAuth: () => auth}));

const renderRoutes = () => render(
    <CookiesProvider>
        <ThemeProvider>
            <Routes categories={["otthon"]} handleLinkClicked={vi.fn()} handleCategoryChange={vi.fn()}
                    setIsColorAngleClicked={vi.fn()} isColorAngleClicked={false}
                    setIsCategoryAngleClicked={vi.fn()} isCategoryAngleClicked={false}/>
        </ThemeProvider>
    </CookiesProvider>
);

// A kártya színe a szegély-osztályból olvasható ki ("border-danger").
const cardColor = () => [...document.querySelector("form").classList]
    .find((c) => c.startsWith("border-") && c !== "border-2");

beforeEach(() => {
    window.history.pushState({}, "", "/");
    handleAxios.mockReset();
    handleAxios.mockImplementation((url, data, then) => {
        if (url === "/to-do/id") then({data: TODO});
        else if (url === "/to-do/last/order") then({data: 3});
        else if (url === "/to-do") then({data: [TODO]});
        else then({status: 200, data: {}});
        return Promise.resolve();
    });
});

afterEach(() => {
    document.cookie = "backgroundColor=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("Save útvonalai", () => {
    it("/update azonosító nélkül a listát adja, nem a szerkesztőt, és nem hasal el", async () => {
        /* Közvetlen URL-beírás vagy F5 azonosító nélkül: a csupasz /to-do/update
           nem illeszkedik a /to-do/update/:id mintára, így a "*" ág átirányítja a
           to-do listára — nincs mit szerkeszteni, a szerkesztő meg sem jelenik. */
        window.history.pushState({}, "", "/to-do/update");

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
        await userEvent.click(document.querySelector('[data-icon="fa-solid fa-plus"]'));

        await waitFor(() => expect(window.location.pathname).toBe("/to-do/create"));
        expect(screen.getByPlaceholderText("Cím")).toHaveValue("");
        expect(screen.getByPlaceholderText("Kategória")).toHaveValue("");
    });

    it("ha a to-do betöltése hibázik, a főoldalra visz, nem pörög a betöltő", async () => {
        // A /id kérés elszáll (pl. timeout) — a szerkesztő NEM ragadhat a
        // spinneren, mert a setIsLoading(false) a betöltött adathoz kötött.
        handleAxios.mockImplementation((url, data, then, catchError) => {
            if (url === "/to-do/id") catchError({message: "timeout of 15000ms exceeded"});
            else if (url === "/to-do/last/order") then({data: 3});
            else if (url === "/to-do") then({data: [TODO]});
            else then({status: 200, data: {}});
            return Promise.resolve();
        });
        renderRoutes();

        // A listáról a kártyára kattintva indul a szerkesztő betöltése.
        await userEvent.click(await screen.findByText("Bevásárlás"));

        // A betöltés hibája visszavisz a főoldalra; a Cím mező meg sem jelenik.
        await waitFor(() => expect(window.location.pathname).toBe("/to-do"));
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
        window.history.pushState({}, "", "/to-do/create");

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

        /* Egyetlen /to-do/update kérés sem mehet ki: a mentés updatedAt-et is
           írna, tehát egy üres "Tovább" hazudná, hogy hozzányúltunk. */
        const calls = handleAxios.mock.calls.map((call) => call[0]);
        expect(calls).not.toContain("/to-do/update");
        // ...de a főoldalra azért visszavisz.
        await waitFor(() => expect(window.location.pathname).toBe("/to-do"));
    });

    it("Escape a szerkesztőben a Tovább gombbal egyenértékű: a főoldalra visz", async () => {
        renderRoutes();

        await userEvent.click(await screen.findByText("Bevásárlás"));
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));

        // Az Escape a formot süti el (mint a Tovább); változatlan to-dónál ez a
        // "csak navigálás" ágra fut, tehát a főoldalra kerülünk.
        await userEvent.keyboard("{Escape}");
        await waitFor(() => expect(window.location.pathname).toBe("/to-do"));
    });

    it("Escape ÉRINTETLEN create-en mentés nélkül a főoldalra visz (nem kényszerít)", async () => {
        window.history.pushState({}, "", "/to-do/create");
        renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toBeInTheDocument());

        // Üres űrlaphoz hozzá sem nyúltunk: nem kérünk kötelező mezőt, csak elvetjük.
        await userEvent.keyboard("{Escape}");
        await waitFor(() => expect(window.location.pathname).toBe("/to-do"));
        expect(screen.queryByText("Ez a mező kitöltése kötelező.")).not.toBeInTheDocument();
    });

    /* A "megkezdett, de hiányos" ág (dirty create + üres kötelező mező → nem
       navigál, hibabuborék a mezőnél) élesben, headless renderrel igazolt. Itt
       tudatosan NEM teszteljük jsdom-ban: a form.requestSubmit() + a submit-handler
       closure időzítése jsdom alatt megbízhatatlan, a react-tooltip portálja pedig
       nem lekérdezhető — a teszt inkább a keretrendszert vizsgálná, mint a
       viselkedésünket. */

    it("ha módosítok, a Tovább elküldi a szervernek", async () => {
        renderRoutes();

        await userEvent.click(await screen.findByText("Bevásárlás"));
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));

        await userEvent.type(screen.getByPlaceholderText("Cím"), " ma");
        handleAxios.mockClear();
        await userEvent.click(screen.getByRole("button", {name: "Tovább"}));

        await waitFor(() => expect(handleAxios.mock.calls.map((c) => c[0])).toContain("/to-do/update"));
    });
});

describe("Szerkesztőből kilépés célja", () => {
    it("update mentése a szűrt nézetbe tér vissza, ahonnan indult (nem a főoldalra)", async () => {
        // A szűrt kategória-nézet is a to-dót adja, hogy legyen mire kattintani.
        handleAxios.mockImplementation((url, data, then) => {
            if (url === "/to-do/id") then({data: TODO});
            else if (url === "/to-do/last/order") then({data: 3});
            else if (url === "/to-do/category") then({data: [TODO]});
            else then({status: 200, data: {}});
            return Promise.resolve();
        });
        window.history.pushState({}, "", "/to-do/category/otthon");
        renderRoutes();

        // A szűrt listáról a kártyára kattintva jutunk a szerkesztőbe (history-lépés).
        await userEvent.click(await screen.findByText("Bevásárlás"));
        await waitFor(() => expect(window.location.pathname).toBe("/to-do/update/todo-1"));

        // Módosítunk, majd mentünk.
        await userEvent.type(screen.getByPlaceholderText("Cím"), " ma");
        await userEvent.click(screen.getByRole("button", {name: "Tovább"}));

        /* A mentés VISSZALÉP a böngésző-előzményben: a szűrt nézetbe, ahonnan
           indultunk — nem a /to-do főoldalra. Így a szűrő nem vész el. */
        await waitFor(() => expect(window.location.pathname).toBe("/to-do/category/otthon"));
    });

    it("update közvetlen megnyitás után (nincs app-előzmény) a to-do listára ment", async () => {
        /* F5 vagy közvetlen link: a szerkesztő az első history-bejegyzés
           (location.key === "default"), nincs hová visszalépni — a fallback a
           to-do lista, nem egy vak history-ugrás ki az appból. */
        window.history.pushState({}, "", "/to-do/update/todo-1");
        renderRoutes();
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));

        await userEvent.type(screen.getByPlaceholderText("Cím"), " ma");
        await userEvent.click(screen.getByRole("button", {name: "Tovább"}));

        await waitFor(() => expect(window.location.pathname).toBe("/to-do"));
    });
});
