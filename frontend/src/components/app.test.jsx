import {act, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {CookiesProvider} from "react-cookie";
import {beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import App from "./app";
import {ThemeProvider} from "../contexts/theme";

/* Csak a SZERVERHÍVÁST cseréljük ki; a route-tábla, a navbar és a szerkesztő
   valódi. A providerek sorrendje a main.jsx-ét követi (CookiesProvider →
   ThemeProvider); az AuthProvider helyett a context-mock áll be. */

const TODO = {
    _id: "todo-1", title: "Bevásárlás", color: "danger", category: "otthon", order: 1,
    percentage: 0, tasks: {}, taskOrder: [],
};

/* Állandó handleAxios: az App effektje az azonosságára függ, egy rendernként
   újragyártott függvény végtelen újratöltő ciklust okozna. A valódi
   auth-context is SZÁNDÉKOSAN stabilan tartja (a tokent refből olvassa), ezért
   a mock ebben hű a valósághoz. */
const {handleAxios, auth} = vi.hoisted(() => {
    const fn = vi.fn();
    return {handleAxios: fn, auth: {isLoggedIn: true, handleAxios: fn, token: "teszt-token"}};
});
vi.mock("../contexts/auth-context", () => ({useAuth: () => auth}));

// A jsdom nem ad valódi canvas-t; a validáció fieldAnchor-ja measureText-et hív.
beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = () => ({font: "", measureText: () => ({width: 10})});
});

beforeEach(() => {
    window.history.pushState({}, "", "/");
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
const categoryLink = (name) => screen.queryByRole("link", {name});

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
        // A kategória-lekérések callbackjeit gyűjtjük; a többi végpont automatikus.
        const pending = [];
        handleAxios.mockImplementation((url, data, then) => {
            if (url === "/to-dos/categories") pending.push({then});
            else if (url === "/to-dos/id") then({data: TODO});
            else if (url === "/to-dos/last/order") then({data: 3});
            else if (url === "/to-dos") then({data: [TODO]});
            else then({status: 200, data: {}});
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
        await userEvent.click(screen.getByRole("button", {name: "Tovább"}));
        await waitFor(() => expect(pending).toHaveLength(2));

        // A kategóriák CSAK nyitott legördülőben renderelődnek linkként.
        await userEvent.click(screen.getByText("Kategória"));

        // A FRISS válasz (már tartalmazza a "munka"-t) érkezik meg előbb.
        act(() => pending[1].then({data: ["otthon", "munka"]}));
        await waitFor(() => expect(categoryLink("munka")).toBeInTheDocument());

        // És most fut be a lejárt, még a megnyitáskor indult lekérés RÉGI listája.
        act(() => pending[0].then({data: ["otthon"]}));

        /* A "munka" csak a legördülőben szerepel (a lista kártyája az "otthon"
           kategóriájára linkel), ezért ez az állítás egyértelmű: ha a lejárt válasz
           felülírná a listát, az új kategória eltűnne innen. */
        expect(categoryLink("munka")).toBeInTheDocument();
    });
});
