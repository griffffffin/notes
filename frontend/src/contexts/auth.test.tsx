import {act, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import {useState} from "react";
import {Cookies, CookiesProvider} from "react-cookie";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {AuthProvider} from "./auth";
import {useAuth} from "./auth-context";
import {axiosResponse} from "../test/axiosResponse";
import {fakeToken} from "../test/fakeToken";
import {ENDPOINTS} from "../endpoints";
import {authTokenSchema, quoteListSchema} from "../types/api";
import {COOKIES} from "../cookies";
import {parseResponse} from "../contractFault";
import {ACTIVITY_EVENTS} from "../idle";
import {registerPendingSave} from "../pendingSave";
import {hasDraftKey} from "../draftCrypto";

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

/* A JELENTÉS TÖRZSÉBŐL a végpont — VALÓDI vizsgálattal, nem `as`-szal.

   A kém `unknown`-t ad (azt, amit a kód a hálózatra küldött volna), és ez a
   helyes: a teszt sem tudhatja előre, mi van benne. Egy `as {endpoint: string}`
   csak ÁLLÍTANÁ az alakot — ha a jelentés mezője egyszer átnevezésre kerülne, a
   teszt `undefined`-ot hasonlítana, és a hibaüzenet a végpontról szólna, nem a
   megváltozott törzsről. (A projekt lint-szabálya is ezt tiltja.) */
function reportedEndpoint(body: unknown): unknown {
    if (typeof body !== "object" || body === null || !("endpoint" in body)) return body;
    return body.endpoint;
}

/* Próbakomponens: kiírja, amit a Contextből kap, és gombokkal hívja a
   műveleteit — így a hookot komponensfa nélkül vizsgálhatjuk. */
function AuthProbe() {
    const {token, isLoggedIn, isLoggingOut, login, logout, handleAxios} = useAuth();
    /* A séma-ellenőrzés a HÍVÓ oldalán történik (l. types/api.ts): a próba ezért
       pontosan úgy jár el, ahogy egy valódi hívó — a választ átengedi a sémán, és
       az EREDMÉNYT írja ki. Így a teszt azt látja, melyik ág futott le. */
    const [outcome, setOutcome] = useState("még semmi");
    return (
        <div>
            <span data-testid="belepett">{String(isLoggedIn)}</span>
            <span data-testid="kilepes-alatt">{String(isLoggingOut)}</span>
            <span data-testid="token">{token ?? "nincs"}</span>
            <span data-testid="eredmeny">{outcome}</span>
            <button onClick={() => handleAxios(ENDPOINTS.login, {}, 
                (response) => setOutcome("siker: " +
                    parseResponse(authTokenSchema, response.data, ENDPOINTS.login)),
                () => setOutcome("hibaág"))}>kérés-sémával</button>
            <button onClick={() => login(TOKEN)}>belépés</button>
            <button onClick={logout}>kilépés</button>
            <button onClick={() => handleAxios(ENDPOINTS.todos, {a: 1}, () => {}, () => {})}>kérés</button>
            {/* MÁSIK végpont, sémával. Azért kell külön, mert a szerződés-hiba
                jelentése végpontonként EGYSZER megy el (contractFault.ts): ha a
                jelentést vizsgáló teszt ugyanazt a végpontot használná, mint a
                fenti "kérés-sémával" gomb, akkor a sorrendjüktől függene, melyik
                látja a jelentést — a teszt hol zöld, hol piros lenne. */}
            <button onClick={() => handleAxios(ENDPOINTS.quotes, {},
                (response) => setOutcome("siker: " +
                    parseResponse(quoteListSchema, response.data, ENDPOINTS.quotes).length),
                () => setOutcome("hibaág"))}>idézet-kérés sémával</button>
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
    /* AZ ALAPÉRTELMEZETT VÁLASZ VALÓDI ALAKÚ TOKEN. Korábban egy "ok" szöveg volt,
       ami egyik végpont válaszára sem hasonlít: a /login és a /refresh JWT-t ad. A
       különbség nem elméleti volt — a séma minden ilyen válasznál elutasított,
       vagyis a tesztek észrevétlenül SZERZŐDÉS-HIBÁKAT gyártottak, és az azokat
       vizsgáló teszt már csak a (végpontonként egyszeri) jelentés hiányát látta.
       A mock a valóságot tükrözze; amelyik teszt rossz alakot akar, mondja ki. */
    postSpy().mockResolvedValue(axiosResponse(fakeToken("u-alapertelmezett")));
});

afterEach(() => {
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
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
        expect(document.cookie).toContain("token=" + TOKEN);
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

        /* Token nélkül NINCS Authorization fejléc. A vizsgálat a VISELKEDÉST köti, nem
           az alakot: korábban `headers: undefined` ment a configban, az
           exactOptionalPropertyTypes óta a KULCS is kimarad (auth.tsx) — a kettő
           között a felhasználó felé nincs különbség, tehát nem szerződés. Ami
           szerződés: ne menjen fejléc. Az `expect.anything()` nem illeszkedik az
           `undefined`-ra, ezért ez az állítás MINDKÉT alakot elfogadja, egy valódi
           Authorization fejlécet viszont elutasít. */
        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining(ENDPOINTS.todos), {a: 1},
            expect.not.objectContaining({headers: expect.anything()}));
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

    /* A PISZKOZAT-KULCS LEKÉRÉSE a munkamenethez tartozik, ezért az AuthProvider
       indítja (useDraftKeySession). A kulcs életciklusának SZABÁLYAIT a hook saját
       tesztje vizsgálja (draftKeySession.test.tsx); ITT csak egyetlen, de néma
       módon elromló dolgot: hogy a hívás egyáltalán megtörténik-e. A hook hívását
       kivéve semmi nem hibázna — a felület ugyanúgy nézne ki, csak a mentetlen
       munka védelme szűnne meg csendben. */
    it("bejelentkezéskor lekéri a piszkozat-titkosítás kulcsát", async () => {
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "belépés"}));

        await waitFor(() => expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining(ENDPOINTS.draftKey), {},
            expect.objectContaining({headers: {Authorization: "Bearer " + TOKEN}})));
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
        document.cookie = "token=" + TOKEN + "; path=/";
        renderAuth();

        expect(screen.getByTestId("belepett")).toHaveTextContent("true");
        expect(screen.getByTestId("token")).toHaveTextContent(TOKEN);
    });

    it("OBJEKTUMMÁ alakuló (JSON) süti nem számít bejelentkezésnek", () => {
        /* A universal-cookie a JSON-nak látszó értéket objektumként adja vissza.
           Ellenőrzés nélkül ebből "Bearer [object Object]" fejléc lenne: a felület
           bejelentkezettnek látszana, a szerver viszont mindent elutasítana. */
        document.cookie = 'token={"a":1}; path=/';
        renderAuth();

        expect(screen.getByTestId("belepett")).toHaveTextContent("false");
    });

    it("TETSZŐLEGES SZÖVEG nem számít bejelentkezésnek", () => {
        /* Ez a kézzel átírt (vagy egy régi verziótól örökölt) süti esete.
           Ellenőrzés nélkül a felület bejelentkezettnek látszana, és csak az első
           kérés 401-e derítené ki az igazságot — addig a felhasználó a saját
           adatai helyett üres listákat látna. */
        document.cookie = "token=nem-egy-jwt; path=/";
        renderAuth();

        expect(screen.getByTestId("belepett")).toHaveTextContent("false");
    });

    it("HÁROM RÉSZES, de nem dekódolható érték sem elég", () => {
        /* A pontok száma önmagában semmit nem bizonyít: ez a teszt köti ki, hogy
           az ellenőrzés tényleg DEKÓDOLJA a középső részt, és a szerver
           állításait (id/iat/exp) keresi benne. */
        document.cookie = "token=abc.def.ghi; path=/";
        renderAuth();

        expect(screen.getByTestId("belepett")).toHaveTextContent("false");
    });

    it("ÜRES süti sem számít bejelentkezésnek", () => {
        document.cookie = "token=; path=/";
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

/* A SZERZŐDÉS-HIBA ÚTJA VÉGIG, a valódi handleAxios-on. A contractFault.ts saját
   tesztje a gépezetet méri (jelöl, értesít, jelent); ez azt méri, hogy a lánc
   ÖSSZE IS VAN KÖTVE — a hívási helyen dobott hiba tényleg eljut a handleAxios
   catch-ágába, és onnan a jelentésig. Ez a kötés egyetlen sor, amit egy refaktor
   némán kivehet: a tesztek attól még zöldek maradnának, csak élesben nem tudnánk
   meg soha, hogy elromlott a szerződés. */
describe("Szerződés-hiba a handleAxios hibaágán", () => {
    /* A jelentést a /client-error végpontra menő KÉRÉSEN figyeljük meg — ugyanaz
       az axios-kém, amivel a többi teszt is dolgozik. Ez azt is méri, ami a
       felhasználó felé nem látszik: hogy a hiba tényleg eljut a szerver naplójáig. */
    const reportedEndpoints = () => postSpy().mock.calls
        .filter(([url]) => String(url).endsWith(ENDPOINTS.clientError))
        .map(([, body]) => reportedEndpoint(body));

    it("a séma bukása szerződés-hibaként jelentődik, a végpont nevével", async () => {
        // A válasz nem JWT-alakú: a próba parseResponse-a el fogja utasítani.
        postSpy().mockResolvedValue(axiosResponse("nem-egy-jwt"));
        renderAuth();

        await userEvent.click(screen.getByRole("button", {name: "idézet-kérés sémával"}));

        await waitFor(() => expect(reportedEndpoints()).toEqual([ENDPOINTS.quotes]));
        // A hívási hely saját hibaága ATTÓL FÜGGETLENÜL lefut — a kettő nem váltja ki egymást.
        expect(screen.getByTestId("eredmeny")).toHaveTextContent("hibaág");
    });

    it("a HÁLÓZATI hiba NEM szerződés-hiba (kontroll)", async () => {
        /* Enélkül a fenti teszt abból is zöld lehetne, hogy MINDEN hibát
           jelentünk — és akkor minden hálózati zökkenő a szerver naplójába
           kerülne, ami pont a napló használhatóságát venné el. */
        postSpy().mockRejectedValue(new Error("Network Error"));
        renderAuth();

        await userEvent.click(screen.getByRole("button", {name: "kérés-sémával"}));

        await waitFor(() => expect(screen.getByTestId("eredmeny")).toHaveTextContent("hibaág"));
        expect(reportedEndpoints()).toEqual([]);
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
        /* A megújítás válasza VALÓDI ALAKÚ token. Korábban itt a beforeEach
           általános "ok" szövege maradt, ami nem JWT — a séma elutasította, és a
           teszt észrevétlenül szerződés-hibát gyártott (jelentéssel együtt). A
           mock a valóságot tükrözze: ez a végpont tokent ad. */
        postSpy().mockResolvedValue(axiosResponse(fakeToken("u-megujitott")));
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

    it("HIBÁS alakú megújítás után a RÉGI token marad, és a hiba JELENTŐDIK", async () => {
        /* A két állítás SZÁNDÉKOSAN egy tesztben van. Külön írva a második attól
           függne, melyikük fut előbb: a szerződés-hibát végpontonként EGYSZER
           jelentjük (contractFault.ts), tehát a másodikként futó teszt már nem
           látná a jelentést. Egy teszt, egy megújítás, két következmény.

           Miért fontos a jelentés épp itt: a megújítás a HÁTTÉRBEN fut, a
           felhasználó tudta nélkül — ez a legkönnyebben elnémuló út. Ráadásul nem
           a handleAxios-on megy (nem akarunk tőle 401-kiléptetést), tehát a
           jelentést kézzel kötöttük be; ha valaki kiveszi, ez a teszt bukik. */
        await signIn();
        postSpy().mockResolvedValue(axiosResponse({token: "burkolt"}));

        await refreshOnActivity();

        expect(screen.getByTestId("token")).toHaveTextContent(TOKEN);
        const reported = postSpy().mock.calls
            .filter(([url]) => String(url).endsWith(ENDPOINTS.clientError))
            .map(([, body]) => reportedEndpoint(body));
        expect(reported).toEqual([ENDPOINTS.refresh]);
    });

    it("ÉRVÉNYES megújítás a friss tokenre cseréli a sütit", async () => {
        await signIn();
        const refreshed = fakeToken("u-frissitett");
        postSpy().mockResolvedValue(axiosResponse(refreshed));

        await refreshOnActivity();

        expect(screen.getByTestId("token")).toHaveTextContent(refreshed);
    });
});

/* A KIJELENTKEZÉS MEGVÁRJA A FÜGGŐ MENTÉST (2026-08-19).

   A szerkesztőből NAVIGÁLNI csak mentés után lehet (blocker); a kijelentkezés
   viszont nem navigáció, tehát eddig azonnal eldobta a munkamenetet, és a mentés
   a leválás pillanatában, a háttérben indult. Most ugyanaz a szabály él rá.

   A SORRENDET mérjük, nem csak azt, hogy "lefutott": a mentésnek AKKOR kell
   lefutnia, amikor a token még megvan — különben ugyanott vagyunk, ahol
   voltunk. */
describe("Kijelentkezés és a függő mentés", () => {
    it("a mentés a token TÖRLÉSE ELŐTT fut le", async () => {
        let tokenAtSave: string | null = null;
        const unregister = registerPendingSave(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            tokenAtSave = document.cookie.includes(COOKIES.token + "=") ? "megvan" : "törölve";
        });
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "belépés"}));
        await waitFor(() => expect(screen.getByTestId("belepett")).toHaveTextContent("true"));

        await userEvent.click(screen.getByRole("button", {name: "kilépés"}));

        await waitFor(() => expect(screen.getByTestId("belepett")).toHaveTextContent("false"));
        expect(tokenAtSave).toBe("megvan");
        unregister();
    });
});

