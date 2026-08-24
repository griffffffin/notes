import {createContext, useContext} from "react";
import type {AxiosResponse} from "axios";
import type {Session} from "../types/api";
import type {Endpoint} from "../endpoints";

/* Az auth megosztható, NEM komponens része: a context és a useAuth hook — külön
   az AuthProvider komponenstől, hogy az auth.tsx csak komponenst exportáljon, és
   a Vite fast-refresh (HMR) megbízhatóan frissítsen (react/only-export-components). */

/* A PROJEKT MINDEN SZERVERHÍVÁSÁNAK alakja. Egyetlen helyen kimondva, mert
   egyetlen helyen is valósul meg (auth.tsx) — és mert ez az a pont, ahol a
   típusok a legtöbbet adják.

   A VÁLASZ TÍPUSA `unknown`, ÉS EZ SZÁNDÉKOS. Korábban itt egy `<T>`
   típus-paraméter állt, amivel a hívó MEGMONDTA, mit vár:

       handleAxios<Quote[]>(ENDPOINTS.quotes, {}, (response) => setQuotes(response.data), …)

   Ez kényelmes volt, de üres ígéret: a `T`-t SEMMI nem vetette össze a szerver
   JSON-jával — a lánc végén álló `axios.post<T>` sem teszi, ott a cast a könyvtár
   típusaiban van elrejtve. Vagyis ugyanaz a fajta állítás volt, mint az `as` (l.
   CLAUDE.md): ha a backend átnevez egy mezőt, a fordító elégedett marad, és
   `undefined` jelenik meg a képernyőn, hibaüzenet nélkül.

   `unknown`-nal ez nem lehetséges: az `unknown`-hoz addig nem lehet hozzányúlni,
   amíg meg nem mondjuk, minek nézzük — a fordító tehát KIKÉNYSZERÍTI az
   ellenőrzést a hívási helyen. Nem `any`, mert az csendben mindent átengedne,
   vagyis pont a védelmet kapcsolná ki. A hívó a válaszra ráereszti a szekció
   sémáját (types/api.ts), és onnantól ellenőrzött adattal dolgozik:

       handleAxios(ENDPOINTS.quotes, {}, (response) => {
           setQuotes(v.parse(quoteListSchema, response.data));
       }, …)

   Az elutasított válasz a HIBAÁGRA kerül (a `then`-ben dobott kivételt a
   handleAxios `.catch`-e is elkapja) — ugyanúgy, mint egy hálózati hiba: az
   értelmezhetetlen válasz nem más eset, mint a meg sem érkezett válasz.

   A `catchError` paramétere azért `unknown`, mert JavaScriptben BÁRMIT el lehet
   dobni — egy hibaág nem ígérhet Error-t. (A `then`-ben dobott kivétel is ide
   érkezik, nem csak a hálózati hiba.)

   Az `authToken` OPCIONÁLIS felülírás; az indoka az auth.tsx-ben van, ahol a
   kijelentkezéskori mentés a már törölt élő token helyett a zárványolt régit adja. */
export type HandleAxios = (
    /* NEM `string`: csak a ténylegesen létező végpontok valamelyike (l.
       endpoints.ts). Egy kézzel odaírt vagy elgépelt útvonal így fordítási hiba,
       nem futásidejű 404 — a hívó oldalán ez a szűkítés az egyetlen olyan
       ellenőrzés, ami a kérés ELINDULÁSA előtt hat. */
    url: Endpoint,
    data: unknown,
    then: (response: AxiosResponse<unknown>) => void,
    catchError: (error: unknown) => void,
    /* A VISSZATÉRÉSI ÉRTÉK `void`, nem `Promise<void>` — pedig belül promise fut.
       Azért, mert a hívónak NINCS mit kezdenie vele: az eredmény a két
       visszahívásban érkezik, a lánc végén pedig egy `.catch` áll, tehát ez a
       promise soha nem utasítódik el. Egy kifelé adott promise csak azt sugallná,
       hogy meg lehet (kell) várni — és a "lebegő promise" figyelmeztetései
       (oxlint --type-aware, no-floating-promises) negyvenöt helyen épp ezt a nem
       létező kötelezettséget kérték számon. A típus mostantól azt mondja, ami
       igaz: indíts kérést, a többi a visszahívásoké. */
) => void;

