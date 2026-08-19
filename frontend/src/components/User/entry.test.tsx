import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import {CookiesProvider} from "react-cookie";
import {MemoryRouter} from "react-router-dom";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {AuthProvider} from "../../contexts/auth";
import {ThemeProvider} from "../../contexts/theme";
import Entry from "./entry";
import Routes from "../routes";
/* A VÁRT SZÖVEGET a forrásból vesszük, nem gépeljük be újra. Ugyanaz az elv,
   amiért a 409-es teszt a státuszkódra asszertál és nem a mondatra: a felirat
   átfogalmazása a felhasználónak szóló döntés, nem viselkedésváltozás — attól
   egyetlen teszt sem válhat pirossá. Amit itt vizsgálunk, az az, hogy MELYIK
   esetet ismerte fel a felület. */
import {ENTRY_ERROR_MESSAGES} from "./entryError";
import {axiosResponse} from "../../test/axiosResponse";
import {fakeToken} from "../../test/fakeToken";
import type {RoutesProps} from "../routes";
import {at} from "../../test/at";

/* A login/regisztrációs űrlap viselkedése. A jelszó-szabály és a "Tovább" gomb
   tiltása a felhasználó első találkozása az appal — ha ez elromlik, senki nem
   tud belépni.

   A hálózati hívást az axios szintjén némítjuk el: így az igazi AuthProvider
   fut (a handleAxios logikájával együtt), csak a szerver van kiváltva. */

/* Az axios AUTOMOCKOLVA: valódi hálózat nincs, de az igazi AuthProvider fut (a
   handleAxios logikájával együtt) — csak a szerver van kiváltva.

   A `post`-ot a `vi.mocked` kémjén át vezéreljük, nem értékadással: a típusa
   generikus (`post<T, R, D>`), tehát BÁRMELY R-re működő függvényt vár, amit egy
   konkrét visszatérésű vi.fn nem elégít ki. */
vi.mock(import("axios"));

const postSpy = () => vi.mocked(axios.post);

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

const submitButton = () => screen.getByRole("button", {name: "Tovább"});

beforeEach(() => {
    postSpy().mockReset();
    postSpy().mockResolvedValue(axiosResponse(fakeToken()));
});

