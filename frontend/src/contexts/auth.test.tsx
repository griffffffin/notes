import {act, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import {useState} from "react";
import {Cookies, CookiesProvider} from "react-cookie";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import * as v from "valibot";
import {AuthProvider} from "./auth";
import {useAuth} from "./auth-context";
import {axiosResponse} from "../test/axiosResponse";
import {fakeToken} from "../test/fakeToken";
import {ENDPOINTS} from "../endpoints";
import {authTokenSchema} from "../types/api";
import {COOKIES} from "../cookies";
import {ACTIVITY_EVENTS} from "../idle";

/* Az axios AUTOMOCKOLVA: a modul minden exportja kémmé válik, tehát valódi
   hálózat nincs, de az AuthProvider (és benne a handleAxios) a maga teljes
   valójában fut — épp az a vizsgálat tárgya.

   A `post`-ot NEM értékadással cseréljük ki: a típusa generikus (`post<T, R, D>`),
   vagyis olyan függvényt vár, ami BÁRMELY R-re működik — egy `vi.fn(() =>
   Promise.resolve(…))` viszont egy konkrétat ad, és a fordító ezt (helyesen)
   elutasítja. A `vi.mocked` az automock kémjét adja vissza a valódi szignatúrával,
   a válaszokat pedig a mockResolvedValue/mockRejectedValue állítja be. */
vi.mock(import("axios"));

const postSpy = () => vi.mocked(axios.post);

/* A tokenek VALÓDI ALAKÚAK (l. test/fakeToken.ts): a szerződés megköveteli, hogy
   a süti és a bejelentkezés válasza JWT legyen, különben a felület nem tekint
   bejelentkezettnek. Két külön példány, mert a tesztek megkülönböztetik a
   bejelentkezéskor kapott és a szerkesztő által ZÁRVÁNYOLT (leváláskori mentéshez
   őrzött) tokent. */
const TOKEN = fakeToken();
const CAPTURED_TOKEN = fakeToken("u-zarvany");

/* Próbakomponens: kiírja, amit a Contextből kap, és gombokkal hívja a
   műveleteit — így a hookot komponensfa nélkül vizsgálhatjuk. */
function AuthProbe() {
    const {token, isLoggedIn, login, logout, handleAxios} = useAuth();
    /* A séma-ellenőrzés a HÍVÓ oldalán történik (l. types/api.ts): a próba ezért
       pontosan úgy jár el, ahogy egy valódi hívó — a választ átengedi a sémán, és
       az EREDMÉNYT írja ki. Így a teszt azt látja, melyik ág futott le. */
    const [outcome, setOutcome] = useState("még semmi");
    return (
        <div>
            <span data-testid="belepett">{String(isLoggedIn)}</span>
            <span data-testid="token">{token ?? "nincs"}</span>
            <span data-testid="eredmeny">{outcome}</span>
            <button onClick={() => handleAxios(ENDPOINTS.login, {}, 
                (response) => setOutcome("siker: " + v.parse(authTokenSchema, response.data)),
                () => setOutcome("hibaág"))}>kérés-sémával</button>
            <button onClick={() => login(TOKEN)}>belépés</button>
            <button onClick={logout}>kilépés</button>
            <button onClick={() => handleAxios(ENDPOINTS.todos, {a: 1}, () => {}, () => {})}>kérés</button>
            {/* Explicit token-felülírással — ezt használja a leváláskori (kijelentkezés
                utáni) mentés, amikor az élő token már törlődött. */}
            <button onClick={() => handleAxios(ENDPOINTS.todos, {a: 1}, () => {}, () => {}, CAPTURED_TOKEN)}>
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
    postSpy().mockReset();
    postSpy().mockResolvedValue(axiosResponse("ok"));
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
        expect(document.cookie).toContain("user=" + TOKEN);
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
            expect.stringContaining(ENDPOINTS.todos), {a: 1},
            expect.objectContaining({headers: {Authorization: "Bearer " + TOKEN}}));
    });

    it("kijelentkezve nem küld Authorization fejlécet", async () => {
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "kérés"}));

        // Token nélkül a headers undefined — nincs Authorization. (A timeout-ot az
        // objectContaining itt is figyelmen kívül hagyja.)
        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining(ENDPOINTS.todos), {a: 1},
            expect.objectContaining({headers: undefined}));
    });

    it("kijelentkezve is viszi az EXPLICIT kapott tokent (leváláskori mentés)", async () => {
        // Nincs belépés: az élő token hiányzik (ez a kijelentkezés-utáni állapot). A
        // leváláskori mentés viszont a leváláskor még érvényes tokent ZÁRVÁNYOLJA és
        // explicit átadja — a fejlécnek EZT kell vinnie, különben a mentés 401-en veszne.
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "kérés-tokennel"}));

        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining(ENDPOINTS.todos), {a: 1},
            expect.objectContaining({headers: {Authorization: "Bearer " + CAPTURED_TOKEN}}));
    });

    it("401-es válasznál kilépteti a felhasználót (lejárt token)", async () => {
        postSpy().mockRejectedValue({response: {status: 401}});
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

/* A SÜTIBŐL OLVASOTT TOKEN. A süti a felhasználó gépén él: átírható kézzel, egy
   böngésző-kiegészítővel, vagy megörökölhető egy régebbi verziótól. A react-cookie
   `any`-t ad vissza, ráadásul a JSON-nak látszó értéket MAGÁTÓL objektummá
   alakítja — a korábbi `cookies.user ?? null` tehát nem ellenőrzés volt, hanem
   feltevés. Ezek a tesztek azt rögzítik, hogy csak VALÓDI token számít
   bejelentkezésnek. */
/* AMIT A KÖNYVTÁRNAK ADUNK ÁT, DE VISSZAOLVASNI NEM TUDUNK. Egy beállítás
   hiánya nem hibázik: a könyvtár az alapértelmezésével dolgozik tovább, és a
   következménye csak sokkal később, más alakban jelentkezik. Az ilyen beállítás
   ott kérhető számon, ahol átadjuk — máshol nincs is nyoma (l. CLAUDE.md, a néma
   minták 6. tétele). Ez a két teszt a kérés két ilyen beállítását rögzíti. */
describe("A kérés beállításai", () => {
    it("MINDEN kérésre jut időkorlát (különben a betöltő örökké pörögne)", async () => {
        /* Timeout NÉLKÜL egy néma szerver vagy megszakadt hálózat esetén a kérés
           örökké függne: sem a siker-, sem a hiba-ág nem futna le. Ez nem elméleti
           — pontosan ez okozta a törlés-modal "szellemének" örök töltését. A
           tesztek eddig SZÁNDÉKOSAN figyelmen kívül hagyták a config timeout
           mezőjét (objectContaining), hogy ne legyenek törékenyek; így viszont a
           sor törlésére egyetlen teszt sem bukott volna.

           A KONKRÉT értéket nem rögzítjük (az hangolási kérdés, nem szerződés),
           csak azt, hogy VAN és VÉGES. */
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "kérés"}));

        const config = postSpy().mock.calls[0]?.[2];
        expect(config?.timeout).toEqual(expect.any(Number));
        expect(config?.timeout).toBeGreaterThan(0);
        expect(Number.isFinite(config?.timeout)).toBe(true);
    });

    it("az aktivitás-figyelők PASSZÍVAK (nem akaszthatják meg a görgetést)", async () => {
        /* A passive: true azt ígéri a böngészőnek, hogy a kezelő nem hívja meg a
           preventDefault-ot — enélkül a görgetésnek meg kell VÁRNIA a JS-t, mielőtt
           mozdulna, ami telefonon akadozó görgetésként jelentkezik. Ez a fajta
           romlás sehol nem hibaüzenet, és a jelző a felkötés után visszaolvasható
           sem: csak itt, az átadásnál látszik. */
        const listenerSpy = vi.spyOn(window, "addEventListener");
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "belépés"}));

        /* A szűréshez SZÉLESÍTENI kell a lista típusát: az ACTIVITY_EVENTS a hat
           konkrét eseménynév uniója, az addEventListener kémje viszont akármilyen
           nevet láthat — a szűk típusú `includes` ezért nem fogadná el. A
           szélesítés nem `as`: a `readonly string[]` igaz állítás a listáról. */
        const activityNames: readonly string[] = ACTIVITY_EVENTS;
        const activityCalls = listenerSpy.mock.calls.filter(([name]) => activityNames.includes(name));
        expect(activityCalls.length, "Az aktivitás-figyelők fel sem lettek kötve.")
            .toBe(ACTIVITY_EVENTS.length);
        for (const [name, , options] of activityCalls)
            expect(options, `A(z) "${name}" figyelő nem passzív.`).toMatchObject({passive: true});

        listenerSpy.mockRestore();
    });
});

