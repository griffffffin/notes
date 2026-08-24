import {act, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import {useState} from "react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {AuthProvider} from "./auth";
import {useAuth} from "./auth-context";
import {axiosResponse} from "../test/axiosResponse";
import {ENDPOINTS} from "../endpoints";
import {sessionSchema, quoteListSchema} from "../types/api";
import {parseResponse} from "../contractFault";
import {ACTIVITY_EVENTS} from "../idle";
import {registerPendingSave} from "../pendingSave";
import {hasDraftKey} from "../draftCrypto";
import {reloadToRoot} from "../reload";

/* Az axios AUTOMOCKOLVA: a modul minden exportja kémmé válik, tehát valódi
   hálózat nincs, de az AuthProvider (és benne a handleAxios) a maga teljes
   valójában fut — épp az a vizsgálat tárgya.

   A `post`-ot NEM értékadással cseréljük ki: a típusa generikus (`post<T, R, D>`),
   vagyis olyan függvényt vár, ami BÁRMELY R-re működik — egy `vi.fn(() =>
   Promise.resolve(…))` viszont egy konkrétat ad, és a fordító ezt (helyesen)
   elutasítja. A `vi.mocked` az automock kémjét adja vissza a valódi szignatúrával,
   a válaszokat pedig a mockResolvedValue/mockRejectedValue állítja be. */
vi.mock(import("axios"));

/* A TELJES ÚJRATÖLTÉS AUTOMOCKOLVA. Nem kényelmi lépés: a jsdom nem valósítja meg
   a navigációt, tehát a valódi `location.href = "/"` itt nem csinál semmit — és
   ami rosszabb, épp az AZONOS címre mutat, amin a teszt amúgy is áll, tehát még
   egy "Not implemented" figyelmeztetést sem hagy maga után. Vagyis mockolás
   nélkül a tesztek zöldek maradnának akkor is, ha az újratöltés teljesen kimarad
   (l. reload.ts). */
vi.mock(import("../reload"));

const postSpy = () => vi.mocked(axios.post);

/* A MUNKAMENET, ahogy a szerver leírja. Token SEHOL nem szerepel a tesztekben
   sem — HttpOnly sütiben él, amit sem a kód, sem a teszt nem lát (a süti-jelzőket
   a backend session.test.js őrzi). A felület számára a munkamenet ennyi: egy név,
   ami megérkezett. */
const SESSION = {name: "anna"};

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
    const {session, isSessionKnown, sessionFailed, retrySession, isLoggedIn, isLoggingOut,
        showsLogoutSpinner, logoutFailed, login, logout, handleAxios} = useAuth();
    /* A séma-ellenőrzés a HÍVÓ oldalán történik (l. types/api.ts): a próba ezért
       pontosan úgy jár el, ahogy egy valódi hívó — a választ átengedi a sémán, és
       az EREDMÉNYT írja ki. Így a teszt azt látja, melyik ág futott le. */
    const [outcome, setOutcome] = useState("még semmi");
    return (
        <div>
            <span data-testid="belepett">{String(isLoggedIn)}</span>
            {/* MEGÉRKEZETT-E MÁR a /me válasza. A "még nem tudjuk" külön állapot:
                nem szabad kijelentkezettnek mutatni (l. contexts/auth.tsx). */}
            <span data-testid="tudjuk">{String(isSessionKnown)}</span>
            <span data-testid="lekeres-bukott">{String(sessionFailed)}</span>
            <span data-testid="kilepes-bukott">{String(logoutFailed)}</span>
            <span data-testid="nev">{session?.name ?? "nincs"}</span>
            {/* A KARIKA jelzője (késleltetett) és a FOLYAMAT jelzője (azonnali)
                külön: a tesztek szándéka szerint a "kilepes-alatt" mindig a
                karikáról szólt, az azonnali pedig azért kell, mert a navbar
                kurzora abból dolgozik (l. components/app.tsx). */}
            <span data-testid="kilepes-alatt">{String(showsLogoutSpinner)}</span>
            <span data-testid="kilepes-fut">{String(isLoggingOut)}</span>
            <span data-testid="eredmeny">{outcome}</span>
            <button onClick={() => handleAxios(ENDPOINTS.login, {}, 
                (response) => setOutcome("siker: " +
                    parseResponse(sessionSchema, response.data, ENDPOINTS.login).name),
                () => setOutcome("hibaág"))}>kérés-sémával</button>
            <button onClick={() => login(SESSION)}>belépés</button>
            <button onClick={retrySession}>újra</button>
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
        </div>
    );
}

