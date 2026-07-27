import {act, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import {CookiesProvider} from "react-cookie";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {AuthProvider} from "./auth";
import {useAuth} from "./auth-context";

vi.mock("axios");

/* Próbakomponens: kiírja, amit a Contextből kap, és gombokkal hívja a
   műveleteit — így a hookot komponensfa nélkül vizsgálhatjuk. */
function AuthProbe() {
    const {token, isLoggedIn, login, logout, handleAxios} = useAuth();
    return (
        <div>
            <span data-testid="belepett">{String(isLoggedIn)}</span>
            <span data-testid="token">{token ?? "nincs"}</span>
            <button onClick={() => login("uj-token")}>belépés</button>
            <button onClick={logout}>kilépés</button>
            <button onClick={() => handleAxios("/valami", {a: 1}, () => {}, () => {})}>kérés</button>
            {/* Explicit token-felülírással — ezt használja a leváláskori (kijelentkezés
                utáni) mentés, amikor az élő token már törlődött. */}
            <button onClick={() => handleAxios("/valami", {a: 1}, () => {}, () => {}, "zárvány-token")}>
                kérés-tokennel</button>
        </div>
    );
}

const renderAuth = () => render(
    <CookiesProvider>
        <AuthProvider><AuthProbe/></AuthProvider>
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

        // objectContaining: a fejlécre fókuszálunk, a config többi mezőjét (pl. a
        // timeout-ot) figyelmen kívül hagyjuk, hogy az ne tegye törékennyé a tesztet.
        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining("/valami"), {a: 1},
            expect.objectContaining({headers: {Authorization: "Bearer uj-token"}}));
    });

    it("kijelentkezve nem küld Authorization fejlécet", async () => {
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "kérés"}));

        // Token nélkül a headers undefined — nincs Authorization. (A timeout-ot az
        // objectContaining itt is figyelmen kívül hagyja.)
        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining("/valami"), {a: 1},
            expect.objectContaining({headers: undefined}));
    });

    it("kijelentkezve is viszi az EXPLICIT kapott tokent (leváláskori mentés)", async () => {
        // Nincs belépés: az élő token hiányzik (ez a kijelentkezés-utáni állapot). A
        // leváláskori mentés viszont a leváláskor még érvényes tokent ZÁRVÁNYOLJA és
        // explicit átadja — a fejlécnek EZT kell vinnie, különben a mentés 401-en veszne.
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "kérés-tokennel"}));

        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining("/valami"), {a: 1},
            expect.objectContaining({headers: {Authorization: "Bearer zárvány-token"}}));
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
        expect(() => render(<AuthProbe/>)).toThrow(/AuthProvider/);
    });
});

describe("Tétlenségi kijelentkezés", () => {
    /* A negyed óra kivárása helyett az órát tekerjük előre: az időzítőket a
       vitest hamis órája adja, így a teszt ezredmásodpercek alatt lefut. */
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const signIn = async () => {
        renderAuth();
        await act(async () => {
            screen.getByText("belépés").click();
        });
        expect(screen.getByTestId("belepett")).toHaveTextContent("true");
    };

    it("negyed óra tétlenség után kijelentkeztet", async () => {
        await signIn();

        await act(async () => vi.advanceTimersByTime(15 * 60 * 1000 + 1000));

        expect(screen.getByTestId("belepett")).toHaveTextContent("false");
    });

    it("negyed óra ELŐTT nem jelentkeztet ki", async () => {
        await signIn();

        await act(async () => vi.advanceTimersByTime(14 * 60 * 1000));

        expect(screen.getByTestId("belepett")).toHaveTextContent("true");
    });

    it("aktivitás újraindítja a negyed órát", async () => {
        await signIn();

        // 14 perc tétlenség, egy egérmozdulat, majd újabb 14 perc.
        await act(async () => vi.advanceTimersByTime(14 * 60 * 1000));
        await act(async () => {
            window.dispatchEvent(new MouseEvent("mousemove"));
        });
        await act(async () => vi.advanceTimersByTime(14 * 60 * 1000));

        // Összesen 28 perc telt el, de tétlenül csak 14 — bent maradunk.
        expect(screen.getByTestId("belepett")).toHaveTextContent("true");
    });

    it("aktivitáskor megújítja a tokent, de legfeljebb 5 percenként", async () => {
        await signIn();
        axios.post.mockClear();

        // Sűrű egérmozgás: ettől még nem szabad kérést indítania.
        await act(async () => {
            for (let i = 0; i < 20; i++) window.dispatchEvent(new MouseEvent("mousemove"));
        });
        expect(axios.post).not.toHaveBeenCalled();

        // Öt perc múlva az első mozdulat viszont megújítja.
        await act(async () => vi.advanceTimersByTime(5 * 60 * 1000));
        await act(async () => {
            window.dispatchEvent(new MouseEvent("mousemove"));
        });
        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining("/refresh"), {}, expect.anything());
    });
});