/* Amit a context ad: a munkamenet állapota és az egyetlen hívó.

   A TOKEN MÁR NEM SZEREPEL ITT, és ez a HttpOnly süti egész lényege: a lapon futó
   JavaScript nem látja, tehát nem is adhatja tovább, nem is szivárogtathatja ki.
   A munkamenetről annyit tudunk, amennyit a szerver mond (POST /me). */
export type Auth = {
    /* HÁROM ÁLLAPOT, és a harmadik a lényeges: `undefined` = MÉG NEM TUDJUK.

       Amíg a token JS-ből olvasható sütiben élt, a bejelentkezettség azonnal
       tudható volt — most egy szerverkérdés válaszára várunk. A "még nem tudjuk"
       nem ugyanaz, mint a "nincs bejelentkezve": ha a kettőt összemossuk, a
       felület minden indulásnál felvillantja a belépő képernyőt, és rosszabb
       esetben egy múló hálózati hiba kilépteti azt, aki be van jelentkezve. */
    session: Session | null | undefined;
    /* Megérkezett-e már a válasz. A `session !== undefined` kényelmi alakja. */
    isSessionKnown: boolean;
    /* Nem tudtuk MEGKÉRDEZNI (hálózat, időtúllépés, alvó szerver) — ez NEM
       kijelentkezettség. A felület ilyenkor újrapróbálást kínál, nem belépő
       képernyőt; a `retrySession` az a gomb. */
    sessionFailed: boolean;
    retrySession: () => void;
    isLoggedIn: boolean;
    /* Épp a kijelentkezéshez tartozó mentésre várunk-e. A kijelentkezés MEGVÁRJA a
       szerkesztő függő mentését (pendingSave.ts); ez a jelző KÉSLELTETVE (300 ms
       után) gyullad ki, hogy a szokásos, gyors esetben ne villanjon fel semmi. */
    /* FUT-E ÉPP A KIJELENTKEZÉS. AZONNAL igaz, a kattintás pillanatától — ezt
       olvassa minden, ami a "mindjárt elmegy a lap" tényből következik (ma: a
       navbar linkjeinek egérmutatója). */
    isLoggingOut: boolean;
    /* KIGYULLADT-E A KIJELENTKEZÉS-KARIKA. Ez KÉSLELTETVE igaz (300 ms), mert egy
       egészséges mentés századmásodpercek alatt lefut, és egy azonnal megjelenő
       karika csak VILLANNA egyet — az zavaróbb, mint a semmi.

       SZÁNDÉKOSAN külön a fentitől, nem duplikáció: a karika villanása zavaró, a
       kurzoré nem, tehát a kettő nem várhat ugyanannyit. Egyetlen jelzővel vagy a
       karika villanna, vagy a kurzor hazudna 300 ezredmásodpercig. */
    showsLogoutSpinner: boolean;
    /* A BELÉPÉS UTÁN nincs mit eltenni: a tokent a szerver már sütibe tette, a
       válaszban csak a név jön. Ez a hívás tehát nem "beállítja a munkamenetet",
       hanem TUDATJA a felülettel, hogy megvan — így nem kell egy fölösleges /me
       kört futnia közvetlenül a bejelentkezés után. */
    login: (session: Session) => void;
    /* A KIJELENTKEZÉS ELBUKOTT-E. A süti a szerveré: ha a /logout nem ér célba, a
       munkamenet ÉL TOVÁBB, és a JavaScript nem tudja eldobni (épp ez a HttpOnly
       lényege). Ilyenkor tehát nem szabad azt állítani, hogy kiléptünk. */
    logoutFailed: boolean;
    logout: () => void;
    handleAxios: HandleAxios;
};

/* A kezdőérték `null`, és a típus ezt ki is mondja: a context ATTÓL kap értéket,
   hogy az AuthProvider körbeveszi a fát. A useAuth ezt a null-t váltja hibára —
   így a "provider nélkül használt hook" nem egy távoli, érthetetlen
   "cannot read property of null"-ként jelentkezik, hanem a helyszínen, névvel. */
export const AuthContext = createContext<Auth | null>(null);

export function useAuth(): Auth {
    const auth = useContext(AuthContext);
    if (!auth) throw new Error("useAuth csak <AuthProvider> alatt használható.");
    return auth;
}