/* A PISZKOZAT-KULCS ÉS A KIJELENTKEZÉS (2026-08-22).

   A kulcs a memóriában él (draftCrypto.ts), és a kijelentkezés eldobja — DE CSAK
   AKKOR, amikor a függő mentések tényleg véget értek. A két időpont
   SZÁNDÉKOSAN nem ugyanaz: a felhasználót legfeljebb 3 másodpercig várakoztatjuk
   (pendingSave.ts), az újrapróbálás viszont tovább tart, és a végén épp az a
   PISZKOZAT születik meg, ami a mentetlen munkát őrzi. Kulcs nélkül azt nem
   lehetne kiírni — vagyis a korai eldobás ADATVESZTÉS volna.

   A késleltetés mégsem "örökké": amint a láncok lefutottak, a kulcsnak nincs
   több dolga a memóriában (egy nyitva felejtett lapon a devtools kiolvashatná). */
describe("Kijelentkezés és a piszkozat-kulcs", () => {
    /* A KULCSOT A SAJÁT ÚTJÁN KAPJA MEG a próba: a bejelentkezés után az
       AuthProvider lekéri (/drafts/key), és a válasz egy 32 bájtos base64 kulcs.
       Kézzel beállítani nem lehetne: az új munkamenet kezdetén a kód SZÁNDÉKOSAN
       eldobja a memóriában talált (előző fiókhoz tartozó) kulcsot. */
    const DRAFT_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(5)));

    /* A regisztrált mentéseket akkor is le kell szedni, ha a teszt közben elhasal
       — különben a bent maradt, sosem teljesülő mentés a KÖVETKEZŐ tesztek
       kijelentkezését akasztja meg. (Mérve: pontosan ez történt, három
       egyébként ép teszt bukott el tőle.) */
    const cleanups: (() => void)[] = [];
    const registerSave = (save: () => Promise<void>) => { cleanups.push(registerPendingSave(save)); };

    beforeEach(() => {
        postSpy().mockImplementation((url) => Promise.resolve(
            typeof url === "string" && url.includes(ENDPOINTS.draftKey)
                ? axiosResponse(DRAFT_KEY)
                : axiosResponse(TOKEN)));
    });

    afterEach(() => {
        cleanups.splice(0).forEach((unregister) => { unregister(); });
    });

    it("a HATÁRIDŐ letelte után is megtartja, amíg a mentés fut — és utána dobja el", async () => {
        /* VALÓDI ÓRÁVAL fut (a 3 másodperces határidőt kivárjuk), mert épp a két
           időpont KÜLÖNBSÉGE a tárgy. Hamis órával írtam meg először: a
           `userEvent` és a `waitFor` együtt nem működött vele, a teszt 15
           másodperces időtúllépésbe futott, és a bent felejtett hamis óra még
           három másik tesztet is megakasztott. */
        let release = () => {};
        registerSave(() => new Promise<void>((resolve) => { release = resolve; }));
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "belépés"}));
        await waitFor(() => expect(hasDraftKey()).toBe(true));

        await userEvent.click(screen.getByRole("button", {name: "kilépés"}));
        // A határidő letelt: a FELÜLET kijelentkezett — a mentés viszont még fut.
        await waitFor(() => expect(screen.getByTestId("belepett")).toHaveTextContent("false"),
            {timeout: 5000});
        expect(hasDraftKey(), "A kulcs a futó mentés alól tűnt el: a piszkozatot már nem lehetne kiírni.")
            .toBe(true);

        await act(async () => { release(); await Promise.resolve(); });

        await waitFor(() => expect(hasDraftKey()).toBe(false));
    });

    it("mentenivaló nélkül AZONNAL eldobja", async () => {
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "belépés"}));
        await waitFor(() => expect(hasDraftKey()).toBe(true));

        await userEvent.click(screen.getByRole("button", {name: "kilépés"}));

        await waitFor(() => expect(hasDraftKey()).toBe(false));
    });
});