afterEach(() => {
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("Entry — bejelentkezés", () => {
    it("a Tovább gomb üres űrlapon tiltott", () => {
        renderEntry({isLogin: true});
        expect(submitButton()).toBeDisabled();
    });

    it("kitöltött névvel és legalább 8 karakteres jelszóval engedélyeződik", async () => {
        renderEntry({isLogin: true});
        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");
        await userEvent.type(screen.getByLabelText("Jelszó"), "Teszt1234");
        expect(submitButton()).toBeEnabled();
    });

    it("8 karakternél rövidebb jelszónál tiltott marad", async () => {
        renderEntry({isLogin: true});
        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");
        await userEvent.type(screen.getByLabelText("Jelszó"), "rovid");
        expect(submitButton()).toBeDisabled();
    });

    it("beküldéskor a /login végpontot hívja a beírt adatokkal", async () => {
        renderEntry({isLogin: true});
        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");
        await userEvent.type(screen.getByLabelText("Jelszó"), "Teszt1234");
        await userEvent.click(submitButton());

        // Bejelentkezés előtt még nincs token, tehát nincs Authorization fejléc.
        // Az objectContaining a config timeout-mezőjét figyelmen kívül hagyja.
        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining("/login"),
            {name: "anna", password: "Teszt1234"},
            expect.objectContaining({headers: undefined}));
    });
});

describe("Entry — regisztráció", () => {
    it("a jelszó-szabályt kikényszeríti: kisbetű, nagybetű, szám, min. 8 karakter", async () => {
        renderEntry({isLogin: false});
        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");

        // Csak kisbetű + szám → nincs nagybetű, nem elég erős
        await userEvent.type(screen.getByLabelText("Jelszó"), "gyenge12");
        await userEvent.type(screen.getByLabelText("Jelszó megerősítése"), "gyenge12");
        expect(submitButton()).toBeDisabled();
    });

    it("erős jelszóval és egyező megerősítéssel engedélyeződik", async () => {
        renderEntry({isLogin: false});
        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");
        await userEvent.type(screen.getByLabelText("Jelszó"), "Teszt1234");
        await userEvent.type(screen.getByLabelText("Jelszó megerősítése"), "Teszt1234");
        expect(submitButton()).toBeEnabled();
    });

    it("eltérő megerősítésnél tiltott marad", async () => {
        renderEntry({isLogin: false});
        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");
        await userEvent.type(screen.getByLabelText("Jelszó"), "Teszt1234");
        await userEvent.type(screen.getByLabelText("Jelszó megerősítése"), "Masik5678");
        expect(submitButton()).toBeDisabled();
    });

    it("a jelszó alapból rejtett, a szem-ikonnal megjeleníthető", async () => {
        renderEntry({isLogin: false});
        const mezo = screen.getByLabelText("Jelszó");
        expect(mezo).toHaveAttribute("type", "password");

        await userEvent.click(
            at(screen.getAllByRole("button", {name: /jelszó megjelenítése/i}), 0, "szem-gomb"));
        expect(mezo).toHaveAttribute("type", "text");
    });
});

/* A bejelentkezés és a regisztráció UGYANAZT az Entry komponenst rendereli,
   csak más proppal — ezért a React alapból megtartaná a példányt a váltáskor.
   Itt a valódi route-táblát rendereljük, mert a key épp abban él.

   ELTÉRÉS a többi route-teszttől: ez NEM a közös test/renderRoutes segédet
   használja, mert az a hitelesítést MOCKOLTNAK feltételezi (a lista- és
   szerkesztő-tesztek kicserélik az auth-contextet). A ki-/bejelentkezés viszont
   épp az AuthProvider valódi működése, ezért itt a teljes, valódi provider-fa
   kell — a közös segéddel ezt a tesztet nem lehetne megírni. */
/* Az App UI-propjai: KIJELENTKEZVE egyiket sem használja a route-fa (az
   AuthLayout ágon nincs se kategória-legördülő, se szín-szűrő), a szerződés
   viszont kötelezővé teszi őket. Semleges alapértékeket adunk, hogy a hiányuk ne
   típus-lyukként, hanem kimondott döntésként álljon. */
const ROUTE_PROPS = {
    categories: [], categoriesFailed: false, handleLinkClicked: vi.fn(), handleCategoryChange: vi.fn(),
    setIsColorAngleClicked: vi.fn(), isColorAngleClicked: false,
    setIsCategoryAngleClicked: vi.fn(), isCategoryAngleClicked: false,
} satisfies RoutesProps;

describe("Bejelentkezés és regisztráció közti váltás", () => {
    function renderRoutes() {
        window.history.pushState({}, "", "/");
        render(
            <CookiesProvider>
                <ThemeProvider>
                    <AuthProvider>
                        <Routes {...ROUTE_PROPS}/>
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

    it("foglalt névnél a 409 STÁTUSZKÓDRA ír ki hibát, nem a szövegre", async () => {
        /* A szerver szerződése a státuszkód, nem a mondat. Ha a szöveget
           átfogalmazzuk vagy lefordítjuk, ennek a tesztnek zöldnek kell
           maradnia — épp ezért nem a szövegre asszertálunk. */
        postSpy().mockRejectedValue({
            response: {status: 409, data: "bármilyen üzenet, akár angolul"},
        });
        window.history.pushState({}, "", "/signup");
        render(
            <CookiesProvider>
                <ThemeProvider>
                    <AuthProvider>
                        <Routes {...ROUTE_PROPS}/>
                    </AuthProvider>
                </ThemeProvider>
            </CookiesProvider>
        );

        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");
        await userEvent.type(screen.getByLabelText("Jelszó"), "Teszt1234");
        await userEvent.type(screen.getByLabelText("Jelszó megerősítése"), "Teszt1234");
        await userEvent.click(submitButton());

        expect(await screen.findByText(/már foglalt/i)).toBeVisible();
    });

    it("a bejelentkezési hiba nem jön át a regisztrációs űrlapra", async () => {
        /* 400, nem 401: EZT küldi a szerver a rossz azonosítókra (login.js
           BAD_LOGIN_STATUS). A 401 nála mást jelent — lejárt tokent —, és a
           handleAxios globálisan kiléptet rá; a fixtúra korábban ezt a másik
           esetet játszotta meg, csak épp nem látszott, mert a felület akkor még
           minden hibára ugyanazt írta ki. */
        postSpy().mockRejectedValue({response: {status: 400, data: "Hibás jelszó"}});
        renderRoutes();

        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");
        await userEvent.type(screen.getByLabelText("Jelszó"), "Teszt1234");
        await userEvent.click(submitButton());
        expect(await screen.findByText(ENTRY_ERROR_MESSAGES.credentials)).toBeVisible();

        await userEvent.click(screen.getByRole("button", {name: "Fiók létrehozása"}));

        expect(await screen.findByLabelText("Jelszó megerősítése")).toBeInTheDocument();
        expect(screen.queryByText(ENTRY_ERROR_MESSAGES.credentials)).not.toBeInTheDocument();
    });
});

/* A HIBÁS ÁGAK — ez a két teszt egy valódi, kijavított hibapárt őriz.

   A belépés korábban MINDEN hibára azt írta ki, hogy rossz a név vagy a jelszó:
   a leállt szerver is így jelent meg, és a felhasználó a jelszavát kezdte
   keresni. A regisztráció pont fordítva: a 409-en kívül semmire nem szólt, tehát
   egy 500-as válasz után a képernyőn SEMMI nem történt — némán elveszett a
   beküldés. A kettő ugyanannak a hiánynak a két vége. */
describe("Entry — hibaüzenetek", () => {
    async function fillAndSubmitLogin() {
        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");
        await userEvent.type(screen.getByLabelText("Jelszó"), "Teszt1234");
        await userEvent.click(submitButton());
    }

    it("belépésnél a hálózati hiba NEM a jelszóra fogja", async () => {
        /* Hálózati hibánál és időtúllépésnél NINCS `response` az objektumon —
           ezért nincs státuszkód sem, és pont ez különbözteti meg a szerver
           szerződéses "nem"-jétől. */
        postSpy().mockRejectedValue(new Error("Network Error"));
        renderEntry({isLogin: true});
        await fillAndSubmitLogin();

        expect(await screen.findByText(ENTRY_ERROR_MESSAGES.request)).toBeVisible();
        expect(screen.queryByText(ENTRY_ERROR_MESSAGES.credentials)).not.toBeInTheDocument();
    });

    it("belépésnél a 400 marad a 'hibás név vagy jelszó'", async () => {
        postSpy().mockRejectedValue({response: {status: 400, data: "bármi"}});
        renderEntry({isLogin: true});
        await fillAndSubmitLogin();

        expect(await screen.findByText(ENTRY_ERROR_MESSAGES.credentials)).toBeVisible();
    });

    it("regisztrációnál a szerverhiba sem marad némán", async () => {
        postSpy().mockRejectedValue({response: {status: 500, data: "Sikertelen regisztráció."}});
        renderEntry({isLogin: false});
        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");
        await userEvent.type(screen.getByLabelText("Jelszó"), "Teszt1234");
        await userEvent.type(screen.getByLabelText("Jelszó megerősítése"), "Teszt1234");
        await userEvent.click(submitButton());

        expect(await screen.findByText(ENTRY_ERROR_MESSAGES.request)).toBeVisible();
    });

    it("a hibaüzenet az első leütésre eltűnik", async () => {
        postSpy().mockRejectedValue({response: {status: 400, data: "bármi"}});
        renderEntry({isLogin: true});
        await fillAndSubmitLogin();
        expect(await screen.findByText(ENTRY_ERROR_MESSAGES.credentials)).toBeVisible();

        await userEvent.type(screen.getByLabelText("Felhasználónév"), "b");
        expect(screen.queryByText(ENTRY_ERROR_MESSAGES.credentials)).not.toBeInTheDocument();
    });
});

describe("Sikeres belépés utáni cím", () => {
    it("regisztráció után a főoldalra visz, nem marad a /signup címen", async () => {
        postSpy().mockReset();
    postSpy().mockResolvedValue(axiosResponse(fakeToken()));
        window.history.pushState({}, "", "/signup");
        render(
            <CookiesProvider>
                <ThemeProvider>
                    <AuthProvider>
                        <Routes {...ROUTE_PROPS}/>
                    </AuthProvider>
                </ThemeProvider>
            </CookiesProvider>
        );

        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");
        await userEvent.type(screen.getByLabelText("Jelszó"), "Teszt1234");
        await userEvent.type(screen.getByLabelText("Jelszó megerősítése"), "Teszt1234");
        await userEvent.click(submitButton());

        /* Regisztráció után a belépett nézetbe kell jutni. Az Entry a gyökérre
           navigál, amit a route-tábla a to-do listára (/to-dos) irányít át — így
           a /signup címen semmiképp nem maradhatunk. */
        await waitFor(() => expect(window.location.pathname).toBe("/to-dos"));
    });

    it("login nélkül megnyitott védett címen belépés után OTT marad, nem a főoldalon", async () => {
        // Login nélkül egy védett, szűrt címet nyitunk meg (nem /login, nem /signup).
        window.history.pushState({}, "", "/to-dos/category/otthon");
        render(
            <CookiesProvider>
                <ThemeProvider>
                    <AuthProvider>
                        <Routes {...ROUTE_PROPS}/>
                    </AuthProvider>
                </ThemeProvider>
            </CookiesProvider>
        );

        // Kijelentkezve a bejelentkező űrlap fogad; belépünk.
        await userEvent.type(screen.getByLabelText("Felhasználónév"), "anna");
        await userEvent.type(screen.getByLabelText("Jelszó"), "Teszt1234");
        await userEvent.click(submitButton());

        /* Belépés után a router a MEGNYITOTT címre renderel (az Entry már nem
           navigál kézzel), tehát a szűrt nézetben maradunk — nem a /to-dos
           főoldalra dobjuk a felhasználót. */
        await waitFor(() => expect(window.location.pathname).toBe("/to-dos/category/otthon"));
    });
});