/* NINCS CookiesProvider: az AuthProvider egyetlen sütit sem olvas és nem is ír —
   a munkamenet sütije a szerveré, HttpOnly (l. backend/src/tokenCookie.js). */
const renderAuth = () => render(<AuthProvider><AuthProbe/></AuthProvider>);

/* A "bizonyítottan nincs munkamenet" válasz. A 401 az EGYETLEN olyan hiba, amiből
   kijelentkezettségre következtetünk — minden más (hálózat, időtúllépés) csak
   annyit jelent, hogy most nem tudjuk (l. contexts/auth.tsx). */
const unauthorized = () => ({response: {status: 401}});

const isEndpoint = (url: unknown, endpoint: string) =>
    typeof url === "string" && url.endsWith(endpoint);

beforeEach(() => {
    postSpy().mockReset();
    /* AZ ALAPÁLLAPOT: KIJELENTKEZETT, DE MÁR TUDOTT. A provider minden induláskor
       megkérdezi a szervert (POST /me) — a tesztek nagy része kijelentkezve indul,
       és a "belépés" gombbal lép be, ezért a /me alapból 401-et ad.

       A MOCK A VALÓSÁGOT TÜKRÖZZE: a többi hívás a MUNKAMENET alakját adja
       ({name}), mert ma azt adja a /login, a /me és a /refresh is. Korábban itt egy
       JWT állt — akkor az volt a valóság. Rossz alakkal a tesztek észrevétlenül
       SZERZŐDÉS-HIBÁKAT gyártanának, és az azokat vizsgáló teszt már csak a
       (végpontonként egyszeri) jelentés hiányát látná. */
    postSpy().mockImplementation((url) => isEndpoint(url, ENDPOINTS.me)
        ? Promise.reject(unauthorized())
        : Promise.resolve(axiosResponse(SESSION)));
});

