import {createContext, useContext} from "react";
import type {AxiosResponse} from "axios";
import type {AuthToken} from "../types/api";

/* Az auth megosztható, NEM komponens része: a context és a useAuth hook — külön
   az AuthProvider komponenstől, hogy az auth.tsx csak komponenst exportáljon, és
   a Vite fast-refresh (HMR) megbízhatóan frissítsen (react/only-export-components). */

/* A PROJEKT MINDEN SZERVERHÍVÁSÁNAK alakja. Egyetlen helyen kimondva, mert
   egyetlen helyen is valósul meg (auth.tsx) — és mert ez az a pont, ahol a
   típusok a legtöbbet adják.

   A `<T>` egy TÍPUS-PARAMÉTER: ugyanaz a fogalom, mint a függvény-paraméter, csak
   értékek helyett típusokra. A hívó mondja meg, milyen adatot VÁR a szervertől, és
   a `then` visszahívása pontosan azt kapja:

       handleAxios<Quote[]>("/quotes", {}, (response) => setQuotes(response.data), …)
                   ^^^^^^^ ettől lesz a response.data Quote[] a callbackben

   Innentől egy `response.data.map((q) => q.qoute)` elgépelés FORDÍTÁSKOR bukik, nem
   egy üres kártyán a képernyőn.

   Az alapértelmezés `unknown` (nem `any`): aki nem mondja meg, mit vár, annak a
   fordító nem engedi meg, hogy találgasson — az `unknown`-hoz addig nem lehet
   nyúlni, amíg meg nem mondjuk, minek nézzük. Az `any` ezzel szemben csendben
   mindent átengedne, vagyis pont a védelmet kapcsolná ki.

   A `catchError` paramétere azért `unknown`, mert JavaScriptben BÁRMIT el lehet
   dobni — egy hibaág nem ígérhet Error-t. (A `then`-ben dobott kivétel is ide
   érkezik, nem csak a hálózati hiba.)

   Az `authToken` OPCIONÁLIS felülírás; az indoka az auth.tsx-ben van, ahol a
   kijelentkezéskori mentés a már törölt élő token helyett a zárványolt régit adja. */
export type HandleAxios = <T = unknown>(
    url: string,
    data: unknown,
    then: (response: AxiosResponse<T>) => void,
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
