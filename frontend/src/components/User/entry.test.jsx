import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import {CookiesProvider} from "react-cookie";
import {MemoryRouter} from "react-router-dom";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {AuthProvider} from "../../contexts/auth";
import {ThemeProvider} from "../../contexts/theme";
import Entry from "./entry";
import Routes from "../routes";

/* A login/regisztrációs űrlap viselkedése. A jelszó-szabály és a "Tovább" gomb
   tiltása a felhasználó első találkozása az appal — ha ez elromlik, senki nem
   tud belépni.

   A hálózati hívást az axios szintjén némítjuk el: így az igazi AuthProvider
   fut (a handleAxios logikájával együtt), csak a szerver van kiváltva. */

vi.mock("axios");

function renderEntry({isLogin = true} = {}) {
    render(
        <CookiesProvider>
            <ThemeProvider>
                <AuthProvider>
                    <MemoryRouter>
                        <Entry isLogin={isLogin}/>
                    </MemoryRouter>
                </AuthProvider>
            </ThemeProvider>
        </CookiesProvider>
    );
}

const tovabbGomb = () => screen.getByRole("button", {name: "Tovább"});

beforeEach(() => {
    axios.post = vi.fn(() => Promise.resolve({data: "teszt-token"}));
});

afterEach(() => {
    document.cookie = "user=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("Entry — bejelentkezés", () => {
    it("a Tovább gomb üres űrlapon tiltott", () => {
        renderEntry({isLogin: true});
        expect(tovabbGomb()).toBeDisabled();
    });

    it("kitöltött névvel és legalább 8 karakteres jelszóval engedélyeződik", async () => {
        renderEntry({isLogin: true});
        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");
        await userEvent.type(screen.getByLabelText("Jelszó"), "Teszt1234");
        expect(tovabbGomb()).toBeEnabled();
    });

    it("8 karakternél rövidebb jelszónál tiltott marad", async () => {
        renderEntry({isLogin: true});
        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");
        await userEvent.type(screen.getByLabelText("Jelszó"), "rovid");
        expect(tovabbGomb()).toBeDisabled();
    });

    it("beküldéskor a /login végpontot hívja a beírt adatokkal", async () => {
        renderEntry({isLogin: true});
        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");
        await userEvent.type(screen.getByLabelText("Jelszó"), "Teszt1234");
        await userEvent.click(tovabbGomb());

        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining("/login"),
            {name: "anna", password: "Teszt1234"},
            undefined);   // bejelentkezés előtt még nincs token, tehát nincs fejléc
    });
});

describe("Entry — regisztráció", () => {
    it("a jelszó-szabályt kikényszeríti: kisbetű, nagybetű, szám, min. 8 karakter", async () => {
        renderEntry({isLogin: false});
        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");

        // Csak kisbetű + szám → nincs nagybetű, nem elég erős
        await userEvent.type(screen.getByLabelText("Jelszó"), "gyenge12");
        await userEvent.type(screen.getByLabelText("Jelszó megerősítése"), "gyenge12");
        expect(tovabbGomb()).toBeDisabled();
    });

    it("erős jelszóval és egyező megerősítéssel engedélyeződik", async () => {
        renderEntry({isLogin: false});
        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");
        await userEvent.type(screen.getByLabelText("Jelszó"), "Teszt1234");
        await userEvent.type(screen.getByLabelText("Jelszó megerősítése"), "Teszt1234");
        expect(tovabbGomb()).toBeEnabled();
    });

    it("eltérő megerősítésnél tiltott marad", async () => {
        renderEntry({isLogin: false});
        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");
        await userEvent.type(screen.getByLabelText("Jelszó"), "Teszt1234");
        await userEvent.type(screen.getByLabelText("Jelszó megerősítése"), "Masik5678");
        expect(tovabbGomb()).toBeDisabled();
    });

    it("a jelszó alapból rejtett, a szem-ikonnal megjeleníthető", async () => {
        renderEntry({isLogin: false});
        const mezo = screen.getByLabelText("Jelszó");
        expect(mezo).toHaveAttribute("type", "password");

        await userEvent.click(screen.getAllByRole("button", {name: /jelszó megjelenítése/i})[0]);
        expect(mezo).toHaveAttribute("type", "text");
    });
});

/* A bejelentkezés és a regisztráció UGYANAZT az Entry komponenst rendereli,
   csak más proppal — ezért a React alapból megtartaná a példányt a váltáskor.
   Itt a valódi route-táblát rendereljük, mert a key épp abban él. */
describe("Bejelentkezés és regisztráció közti váltás", () => {
    function renderRoutes() {
        window.history.pushState({}, "", "/");
        render(
            <CookiesProvider>
                <ThemeProvider>
                    <AuthProvider>
                        <Routes/>
                    </AuthProvider>
                </ThemeProvider>
            </CookiesProvider>
        );
    }

    it("a beírt adatok nem jönnek át a másik űrlapra", async () => {
        renderRoutes();
        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");

        await userEvent.click(screen.getByRole("button", {name: "Fiók létrehozása"}));

        expect(await screen.findByLabelText("Jelszó megerősítése")).toBeInTheDocument();
        expect(screen.getByLabelText("Felhasználónév")).toHaveValue("");
    });

    it("a bejelentkezési hiba nem jön át a regisztrációs űrlapra", async () => {
        axios.post = vi.fn(() => Promise.reject({response: {status: 401, data: "Hibás jelszó"}}));
        renderRoutes();

        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");
        await userEvent.type(screen.getByLabelText("Jelszó"), "Teszt1234");
        await userEvent.click(tovabbGomb());
        expect(await screen.findByText(/hibás/i)).toBeVisible();

        await userEvent.click(screen.getByRole("button", {name: "Fiók létrehozása"}));

        expect(await screen.findByLabelText("Jelszó megerősítése")).toBeInTheDocument();
        expect(screen.queryByText(/hibás/i)).not.toBeInTheDocument();
    });
});