describe("AuthProvider", () => {
    it("a /me 401-jére kijelentkezett állapotba kerül", async () => {
        renderAuth();

        await waitFor(() => {
            expect(screen.getByTestId("tudjuk")).toHaveTextContent("true");
            expect(screen.getByTestId("belepett")).toHaveTextContent("false");
        });
    });

    it("a /me válaszából bejelentkezettként indul — újratöltés után is", async () => {
        /* EZ AZ ÚJ ALAPESET. Amíg a token JS-ből olvasható sütiben élt, a
           bejelentkezettség a lap betöltésekor azonnal tudható volt. Most a
           szervertől kérdezzük meg — ha ez a lekérés kimaradna, minden
           oldalfrissítés kidobná a felhasználót, holott a munkamenete él. */
        postSpy().mockImplementation(() => Promise.resolve(axiosResponse(SESSION)));

        renderAuth();

        await waitFor(() => {
            expect(screen.getByTestId("belepett")).toHaveTextContent("true");
            expect(screen.getByTestId("nev")).toHaveTextContent(SESSION.name);
        });
    });

    it("amíg a válasz úton van, NEM állítja, hogy kijelentkezett", async () => {
        /* A HARMADIK ÁLLAPOT. A "még nem tudjuk" és a "nincs munkamenet" két
           különböző dolog: ha összemosnánk, a felület minden induláskor
           felvillantaná a belépő képernyőt annak is, aki be van jelentkezve. */
        let answer = () => {};
        postSpy().mockImplementation(() => new Promise((resolve) => {
            answer = () => resolve(axiosResponse(SESSION));
        }));

        renderAuth();

        expect(screen.getByTestId("tudjuk")).toHaveTextContent("false");
        await act(async () => { answer(); await Promise.resolve(); });
        await waitFor(() => expect(screen.getByTestId("belepett")).toHaveTextContent("true"));
    });

    it("HÁLÓZATI hiba a /me-nél nem kijelentkeztet, hanem újrapróbálhatóvá tesz", async () => {
        /* A 401 azt jelenti, hogy a szerver MEGMONDTA: nincs munkamenet. Egy
           megszakadt hálózat vagy egy alvó szerver ellenben semmit nem mond a
           munkamenetről — abból kijelentkeztetni azt, aki be van jelentkezve,
           néma hazugság volna. */
        postSpy().mockImplementation(() => Promise.reject(new Error("Network Error")));

        renderAuth();

        await waitFor(() => {
            expect(screen.getByTestId("lekeres-bukott")).toHaveTextContent("true");
            expect(screen.getByTestId("tudjuk")).toHaveTextContent("false");
        });
    });

    it("az újrapróbálás sikere bejelentkezettséget hoz", async () => {
        /* A kapunak KIÚTJA is van, nem csak jelzése: egy múló hiba után a
           felhasználó egy kattintással visszatalál. */
        postSpy().mockImplementation(() => Promise.reject(new Error("Network Error")));
        renderAuth();
        await waitFor(() => expect(screen.getByTestId("lekeres-bukott")).toHaveTextContent("true"));
        postSpy().mockImplementation(() => Promise.resolve(axiosResponse(SESSION)));

        await userEvent.click(screen.getByRole("button", {name: "újra"}));

        await waitFor(() => {
            expect(screen.getByTestId("belepett")).toHaveTextContent("true");
            expect(screen.getByTestId("lekeres-bukott")).toHaveTextContent("false");
        });
    });

    it("belépés után bejelentkezett, /me kör nélkül", async () => {
        /* A bejelentkezés válasza MAGA a munkamenet — nem kell utána megkérdezni,
           hogy be vagyunk-e lépve. */
        renderAuth();
        await waitFor(() => expect(screen.getByTestId("tudjuk")).toHaveTextContent("true"));

        await userEvent.click(screen.getByRole("button", {name: "belépés"}));

        expect(screen.getByTestId("belepett")).toHaveTextContent("true");
        expect(screen.getByTestId("nev")).toHaveTextContent(SESSION.name);
    });

    it("MINDEN kérés viszi a sütit, tokent viszont nem", async () => {
        /* A `withCredentials` nélkül a böngésző cross-origin kérésnél NEM csatolja
           a sütit — a fejlesztői felállásban (Vite 5173, API 3001) tehát minden
           kérés hitelesítetlen volna, némán. A hiánya éles buildben nem látszik,
           fejlesztésben viszont az egész appot használhatatlanná teszi.

           A MÁSIK ÁLLÍTÁS a fontosabb: NINCS Authorization fejléc. Ha egyszer
           visszakerülne, az azt jelentené, hogy a token megint megfordul a
           JavaScriptben — és a HttpOnly süti egész haszna elveszne. */
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "belépés"}));

        await userEvent.click(screen.getByRole("button", {name: "kérés"}));

        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining(ENDPOINTS.todos), {a: 1},
            expect.objectContaining({withCredentials: true}));
        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining(ENDPOINTS.todos), {a: 1},
            expect.not.objectContaining({headers: expect.anything()}));
    });

    it("kilépés után visszaáll kijelentkezettre", async () => {
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "belépés"}));

        await userEvent.click(screen.getByRole("button", {name: "kilépés"}));

        await waitFor(() => expect(screen.getByTestId("belepett")).toHaveTextContent("false"));
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
            expect.objectContaining({withCredentials: true})));
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

        const config = postSpy().mock.calls
            .find(([url]) => isEndpoint(url, ENDPOINTS.todos))?.[2];
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

