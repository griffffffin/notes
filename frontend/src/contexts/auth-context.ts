import {createContext, useContext} from "react";
import type {AxiosResponse} from "axios";
import type {AuthToken} from "../types/api";
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
    // A szerkesztők zárványolt tokene `AuthToken | null` (l. auth.tsx); a null
    // megengedett: a hívott oldalon `?? tokenRef.current` fallback nyeli el.
    authToken?: AuthToken | null,
) => Promise<void>;

/* Amit a context ad: a munkamenet állapota és az egyetlen hívó. A `token` azért
   lehet null, mert kijelentkezve nincs — a `isLoggedIn` ugyanennek a kényelmi
   alakja, hogy a komponenseknek ne kelljen null-t vizsgálniuk. */
export type Auth = {
    token: AuthToken | null;
    isLoggedIn: boolean;
    login: (newToken: AuthToken) => void;
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