describe("A token sütijének beállításai", () => {
    it("a MUNKAMENETTEL él: nincs rajta lejárat", async () => {
        /* A `document.cookie` csak a nevet és az értéket adja vissza — a Max-Age,
           a Path és a SameSite onnan visszaolvashatatlan. Ezért a könyvtárnak
           átadott beállításokat kémleljük: az az egyetlen hely, ahol ez a döntés
           számon kérhető.

           A lejárat hiánya SZÁNDÉKOS, nem feledékenység: a token 15 perc után
           amúgy is érvénytelen (backend token.js), egy lemezen felejtett
           bejelentkezés viszont közös gépen valódi kockázat. A téma sütijei
           ezzel szemben tartósak (l. theme.test.tsx) — a kettő tudatosan
           különbözik. */
        const cookies = new Cookies();
        const setSpy = vi.spyOn(cookies, "set");
        render(
            <CookiesProvider cookies={cookies}>
                <AuthProvider><AuthProbe/></AuthProvider>
            </CookiesProvider>
        );

        await userEvent.click(screen.getByRole("button", {name: "belépés"}));

        const call = setSpy.mock.calls.find(([name]) => name === COOKIES.token);
        expect(call, "A bejelentkezés nem írt token-sütit.").toBeDefined();
        expect(call?.[2]).toMatchObject({path: "/", sameSite: "strict"});
        expect(call?.[2]).not.toHaveProperty("maxAge");
        expect(call?.[2]).not.toHaveProperty("expires");
    });
});