/* A TOKEN SÜTIJÉNEK TESZTJEI INNEN ELKERÜLTEK, nem elvesztek.

   Két blokk állt itt: a süti BEÁLLÍTÁSAI (httpOnly-nak akkor még nem lehetett
   lennie, de a lejárat, a path és a sameSite igen) és a süti TARTALMA (mi számít
   érvényes tokennek, ha a felhasználó vagy egy kiegészítő átírja). Mindkettő azért
   volt itt, mert a sütit a KLIENS írta és olvasta.

   Ma a szerver írja, HttpOnly-ként — a JavaScript hozzá sem fér, tehát nincs mit
   ellenőrizni rajta ezen az oldalon. A megfelelőjük a backendben él:
   `src/tokenCookie.test.js` (a jelzők és a név pontos illesztése) és
   `src/controllers/Users/session.test.js` (a kiadás, a megújítás és a törlés
   szerződése, benne azzal, hogy a token NEM kerülhet a válasz törzsébe). */

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
        postSpy().mockResolvedValue(axiosResponse(SESSION));
        renderAuth();

        await userEvent.click(screen.getByRole("button", {name: "kérés-sémával"}));

        await waitFor(() =>
            expect(screen.getByTestId("eredmeny")).toHaveTextContent("siker: " + SESSION.name));
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

    it("aktivitáskor megújítja a munkamenetet, de legfeljebb 5 percenként", async () => {
        await signIn();
        /* A megújítás válasza a MUNKAMENET alakja. A token nincs benne: azt a
           szerver a sütiben frissíti (backend/src/controllers/Users/refresh.js).
           A mock a valóságot tükrözze — rossz alakkal a teszt észrevétlenül
           szerződés-hibát gyártana, jelentéssel együtt. */
        postSpy().mockResolvedValue(axiosResponse(SESSION));
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

    /* A MEGÚJÍTÁS A HÁTTÉRBEN FUT, a felhasználó tudta nélkül — ez a legkönnyebben
       elnémuló út az egész appban. A tokent ma a szerver frissíti a sütiben, tehát
       az nem figyelhető meg innen; ami IGEN, az a válasz alakja és a belőle vett
       munkamenet. A két teszt együtt bizonyít: a második mutatja, hogy a megújítás
       egyáltalán ELFOGADJA a választ (enélkül az első attól is „zöld" lenne, hogy
       semmi nem történik). */
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
        postSpy().mockResolvedValue(axiosResponse({user: "burkolt"}));

        await refreshOnActivity();

        expect(screen.getByTestId("nev"),
            "a hibás alakú válasz kiszorította a működő munkamenetet").toHaveTextContent(SESSION.name);
        const reported = postSpy().mock.calls
            .filter(([url]) => String(url).endsWith(ENDPOINTS.clientError))
            .map(([, body]) => reportedEndpoint(body));
        expect(reported).toEqual([ENDPOINTS.refresh]);
    });

    it("ÉRVÉNYES megújítás a friss munkamenetet veszi át", async () => {
        await signIn();
        postSpy().mockResolvedValue(axiosResponse({name: "atnevezett"}));

        await refreshOnActivity();

        expect(screen.getByTestId("nev")).toHaveTextContent("atnevezett");
    });
});

/* A KIJELENTKEZÉS MEGVÁRJA A FÜGGŐ MENTÉST (2026-08-19).

   A szerkesztőből NAVIGÁLNI csak mentés után lehet (blocker); a kijelentkezés
   viszont nem navigáció, tehát eddig azonnal eldobta a munkamenetet, és a mentés
   a leválás pillanatában, a háttérben indult. Most ugyanaz a szabály él rá.

   A SORRENDET mérjük, nem csak azt, hogy "lefutott": a mentésnek AKKOR kell
   lefutnia, amikor a munkamenet még él. A süti óta ez konkrétan azt jelenti, hogy
   a VISSZAVONÁS (POST /logout) még nem ment el — az növeli a munkamenet-verziót,
   amitől a még úton lévő mentés 401-et kapna, és pontosan az a munka veszne el,
   amiért az egész várakozás van. */
