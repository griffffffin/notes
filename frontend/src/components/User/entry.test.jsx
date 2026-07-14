import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {CookiesProvider} from "react-cookie";
import {MemoryRouter} from "react-router-dom";
import {describe, expect, it, vi} from "vitest";
import {ThemeProvider} from "../../contexts/theme";
import Entry from "./entry";

/* A login/regisztrációs űrlap viselkedése. A jelszó-szabály és a "Tovább" gomb
   tiltása a felhasználó első találkozása az appal — ha ez elromlik, senki nem
   tud belépni. */

function renderEntry(props = {}) {
    const handleAxios = props.handleAxios ?? vi.fn();
    const setCookie = props.setCookie ?? vi.fn();
    render(
        <CookiesProvider>
            <ThemeProvider>
                <MemoryRouter>
                    <Entry isLogin={props.isLogin ?? true} handleAxios={handleAxios} setCookie={setCookie}/>
                </MemoryRouter>
            </ThemeProvider>
        </CookiesProvider>
    );
    return {handleAxios, setCookie};
}

const tovabbGomb = () => screen.getByRole("button", {name: "Tovább"});

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
        const {handleAxios} = renderEntry({isLogin: true});
        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");
        await userEvent.type(screen.getByLabelText("Jelszó"), "Teszt1234");
        await userEvent.click(tovabbGomb());

        expect(handleAxios).toHaveBeenCalledWith(
            "/login", {name: "anna", password: "Teszt1234"},
            expect.any(Function), expect.any(Function));
    });
});

describe("Entry — regisztráció", () => {
    it("a jelszó-szabályt kikényszeríti: kisbetű, nagybetű, szám, min. 8 karakter", async () => {
        renderEntry({isLogin: false});
        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");

        // Csak kisbetű + szám -> nincs nagybetű, nem elég erős
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
