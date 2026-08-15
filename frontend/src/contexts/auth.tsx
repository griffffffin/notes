import axios from "axios";
import type {AxiosResponse} from "axios";
import {useCallback, useEffect, useMemo, useRef} from "react";
import type {ReactNode} from "react";
import {useCookies} from "react-cookie";
import * as v from "valibot";
import {AuthContext} from "./auth-context";
import type {Auth} from "./auth-context";
import {authTokenSchema} from "../types/api";
import type {AuthToken} from "../types/api";
import {ENDPOINTS} from "../endpoints";
import type {Endpoint} from "../endpoints";
import {ACTIVITY_EVENTS, IDLE_LOGOUT_MS} from "../idle";
import {responseStatus} from "../httpError";
import {BACKEND_URL} from "../backendUrl";
import {logRequestError} from "../log";

/* Bejelentkezés és szerverhívás egy helyen.

   A "user" süti értéke a bejelentkezéskor kapott JWT. Minden kérés
   Authorization fejlécben viszi; a szerver EBBŐL tudja, ki vagy — a kérés
   törzsében küldött azonosítót figyelmen kívül hagyja (a régi app fő
   biztonsági gyengesége pont az volt, hogy hitt neki).

   401-nél (lejárt vagy érvénytelen token) a süti törlődik, így az app
   automatikusan visszavált a bejelentkező képernyőre. */

/* A tétlenségi kijelentkezés határa (IDLE_LOGOUT_MS) az idle.ts-ben van, a
   szerkesztők autosave-órájával EGY helyen: a kettő viszonya (az autosave
   hamarabb sül el) az, ami a mentetlen munkát megvédi. Az érték emellett
   SZÁNDÉKOSAN egyezik a token szerveroldali élettartamával (backend/src/token.js:
   15m) — így a felület és a token egyszerre jár le, nem fordulhat elő, hogy a
   képernyő kijelentkezettnek látszik, miközben a lemásolt süti a szerveren még
   működik. Az a kötés két csomag között van, tehát csak komment tartja. */

/* A megújítást AKTIVITÁS váltja ki, nem az óra — így a token lejárata mindig a
   legutóbbi tevékenységhez igazodik, és tétlen munkamenetet soha nem
   hosszabbít meg. Az egérmozgás másodpercenként sokszor tüzel, ezért fékezzük:
   legfeljebb ennyinként fordulunk a szerverhez. Bőven a 15 perces lejárat
   alatt van, tehát aktív használat közben a token nem tud lejárni. */
const REFRESH_EVERY_MS = 5 * 60 * 1000;

// Ilyen sűrűn nézzük, tétlen vagy-e. Egy perc pontosság bőven elég egy negyed
// órás határhoz, és észrevehetetlen terhelés.
const IDLE_CHECK_MS = 60 * 1000;

/* Egy szerverhívás legfeljebb ennyi ideig várhat válaszra. Timeout NÉLKÜL egy
   néma szerver vagy megszakadt hálózat esetén a kérés örökké függne — sem a
   siker-, sem a hiba-ág nem futna le —, és a betöltő-jelző a végtelenségig
   pörögne (ez okozta a törlés-modal szellemének "örök töltését" is). 15 s bőven
   elég a leglassabb valós válasznak is, de véges: utána a kérés ECONNABORTED
   hibával elszáll, és lefut a hiba-ág. */
const REQUEST_TIMEOUT_MS = 15 * 1000;

// Mi számít aktivitásnak: a lista (és a passive: true indoka) az idle.ts-ben —
// a szerkesztők autosave-órája UGYANEZT a halmazt figyeli.