describe("Kijelentkezés és a függő mentés", () => {
    it("a mentés a VISSZAVONÁS előtt fut le", async () => {
        let tokenAtSave: string | null = null;
        const unregister = registerPendingSave(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            const revoked = postSpy().mock.calls
                .some(([url]) => typeof url === "string" && url.endsWith(ENDPOINTS.logout));
            tokenAtSave = revoked ? "törölve" : "megvan";
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
                : axiosResponse(SESSION)));
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
    /* A REGISZTRÁLT MENTÉST AKKOR IS LE KELL SZEDNI, HA A TESZT ELHASAL. A záró
       `unregister()` egy elbukó állítás után már nem fut le, a bent maradt,
       sosem teljesülő mentés pedig a KÖVETKEZŐ tesztek kijelentkezését akasztja
       meg — ilyenkor egyetlen valódi hiba fél tucat ép tesztet dönt magával, és
       a hibaüzenetek arról szólnak, aminek semmi köze a bajhoz. (Ugyanez a minta
       a piszkozat-kulcs blokkjában, ott is mérésből.) */
    const cleanups: (() => void)[] = [];
    const registerSave = (save: () => Promise<void>) => { cleanups.push(registerPendingSave(save)); };
    afterEach(() => { cleanups.splice(0).forEach((unregister) => { unregister(); }); });

    it("GYORS mentésnél NEM gyullad ki (nem villan a karika)", async () => {
        registerSave(async () => {});
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "belépés"}));
        await waitFor(() => expect(screen.getByTestId("belepett")).toHaveTextContent("true"));

        await userEvent.click(screen.getByRole("button", {name: "kilépés"}));

        await waitFor(() => expect(screen.getByTestId("belepett")).toHaveTextContent("false"));
        expect(screen.getByTestId("kilepes-alatt")).toHaveTextContent("false");
    });

    it("a FOLYAMAT jelzője azonnal igaz, miközben a karika még nem gyulladt ki", async () => {
        /* Ez a kettő KÜLÖNBSÉGE, és a különbség hordoz jelentést: a karika
           villanása zavaró volna, a kurzoré nem — ezért nem várhatnak ugyanannyit.
           Ebben a résben (a kattintás után, a 300 ms letelte előtt) a navbar még
           teljes egészében látszik, és a linkjeinek MÁR nem szabad kézzel
           hívogatniuk (l. components/app.test.tsx). */
        let release = () => {};
        registerSave(() => new Promise<void>((resolve) => { release = resolve; }));
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "belépés"}));
        await waitFor(() => expect(screen.getByTestId("belepett")).toHaveTextContent("true"));

        await userEvent.click(screen.getByRole("button", {name: "kilépés"}));

        /* EGY pillanatot kérdezünk, két állítással: a külön szinkron negatív
           állítás terhelés alatt elcsúszhatna (a 300 ms közben letelik). */
        await waitFor(() => {
            expect(screen.getByTestId("kilepes-fut")).toHaveTextContent("true");
            expect(screen.getByTestId("kilepes-alatt")).toHaveTextContent("false");
        });

        await act(async () => { release(); await Promise.resolve(); });
    });

    it("LASSÚ mentésnél kigyullad, és a végén elalszik", async () => {
        let release = () => {};
        registerSave(() => new Promise<void>((resolve) => { release = resolve; }));
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "belépés"}));
        await waitFor(() => expect(screen.getByTestId("belepett")).toHaveTextContent("true"));

        await userEvent.click(screen.getByRole("button", {name: "kilépés"}));
        await waitFor(() => expect(screen.getByTestId("kilepes-alatt")).toHaveTextContent("true"));

        await act(async () => { release(); await Promise.resolve(); });

        await waitFor(() => expect(screen.getByTestId("belepett")).toHaveTextContent("false"));
        expect(screen.getByTestId("kilepes-alatt")).toHaveTextContent("false");
    });
});

