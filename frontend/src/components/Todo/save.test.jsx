import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";
import Routes from "../routes";

/* A szerverhívást, a témát és az ikonokat kicseréljük, hogy a routingra tudjunk
   fókuszálni. A Routes-t VALÓDIKÉNT rendereljük (nem másoljuk le a route-táblát),
   mert a /update → /create váltás viselkedése épp a route-tábla felelőssége.

   Az ikon-mock nem kényelmi kérdés: a library.add(fas) mind az ~1600 ikont
   behúzná, amit a Pi percekig transzformál — a teszt időtúllépéssel elszállt. */
vi.mock("@fortawesome/react-fontawesome", () => ({
    FontAwesomeIcon: ({icon, ...rest}) => <span data-icon={String(icon)} {...rest}/>,
}));

const TODO = {
    _id: "todo-1", title: "Bevásárlás", color: "warning", category: "otthon", order: 1,
    percentage: 0, tasks: {}, taskOrder: [],
};

/* A Context-mockok ÁLLANDÓ objektumot adjanak vissza: a komponensek effektjei
   a handleAxios azonosságára vannak felfüggesztve, így egy rendernként újra
   gyártott függvény végtelen újratöltő ciklust okozna a tesztben. */
const {handleAxios, auth, theme} = vi.hoisted(() => {
    const fn = vi.fn();
    return {
        handleAxios: fn,
        auth: {isLoggedIn: true, handleAxios: fn},
        theme: {todoDefaultColor: "warning", color: "theme"},
    };
});

vi.mock("../../contexts/auth", () => ({useAuth: () => auth}));
vi.mock("../../contexts/theme", () => ({useTheme: () => theme}));

const renderRoutes = () => render(
    <Routes categories={["otthon"]} handleLinkClicked={vi.fn()} handleCategoryChange={vi.fn()}
            setIsColorAngleClicked={vi.fn()} isColorAngleClicked={false}
            setIsCategoryAngleClicked={vi.fn()} isCategoryAngleClicked={false}/>
);

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