describe("A süti tartalma", () => {
    it("érvényes token esetén bejelentkezettként indul", () => {
        // Kontroll: enélkül a lenti két teszt attól is „zöld" lenne, hogy a
        // provider egyáltalán nem olvas sütit.
        document.cookie = "user=" + TOKEN + "; path=/";
        renderAuth();

        expect(screen.getByTestId("belepett")).toHaveTextContent("true");
        expect(screen.getByTestId("token")).toHaveTextContent(TOKEN);
    });

    it("OBJEKTUMMÁ alakuló (JSON) süti nem számít bejelentkezésnek", () => {
        /* A universal-cookie a JSON-nak látszó értéket objektumként adja vissza.
           Ellenőrzés nélkül ebből "Bearer [object Object]" fejléc lenne: a felület
           bejelentkezettnek látszana, a szerver viszont mindent elutasítana. */
        document.cookie = 'user={"a":1}; path=/';
        renderAuth();

        expect(screen.getByTestId("belepett")).toHaveTextContent("false");
    });

    it("TETSZŐLEGES SZÖVEG nem számít bejelentkezésnek", () => {
        /* Ez a kézzel átírt (vagy egy régi verziótól örökölt) süti esete.
           Ellenőrzés nélkül a felület bejelentkezettnek látszana, és csak az első
           kérés 401-e derítené ki az igazságot — addig a felhasználó a saját
           adatai helyett üres listákat látna. */
        document.cookie = "user=nem-egy-jwt; path=/";
        renderAuth();

        expect(screen.getByTestId("belepett")).toHaveTextContent("false");
    });

    it("HÁROM RÉSZES, de nem dekódolható érték sem elég", () => {
        /* A pontok száma önmagában semmit nem bizonyít: ez a teszt köti ki, hogy
           az ellenőrzés tényleg DEKÓDOLJA a középső részt, és a szerver
           állításait (id/iat/exp) keresi benne. */
        document.cookie = "user=abc.def.ghi; path=/";
        renderAuth();

        expect(screen.getByTestId("belepett")).toHaveTextContent("false");
    });

    it("ÜRES süti sem számít bejelentkezésnek", () => {
        document.cookie = "user=; path=/";
        renderAuth();

        expect(screen.getByTestId("belepett")).toHaveTextContent("false");
        /* A tokenre is ránézünk, nem csak a belépett-jelzőre: az üres szöveget a
           `Boolean("")` amúgy is hamisnak látná, tehát a fenti sor a séma
           `nonEmpty` szűkítése NÉLKÜL is átmenne. A "nincs" felirat viszont csak
           akkor jelenik meg, ha a token tényleg `null` (a próbakomponens
           `token ?? "nincs"`-e) — vagyis ha az üres sütit ELUTASÍTOTTUK, nem
           pedig üres tokenként fogadtuk el. */
        expect(screen.getByTestId("token")).toHaveTextContent("nincs");
    });
});