/* A KIJELENTKEZÉS JELZŐJE — késleltetve (2026-08-19).

   A kijelentkezés megvárja a szerkesztő mentését. Egészséges esetben ez
   századmásodperc, tehát egy azonnal megjelenő karika csak VILLANNA — ezért a
   jelző 300 ms után gyullad ki. A tesztek az órát tekerik, nem várnak. */
describe("A kijelentkezés jelzője", () => {
    it("GYORS mentésnél NEM gyullad ki (nem villan a karika)", async () => {
        const unregister = registerPendingSave(async () => {});
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "belépés"}));
        await waitFor(() => expect(screen.getByTestId("belepett")).toHaveTextContent("true"));

        await userEvent.click(screen.getByRole("button", {name: "kilépés"}));

        await waitFor(() => expect(screen.getByTestId("belepett")).toHaveTextContent("false"));
        expect(screen.getByTestId("kilepes-alatt")).toHaveTextContent("false");
        unregister();
    });

    it("LASSÚ mentésnél kigyullad, és a végén elalszik", async () => {
        let release = () => {};
        const unregister = registerPendingSave(() => new Promise<void>((resolve) => { release = resolve; }));
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "belépés"}));
        await waitFor(() => expect(screen.getByTestId("belepett")).toHaveTextContent("true"));

        await userEvent.click(screen.getByRole("button", {name: "kilépés"}));
        await waitFor(() => expect(screen.getByTestId("kilepes-alatt")).toHaveTextContent("true"));

        await act(async () => { release(); await Promise.resolve(); });

        await waitFor(() => expect(screen.getByTestId("belepett")).toHaveTextContent("false"));
        expect(screen.getByTestId("kilepes-alatt")).toHaveTextContent("false");
        unregister();
    });
});
