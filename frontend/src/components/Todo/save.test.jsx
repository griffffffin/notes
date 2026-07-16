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
        if (url === "/id") then({data: TODO});
        else if (url === "/last/order") then({data: 3});
        else if (url === "/") then({data: [TODO]});
        else then({status: 200, data: {}});
        return Promise.resolve();
    });
});

afterEach(() => {
    document.cookie = "backgroundColor=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("Save útvonalai", () => {
    it("/update közvetlen megnyitásakor a főoldalra irányít, nem hasal el", async () => {
        /* Közvetlen URL-beírás vagy F5: a React Router navigációs state-je üres,
           tehát nincs id — nincs mit szerkeszteni. */
        window.history.pushState({}, "", "/update");

        renderRoutes();

        await waitFor(() => expect(window.location.pathname).toBe("/"));
        expect(screen.queryByPlaceholderText("Cím")).not.toBeInTheDocument();
    });

    it("/update-ról /create-re váltva üres űrlapot ad, nem a szerkesztett to-do-t", async () => {
        renderRoutes();

        // A listáról a to-do kártyájára kattintva jutunk a szerkesztőbe.
        await userEvent.click(await screen.findByText("Bevásárlás"));
        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toHaveValue("Bevásárlás"));

        // Onnan a navbar "+" gombjával az új to-do űrlapra.
        await userEvent.click(document.querySelector('[data-icon="fa-solid fa-plus"]'));

        await waitFor(() => expect(window.location.pathname).toBe("/create"));
        expect(screen.getByPlaceholderText("Cím")).toHaveValue("");
        expect(screen.getByPlaceholderText("Kategória")).toHaveValue("");
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
        window.history.pushState({}, "", "/create");

        renderRoutes();

        await waitFor(() => expect(screen.getByPlaceholderText("Cím")).toBeInTheDocument());
        expect(cardColor()).toBe("border-warning");   // sötét téma alapértéke
    });
});
