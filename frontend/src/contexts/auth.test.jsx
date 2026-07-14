import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import {CookiesProvider} from "react-cookie";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {AuthProvider, useAuth} from "./auth";

vi.mock("axios");

/* Próbakomponens: kiírja, amit a Contextből kap, és gombokkal hívja a
   műveleteit — így a hookot komponensfa nélkül vizsgálhatjuk. */
function AuthKiiro() {
    const {token, isLoggedIn, login, logout, handleAxios} = useAuth();
    return (
        <div>
            <span data-testid="belepett">{String(isLoggedIn)}</span>
            <span data-testid="token">{token ?? "nincs"}</span>
            <button onClick={() => login("uj-token")}>belépés</button>
            <button onClick={logout}>kilépés</button>
            <button onClick={() => handleAxios("/valami", {a: 1}, () => {}, () => {})}>kérés</button>
        </div>
    );
}

const renderAuth = () => render(
    <CookiesProvider>
        <AuthProvider><AuthKiiro/></AuthProvider>
    </CookiesProvider>
);

beforeEach(() => {
    axios.post = vi.fn(() => Promise.resolve({data: "ok"}));
});

afterEach(() => {
    document.cookie = "user=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("AuthProvider", () => {
    it("süti nélkül kijelentkezett állapottal indul", () => {
        renderAuth();
        expect(screen.getByTestId("belepett")).toHaveTextContent("false");
        expect(screen.getByTestId("token")).toHaveTextContent("nincs");
    });

    it("belépés után bejelentkezett, a token a sütiben él", async () => {
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "belépés"}));

        expect(screen.getByTestId("belepett")).toHaveTextContent("true");
        expect(document.cookie).toContain("user=uj-token");
    });

    it("kilépés után visszaáll kijelentkezettre", async () => {
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "belépés"}));
        await userEvent.click(screen.getByRole("button", {name: "kilépés"}));

        expect(screen.getByTestId("belepett")).toHaveTextContent("false");
    });

    it("bejelentkezve a kérés Authorization fejlécben viszi a tokent", async () => {
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "belépés"}));
        await userEvent.click(screen.getByRole("button", {name: "kérés"}));

        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining("/valami"), {a: 1},
            {headers: {Authorization: "Bearer uj-token"}});
    });

    it("kijelentkezve nem küld Authorization fejlécet", async () => {
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "kérés"}));

        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining("/valami"), {a: 1}, undefined);
    });

    it("401-es válasznál kilépteti a felhasználót (lejárt token)", async () => {
        axios.post = vi.fn(() => Promise.reject({response: {status: 401}}));
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "belépés"}));
        expect(screen.getByTestId("belepett")).toHaveTextContent("true");

        await userEvent.click(screen.getByRole("button", {name: "kérés"}));

        await waitFor(() =>
            expect(screen.getByTestId("belepett")).toHaveTextContent("false"));
    });

    it("AuthProvider nélkül érthető hibát dob", () => {
        expect(() => render(<AuthKiiro/>)).toThrow(/AuthProvider/);
    });
});