/* A HATÁR-ELLENŐRZÉS SZERZŐDÉSE. A hívók sémával szűkítik a választ (types/api.ts),
   a séma pedig DOB, ha a válasz nem illeszkedik. Hogy ez ne egy elszabaduló
   kivétel legyen, hanem kezelt eset, arra a handleAxios felépítése ad garanciát: a
   `then` a promise-láncban fut, tehát a benne dobott kivételt UGYANAZ a `.catch`
   fogja el, mint a hálózati hibát.

   Ez a garancia egyetlen sorrenden múlik (`.then(then).catch(…)`), és egy
   átrendezés némán elvenné — a sikerág egyszerűen elmaradna, a hibaág pedig soha
   nem futna. Ezért van rá teszt, nem csak komment. */
describe("Elutasított (értelmezhetetlen) válasz", () => {
    it("a séma bukása a HIBAÁGRA fut, nem szakad el a hívás", async () => {
        // A szerver a csupasz token helyett burkolót ad — pont az az elcsúszás,
        // ami ellen a séma van.
        postSpy().mockResolvedValue(axiosResponse({token: "burkolt"}));
        renderAuth();

        await userEvent.click(screen.getByRole("button", {name: "kérés-sémával"}));

        await waitFor(() => expect(screen.getByTestId("eredmeny")).toHaveTextContent("hibaág"));
    });

    it("az ÉRVÉNYES válasz a sikerágon, ellenőrzött értékkel érkezik", async () => {
        // Kontroll a fentihez: ugyanaz az út, jó alakú válasszal — enélkül a
        // "hibaág" felirat abból is jöhetne, hogy a hívás el sem indul.
        postSpy().mockResolvedValue(axiosResponse(TOKEN));
        renderAuth();

        await userEvent.click(screen.getByRole("button", {name: "kérés-sémával"}));

        await waitFor(() => expect(screen.getByTestId("eredmeny")).toHaveTextContent("siker: " + TOKEN));
    });

    it("NEM lépteti ki a felhasználót (az elutasított válasz nem 401)", async () => {
        /* A kiléptetés a hiba ALAKJÁRA néz (httpError.ts: van-e 401-es státusza),
           nem arra, ki dobta. Egy ValiErrornak nincs `response`-a, tehát a
           bejelentkezés érintetlen marad — a rossz alakú válasz nem munkamenet-hiba.
           Ha a felismerés valaha "minden hiba kiléptet"-re egyszerűsödne, ez bukik. */
        postSpy().mockResolvedValue(axiosResponse({token: "burkolt"}));
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "belépés"}));

        await userEvent.click(screen.getByRole("button", {name: "kérés-sémával"}));

        await waitFor(() => expect(screen.getByTestId("eredmeny")).toHaveTextContent("hibaág"));
        expect(screen.getByTestId("belepett")).toHaveTextContent("true");
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
        postSpy().mockClear();

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

    /* A megújított token EGYENESEN A SÜTIBE megy, tehát ez a válasz a legkényesebb
       az összes közül: ha a szerver egyszer mást ad (pl. {token: "…"} burkolót), a
       hibás érték kiszorítaná a működő tokent, és a következő kérés 401-gyel
       léptetne ki — látszólag ok nélkül. Ezért a séma itt is fut, a két teszt pedig
       együtt bizonyít: a második mutatja, hogy a megújítás egyáltalán ír sütit
       (enélkül az első attól is „zöld" lenne, hogy semmi nem történik). */
    const refreshOnActivity = async () => {
        await act(async () => vi.advanceTimersByTime(5 * 60 * 1000));
        await act(async () => {
            window.dispatchEvent(new MouseEvent("mousemove"));
        });
    };

    it("HIBÁS alakú megújítás után a RÉGI token marad", async () => {
        await signIn();
        postSpy().mockResolvedValue(axiosResponse({token: "burkolt"}));

        await refreshOnActivity();

        expect(screen.getByTestId("token")).toHaveTextContent(TOKEN);
    });

    it("ÉRVÉNYES megújítás a friss tokenre cseréli a sütit", async () => {
        await signIn();
        const refreshed = fakeToken("u-frissitett");
        postSpy().mockResolvedValue(axiosResponse(refreshed));

        await refreshOnActivity();

        expect(screen.getByTestId("token")).toHaveTextContent(refreshed);
    });
});