export function AuthProvider({children}: {children: ReactNode}) {
    const [cookies, setCookie, removeCookie] = useCookies(["user"]);
    /* A SÜTI TARTALMA NEM MEGBÍZHATÓ FORRÁS, ezért ellenőrizzük — a `cookies.user`
       a react-cookie-tól `any`-ként jön, tehát a korábbi `AuthToken | null`
       annotáció csak ÁLLÍTÁS volt, nem vizsgálat (l. CLAUDE.md, "az `as` nem
       ellenőrzés").

       Nem elméleti kockázat: a sütit a felhasználó (vagy bármelyik böngésző-
       kiegészítő) átírhatja, a react-cookie pedig a JSON-nak látszó értéket
       MAGÁTÓL objektummá alakítja. Egy `user={"a":1}` süti így objektumot adna,
       amiből a fejléc "Bearer [object Object]" lenne — a szerver 401-gyel
       elutasítana, a felület viszont bejelentkezettnek látszana. Az `undefined`
       (nincs süti) ugyanezen az úton lesz `null`: a hiányzó és az értelmezhetetlen
       token egyaránt "nem vagy bejelentkezve". */
    const storedToken = v.safeParse(authTokenSchema, cookies.user);
    const token: AuthToken | null = storedToken.success ? storedToken.output : null;
    /* A friss tokent egy refben is tartjuk, hogy a handleAxios NE függjön tőle.
       Enélkül a token 5 percenkénti megújulása minden alkalommal új handleAxios-
       referenciát gyártana, amitől a rá épülő effektek (pl. a lista lekérése a
       read.jsx-ben) fölöslegesen újrafutnának. A refből a hívás PILLANATÁBAN
       mindig a legfrissebb tokent olvassuk, tehát a fejléc így is helyes. */
    const tokenRef = useRef<AuthToken | null>(token);
    tokenRef.current = token;
    /* Refek és nem state-ek: másodpercenként sokszor frissülnek, és senki nem
       jeleníti meg őket — state-ként minden egérmozdulat újrarajzolná az egész
       appot. */
    const lastActivity = useRef(Date.now());
    const lastRefresh = useRef(Date.now());

    const login = useCallback((newToken: AuthToken) => setCookie("user", newToken, {path: "/"}), [setCookie]);
    const logout = useCallback(() => removeCookie("user", {path: "/"}), [removeCookie]);

    /* Az `authToken` OPCIONÁLIS felülírás: alapból az ÉLŐ tokent (tokenRef) küldjük.
       A kijelentkezéskori unmount-mentés (Quotes/save.tsx) viszont a MÁR TÖRÖLT élő
       token helyett a leváláskor még érvényes, ZÁRVÁNYOLT tokent adja át — enélkül a
       mentés token nélkül, 401-gyel bukna (removeCookie már lefutott, tokenRef null).

       A válasz típusa `unknown`, nem a hívó által megadott `<T>`: az ellenőrzés a
       hívási helyen történik, sémával (l. auth-context.ts és types/api.ts). */
    const handleAxios = useCallback((
        // Csak létező végpont adható át (l. endpoints.ts) — a szerződést a
        // HandleAxios típus mondja ki, ez itt annak a megvalósítása.
        url: Endpoint,
        data: unknown,
        then: (response: AxiosResponse<unknown>) => void,
        catchError: (error: unknown) => void,
        // A felülíró token a szerkesztők ZÁRVÁNYOLT tokene, ami `AuthToken | null`
        // (a legutóbbi render tokene). A `?? tokenRef.current` a null-t is elnyeli:
        // nincs override → az élő tokent küldi. Ezért a null megengedett bemenet.
        authToken?: AuthToken | null,
    ): Promise<void> => {
        const bearer = authToken ?? tokenRef.current;
        /* A `<unknown>` KIMONDVA: az axios alapértelmezése `any` volna, ami
           csendben mindent átengedne — épp azt a védelmet kapcsolná ki, amiért a
           válasz típusa `unknown` lett (l. auth-context.ts). */
        return axios.post<unknown>(BACKEND_URL + url, data, {
            timeout: REQUEST_TIMEOUT_MS,
            headers: bearer ? {Authorization: "Bearer " + bearer} : undefined,
        })
            .then(then)
            /* A hibaág típusa `unknown`, mert bármi ideérhet: hálózati hiba,
               időtúllépés, VAGY a fenti `then`-ben dobott kivétel. A 401 felismerése
               az ALAKRA néz, nem arra, ki dobta — az indoklás és a hozzá tartozó
               valódi (nem `as`-os) ellenőrzés a httpError.ts-ben. */
            .catch((error: unknown) => {
                if (responseStatus(error) === 401) removeCookie("user", {path: "/"});
                catchError(error);
            });
    }, [removeCookie]);

    useEffect(() => {
        // Kijelentkezve nincs mit lejáratni és nincs mit figyelni.
        if (!token) return;
        lastActivity.current = Date.now();
        lastRefresh.current = Date.now();

        const markActivity = () => {
            lastActivity.current = Date.now();
            if (Date.now() - lastRefresh.current < REFRESH_EVERY_MS) return;
            lastRefresh.current = Date.now();
            /* A `<unknown>` és a séma ugyanabból az okból, mint a handleAxios-ban:
               a megújított tokent nem hihetjük el, ELLENŐRIZZÜK — ez az érték megy
               egyenesen a sütibe, tehát ha a szerver egyszer mást ad (pl.
               {token: "…"} burkolót), a hibás érték némán kiszorítaná a működő
               tokent, és a következő kérés 401-gyel léptetne ki. */
            axios.post<unknown>(BACKEND_URL + ENDPOINTS.refresh, {},
                {headers: {Authorization: "Bearer " + token}})
                .then((response) => setCookie("user", v.parse(authTokenSchema, response.data), {path: "/"}))
                /* A FELHASZNÁLÓ felé néma bukás szándékos: ez háttérmunka, amiről
                   nem tud. Ha a token időközben mégis lejárt, a következő valódi
                   kérés 401-et kap, és az jelentkeztet ki — nem kell két helyen
                   ugyanazt csinálni. A naplózás viszont CSAK fejlesztéskor szólal
                   meg (log.ts), és éles buildből kiesik: enélkül egy elcsúszott
                   szerződés (a fenti v.parse bukása) nyomtalan maradna. */
                .catch(logRequestError);
        };

        ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, markActivity, {passive: true}));
        const idleCheck = setInterval(() => {
            if (Date.now() - lastActivity.current >= IDLE_LOGOUT_MS) logout();
        }, IDLE_CHECK_MS);

        return () => {
            ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, markActivity));
            clearInterval(idleCheck);
        };
    }, [token, setCookie, logout]);

    /* A típus KIMONDVA (`: Auth`), nem csak következtetve: így ha a context
       szerződése bővül vagy változik, a hiba ITT jelentkezik — nem valamelyik
       távoli fogyasztónál, ahol a hiányzó mező már csak `undefined`-ként látszana. */
    const value: Auth = useMemo(() => ({
        token,
        isLoggedIn: Boolean(token),
        login,
        logout,
        handleAxios,
    }), [token, login, logout, handleAxios]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