/* A KIJELENTKEZÉS SZERVEROLDALI FELE ÉS A TELJES ÚJRATÖLTÉS (2026-08-24).

   Eddig a kijelentkezés a süti eldobásából állt. A token ettől még élt a
   lejáratáig, a /refresh pedig minden érvényes tokenért frisset adott — egy
   lemásolt munkamenetet tehát semmi nem zavart meg. A /logout ezt vonja vissza a
   szerveren, az újratöltés pedig a GÉPEN maradó nyomot takarítja el (a jegyzetek
   szövege a JS heapben).

   A SORREND ITT MAGA A MŰKÖDÉS, és három dolgot köt össze: előbb a mentések,
   aztán a visszavonás, végül az újratöltés. Középre kerülve a visszavonás 401-gyel
   ölné meg a még úton lévő mentést; előrehozva az újratöltés dobná el a futó
   újrapróbálást és a végén születő piszkozatot. Mindkét hiba NÉMA — a felület
   ugyanúgy kijelentkezik, csak a munka nincs sehol. */
describe("Kijelentkezés: visszavonás a szerveren, majd teljes újratöltés", () => {
    const logoutCalls = () => postSpy().mock.calls.filter(
        ([url]) => typeof url === "string" && url.endsWith(ENDPOINTS.logout));

    const cleanups: (() => void)[] = [];
    const registerSave = (save: () => Promise<void>) => { cleanups.push(registerPendingSave(save)); };
    afterEach(() => { cleanups.splice(0).forEach((unregister) => { unregister(); }); });

    beforeEach(() => { vi.mocked(reloadToRoot).mockReset(); });

    async function loginThenLogout() {
        renderAuth();
        await userEvent.click(screen.getByRole("button", {name: "belépés"}));
        await waitFor(() => expect(screen.getByTestId("belepett")).toHaveTextContent("true"));
        await userEvent.click(screen.getByRole("button", {name: "kilépés"}));
    }

    it("visszavonja a munkameneteket, és UTÁNA tölti újra a lapot", async () => {
        await loginThenLogout();

        await waitFor(() => { expect(logoutCalls()).toHaveLength(1); });
        await waitFor(() => { expect(vi.mocked(reloadToRoot)).toHaveBeenCalled(); });
    });

    it("a visszavonás VISZI A SÜTIT, és nem ad át tokent", async () => {
        /* A `withCredentials` nélkül a kérés hitelesítetlenül menne el, 401-et
           kapna, és a visszavonás CSENDBEN elmaradna: a felület kijelentkezne, a
           szerveren viszont minden munkamenet életben maradna. Tokent viszont nem
           adunk át — nem is tudnánk, a JavaScript nem látja. */
        await loginThenLogout();

        await waitFor(() => { expect(logoutCalls()).toHaveLength(1); });
        const call = logoutCalls()[0];
        expect(call?.[2]).toMatchObject({withCredentials: true});
        expect(call?.[2]?.headers).toBeUndefined();
    });

    it("a MENTÉS UTÁN vonja vissza, nem a határidő leteltekor", async () => {
        /* A mentés fut, a felület (a 3 másodperces határidő után) már
           kijelentkezett — a visszavonásnak és az újratöltésnek MÉG NEM szabad
           megtörténnie: az egyik 401-et adna a mentésnek, a másik eldobná a lapot
           a piszkozat kiírása előtt. */
        let release = () => {};
        registerSave(() => new Promise<void>((resolve) => { release = resolve; }));

        await loginThenLogout();
        await waitFor(() => expect(screen.getByTestId("belepett")).toHaveTextContent("false"),
            {timeout: 5000});

        expect(logoutCalls(), "a visszavonás megelőzte a mentést: az 401-et kapna").toHaveLength(0);
        expect(vi.mocked(reloadToRoot), "az újratöltés eldobta volna a futó mentést")
            .not.toHaveBeenCalled();

        await act(async () => { release(); await Promise.resolve(); });

        await waitFor(() => { expect(logoutCalls()).toHaveLength(1); });
        await waitFor(() => { expect(vi.mocked(reloadToRoot)).toHaveBeenCalled(); });
    });

    it("az újratöltés CSAK a visszavonás SIKERE után történik meg", async () => {
        /* A sütit a szerver törli (backend/src/controllers/Users/logout.js) — a
           JavaScript nem tudja, és nem is látja. Ha a visszavonás előtt töltenénk
           újra, a frissen betöltött lap BEJELENTKEZVE jönne vissza: a kijelentkezés
           pontosan az ellenkezőjét érné el annak, amiért van. */
        let answerLogout = () => {};
        postSpy().mockImplementation((url) => isEndpoint(url, ENDPOINTS.logout)
            ? new Promise((resolve) => { answerLogout = () => resolve(axiosResponse("ok")); })
            : Promise.resolve(axiosResponse(SESSION)));

        await loginThenLogout();
        await waitFor(() => { expect(logoutCalls()).toHaveLength(1); });

        expect(vi.mocked(reloadToRoot),
            "a válasz még meg sem jött: az újratöltött lap bejelentkezve térne vissza")
            .not.toHaveBeenCalled();

        await act(async () => { answerLogout(); await Promise.resolve(); });

        await waitFor(() => { expect(vi.mocked(reloadToRoot)).toHaveBeenCalled(); });
    });

    it("ha a visszavonás ELBUKIK, NEM tölt újra, és jelzi a hibát", async () => {
        /* EZ A VISELKEDÉS A SÜTIVEL EGYÜTT VÁLTOZOTT MEG, és fontos.

           Korábban a kliens maga dobta el a tokent, tehát a kilépés helyben akkor
           is megtörtént, ha a szerver nem válaszolt — a hiányzó visszavonás csak
           egy extra réteg volt, amiről csendben le lehetett mondani.

           A HttpOnly sütit viszont nem tudjuk eldobni. Ha a kérés nem ér célba, a
           munkamenet ÉL TOVÁBB — újratöltve a felhasználó bejelentkezve találná
           magát, miután azt hitte, kilépett. Ez a "hiba, ami normálisnak látszik"
           legrosszabb fajtája, ezért itt a szabály másik ága érvényes: a hiányzó
           védelem magát a MŰVELETET veszélyezteti, tehát nem állítjuk, hogy
           megtörtént. */
        postSpy().mockImplementation((url) => isEndpoint(url, ENDPOINTS.logout)
            ? Promise.reject(new Error("a hálózat nem elérhető"))
            : Promise.resolve(axiosResponse(SESSION)));

        await loginThenLogout();

        await waitFor(() => {
            expect(screen.getByTestId("kilepes-bukott")).toHaveTextContent("true");
        });
        expect(vi.mocked(reloadToRoot),
            "újratöltve a felhasználó bejelentkezve térne vissza, miután azt hitte, kilépett")
            .not.toHaveBeenCalled();
        /* A FELÜLET kijelentkezik — a felhasználó ezt kérte, és a helyi állapotot
           el is dobtuk. Amit NEM állítunk: hogy a munkamenet megszűnt. Az a
           szerveren élhet tovább, és épp ezért kell a jelzés: enélkül egy F5
           visszahozná a bejelentkezett appot, magyarázat nélkül. */
        await waitFor(() => expect(screen.getByTestId("belepett")).toHaveTextContent("false"));
    });
});
