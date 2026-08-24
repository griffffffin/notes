import axios from "axios";
import type {AxiosResponse} from "axios";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import type {ReactNode} from "react";
import {AuthContext} from "./auth-context";
import type {Auth} from "./auth-context";
import {sessionSchema} from "../types/api";
import type {Session} from "../types/api";
import {ENDPOINTS} from "../endpoints";
import type {Endpoint} from "../endpoints";
import {ACTIVITY_EVENTS, IDLE_LOGOUT_MS} from "../idle";
import {responseStatus} from "../httpError";
import {BACKEND_URL} from "../backendUrl";
import {logRequestError} from "../log";
import {dropDraftKey, useDraftKeySession} from "../draftKeySession";
import {parseResponse, reportContractFault} from "../contractFault";
import {flushPendingSaves} from "../pendingSave";
import {reloadToRoot} from "../reload";

/* Bejelentkezés és szerverhívás egy helyen.

   A MUNKAMENET A SZERVERÉ. A token HttpOnly sütiben él, amit ez a kód NEM LÁT és
   nem is tud beállítani (backend/src/tokenCookie.js) — a böngésző küldi minden
   kéréssel, a `withCredentials` hatására. Ennek két következménye van, és
   mindkettő végigfut ezen a fájlon:

     - a bejelentkezettséget MEGKÉRDEZNI kell (POST /me), nem kiolvasni;
     - a kijelentkezés SZERVER-MŰVELET: ha nem ér célba, a munkamenet él tovább,
       és nincs mit eldobnunk helyben.

   A 401 továbbra is kijelentkezésnek számít: ilyenkor a szerver mondta ki, hogy
   nincs érvényes munkamenet. */

/* A tétlenségi kijelentkezés határa (IDLE_LOGOUT_MS) az idle.ts-ben van, a
   szerkesztők autosave-órájával EGY helyen: a kettő viszonya (az autosave
   hamarabb sül el) az, ami a mentetlen munkát megvédi. Az érték emellett
   SZÁNDÉKOSAN egyezik a token szerveroldali élettartamával (backend/src/token.js:
   15m) — így a felület és a munkamenet egyszerre jár le. Az a kötés két csomag
   között van, tehát csak komment tartja. */

/* A megújítást AKTIVITÁS váltja ki, nem az óra — így a lejárat mindig a legutóbbi
   tevékenységhez igazodik, és tétlen munkamenetet soha nem hosszabbít meg. Az
   egérmozgás másodpercenként sokszor tüzel, ezért fékezzük. */
const REFRESH_EVERY_MS = 5 * 60 * 1000;

// Ilyen sűrűn nézzük, tétlen vagy-e. Egy perc pontosság bőven elég egy negyed
// órás határhoz, és észrevehetetlen terhelés.
const IDLE_CHECK_MS = 60 * 1000;

/* Egy szerverhívás legfeljebb ennyi ideig várhat válaszra. Timeout NÉLKÜL egy
   néma szerver vagy megszakadt hálózat esetén a kérés örökké függne — sem a
   siker-, sem a hiba-ág nem futna le —, és a betöltő-jelző a végtelenségig
   pörögne. 15 s bőven elég a leglassabb valós válasznak is, de véges. */
const REQUEST_TIMEOUT_MS = 15 * 1000;

/* MINDEN KÉRÉS VIGYE A SÜTIT. Az axios alapból NEM küld sütit cross-origin
   kérésnél, és fejlesztéskor épp ilyen a felállás: a Vite dev szervere az
   5173-on, az API a 3001-en — más origin, hiába ugyanaz a gép. Enélkül a
   fejlesztői mód némán hitelesítetlen volna (minden kérés 401), miközben a süti
   ott van a böngészőben. Élesben azonos originről megy, ott ez a beállítás nem
   változtat semmin — de kimondva nem tud elcsúszni. */
const withSession = {timeout: REQUEST_TIMEOUT_MS, withCredentials: true} as const;

export function AuthProvider({children}: {children: ReactNode}) {
    /* A MUNKAMENET HÁROM ÁLLAPOTA. `undefined` = még nem tudjuk (úton a válasz),
       `null` = bizonyítottan nincs, objektum = van. A harmadik állapot azért kell,
       mert a bejelentkezettség többé nem olvasható ki azonnal: ha a "még nem
       tudjuk" összemosódna a "nincs"-csel, a felület minden indulásnál
       felvillantaná a belépő képernyőt. */
    const [session, setSession] = useState<Session | null | undefined>(undefined);
    /* NEM TUDTUK MEGKÉRDEZNI (hálózat, időtúllépés, alvó szerver). Külön a
       `null`-tól: ez NEM kijelentkezettség, és nem is szabad annak mutatni. */
    const [sessionFailed, setSessionFailed] = useState(false);
    /* A KIJELENTKEZÉS ELBUKOTT. A süti a szerveré: ha a /logout nem ér célba, a
       munkamenet ÉL, és nincs mit eldobnunk helyben — azt állítani, hogy
       kiléptünk, hazugság volna. */
    const [logoutFailed, setLogoutFailed] = useState(false);
    /* Épp a kijelentkezés mentésére várunk-e. KÉSLELTETVE gyullad ki (300 ms):
       egy egészséges mentés századmásodpercek alatt lefut, és egy azonnal
       megjelenő karika csak villanna egyet. */
    const [showsLogoutSpinner, setShowsLogoutSpinner] = useState(false);
    /* FUT-E A KIJELENTKEZÉS — a karikával ellentétben AZONNAL igaz. A navbar
       ebből tudja, hogy a linkjei már nem kattinthatók (a lap mindjárt elmegy);
       a karika villanása zavaró volna, a linkek letiltása nem, tehát a kettő nem
       várhat ugyanannyit. */
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    /* Refek és nem state-ek: másodpercenként sokszor frissülnek, és senki nem
       jeleníti meg őket — state-ként minden egérmozdulat újrarajzolná az appot. */
    const lastActivity = useRef(Date.now());
    const lastRefresh = useRef(Date.now());

    /* KI VAN BEJELENTKEZVE — a lapbetöltés első kérdése.

       A HIBAÁGAK KÜLÖNBÖZNEK, és ez a lényeg. A 401 azt jelenti, hogy a SZERVER
       mondta ki: nincs munkamenet — ilyenkor `null`, mehet a belépő képernyő.
       Minden más (hálózati hiba, időtúllépés, 503 a zárt kötet miatt) csak annyit
       jelent, hogy MOST NEM TUDJUK. Abból kijelentkeztetni azt a felhasználót,
       aki be van jelentkezve, néma hazugság volna — ezért marad az "ismeretlen"
       állapot, és a felület újrapróbálást kínál. */
    const loadSession = useCallback(() => {
        setSessionFailed(false);
        axios.post<unknown>(BACKEND_URL + ENDPOINTS.me, {}, withSession)
            .then((response) => {
                const answer = parseResponse(sessionSchema, response.data, ENDPOINTS.me);
                setSession((current) => current === undefined ? answer : current);
            })
            .catch((error: unknown) => {
                reportContractFault(error);
                if (responseStatus(error) === 401)
                    return setSession((current) => current === undefined ? null : current);
                logRequestError(error);
                setSessionFailed(true);
            });
    }, []);

    /* MIÉRT CSAK AZ "ISMERETLEN" ÁLLAPOTOT TÖLTI KI a fenti válasz — és miért nem
       egyszerűen `setSession(answer)`.

       Ez a lekérés a lapbetöltéskor indul, és a válasza KÉSHET. Közben a
       felhasználó már be is jelentkezhet (a belépő űrlap nem várja meg), ki is
       léphet, vagy egy 401 kiléptetheti. Ha a késve érkező /me-válasz felülírná az
       azóta megtörtént eseményt, az visszaforgatná az időt: egy 401-es /me
       kidobná a frissen bejelentkezett felhasználót, egy sikeres pedig
       visszahozná a kijelentkezettet.

       MÉRVE: a tétlenségi tesztek pontosan ezt fogták meg — ott a bejelentkezés a
       /me válasza ELŐTT történt, és a késve érkező 401 kiléptetett.

       A szabály tehát: a /me a KEZDETI állapotot deríti fel, és semmi mást nem ír
       felül. Minden későbbi tényt (belépés, kilépés, 401) a saját eseménye ír. */



    useEffect(loadSession, [loadSession]);

    /* A BELÉPÉS UTÁN nincs mit eltenni: a tokent a szerver már sütibe tette. Ez a
       hívás csak TUDATJA a felülettel, hogy megvan a munkamenet — így nem kell
       fölösleges /me kört futni közvetlenül a bejelentkezés után. */
    const login = useCallback((newSession: Session) => {
        setSessionFailed(false);
        setSession(newSession);
    }, []);

    /* A MUNKAMENETEK VISSZAVONÁSA A SZERVEREN. Nem elég a sütit eldobni (nem is
       tudnánk: HttpOnly): a token a lejáratáig élne, és a /refresh minden érvényes
       tokenért frisset ad. Ez a hívás növeli a fiók munkamenet-verzióját, amitől
       MINDEN eddig kiadott token azonnal érvénytelen lesz — és a szerver a sütit
       is törli (backend/src/controllers/Users/logout.js).

       NEM a handleAxios-on megy: az visszahívásokkal dolgozik, nekünk viszont
       PROMISE kell — a válasz megérkezése az, amihez a továbblépést kötjük. */
    const revokeSessions = useCallback(() =>
        axios.post<unknown>(BACKEND_URL + ENDPOINTS.logout, {}, withSession), []);

    /* A KIJELENTKEZÉS MEGVÁRJA a szerkesztő függő mentését — ugyanaz a szabály,
       ami a navigációra már érvényes. A `void` KIMONDVA: a szerződés szerint ez a
       függvény semmit nem ad vissza, de belül aszinkron munka folyik. */
    const logout = useCallback(() => {
        setLogoutFailed(false);
        setIsLoggingOut(true);
        const showSpinner = setTimeout(() => setShowsLogoutSpinner(true), 300);
        void flushPendingSaves(() => {
            /* A PISZKOZAT-KULCS ELDOBÁSA a mentés-láncok TELJES lefutásához van
               kötve, nem a 3 másodperces határidőhöz: a lánc végén épp az a
               piszkozat születik meg, ami a mentetlen munkát őrzi, és kulcs
               nélkül azt már nem lehetne kiírni. */
            dropDraftKey();
            /* A VISSZAVONÁS ÉS AZ ÚJRATÖLTÉS IS IDE VAN KÖTVE, nem a határidőhöz.
               A visszavonás azért, mert a megnövelt verzió minden korábbi tokent
               megöl: a mentés ELŐTT lefutva 401-gyel ölné meg a még úton lévő
               mentést. Az újratöltés azért, mert ELDOBJA a lapot — vele a
               háttérben futó újrapróbálást és a végén születő piszkozatot is. */
            void revokeSessions()
                .then(() => {
                    /* A MUNKAMENET ELDOBÁSA a sikerhez van kötve, nem a
                       kattintáshoz: innentől bizonyítottan nincs mit őrizni (a
                       szerver a sütit is törölte). Az újratöltés úgyis eldobja az
                       egész lapot, de a kettő közti pillanatban sem szabad
                       bejelentkezettnek látszania. */
                    setSession(null);
                    reloadToRoot();
                })
                /* HA A VISSZAVONÁS ELBUKIK, NEM TÖLTÜNK ÚJRA, és nem is állítjuk,
                   hogy kiléptünk. Ez változás a süti-alapú munkamenettel: korábban
                   a kliens maga dobta el a tokent, tehát a kilépés helyben akkor is
                   megtörtént, ha a szerver nem válaszolt. A HttpOnly sütit viszont
                   nem tudjuk eldobni — ha a kérés nem ért célba, a munkamenet ÉL
                   TOVÁBB. Újratöltve a felhasználó bejelentkezve találná magát,
                   miután azt hitte, kilépett; ez a "hiba, ami normálisnak látszik"
                   legrosszabb fajtája. Ezért inkább kimondjuk, és marad a
                   munkamenet — a felület jelzi, és újra lehet próbálni. */
                .catch((error: unknown) => {
                    logRequestError(error);
                    setLogoutFailed(true);
                });
        }).finally(() => {
            clearTimeout(showSpinner);
            setShowsLogoutSpinner(false);
            setIsLoggingOut(false);
            /* A FELÜLET ITT JELENTKEZIK KI — legkésőbb a 3 másodperces határidőnél
               (pendingSave.ts), akkor is, ha a mentés-lánc még fut. A felhasználó
               kilépni akart; nem várakoztathatjuk a végtelenségig.

               Ez CSAK a felület állapota. A munkamenetet a szerver vonja vissza, a
               láncok tényleges végén — a köztes időben a még futó mentés a sütivel
               ugyanúgy célba ér, épp ezért nem itt szakítjuk el. Ha a visszavonás
               elbukik, arról a `logoutFailed` szól: a felület kijelentkezett, de a
               munkamenet a szerveren ÉLHET, és ezt ki kell mondani. */
            setSession(null);
        });
    }, [revokeSessions]);

    /* AZ EGYETLEN SZERVERHÍVÓ. A hitelesítés a sütiből megy (withSession), tehát
       tokent sem átadni, sem zárványolni nem kell — a korábbi `authToken`
       felülíró paraméter ezzel megszűnt. A szerkesztők leváláskori mentése is
       ugyanezen az úton megy: a süti akkor is ott van, amikor a React-fa már
       lebomlott. */
    const handleAxios = useCallback((
        // Csak létező végpont adható át (l. endpoints.ts).
        url: Endpoint,
        data: unknown,
        then: (response: AxiosResponse<unknown>) => void,
        catchError: (error: unknown) => void,
    ): void => {
        /* A `<unknown>` KIMONDVA: az axios alapértelmezése `any` volna, ami
           csendben mindent átengedne — épp azt a védelmet kapcsolná ki, amiért a
           válasz típusa `unknown` lett (l. auth-context.ts).

           A láncot elindítjuk, de NEM adjuk ki (nincs `return`): a hívó a
           visszahívásokból dolgozik, és a lánc végén álló `.catch` miatt ez a
           promise sosem utasítódik el. */
        axios.post<unknown>(BACKEND_URL + url, data, withSession)
            .then(then)
            /* A hibaág típusa `unknown`, mert bármi ideérhet: hálózati hiba,
               időtúllépés, VAGY a fenti `then`-ben dobott kivétel. A 401
               felismerése az ALAKRA néz, nem arra, ki dobta (httpError.ts). */
            .catch((error: unknown) => {
                if (responseStatus(error) === 401) setSession(null);
                /* A SZERZŐDÉS-HIBA KÖZPONTI KEZELÉSE: ez az egyetlen hely, ahol
                   egyszer kell kimondani, hogy a séma által elutasított választ a
                   felhasználónak ÉS a szerver naplójának is jelenteni kell
                   (contractFault.ts). A hívási helyek hibaága ettől függetlenül
                   fut tovább. */
                reportContractFault(error);
                catchError(error);
            });
    }, []);

    /* A PISZKOZAT-TITKOSÍTÁS KULCSA a munkamenethez tartozik, ezért itt, a
       munkamenet gazdájánál kérjük le — a mikorját és a miértjeit a hook mondja
       ki (draftKeySession.ts). */
    useDraftKeySession(session?.name ?? null);

    useEffect(() => {
        // Kijelentkezve (vagy amíg nem tudjuk) nincs mit lejáratni és figyelni.
        if (!session) return;
        lastActivity.current = Date.now();
        lastRefresh.current = Date.now();

        const markActivity = () => {
            lastActivity.current = Date.now();
            if (Date.now() - lastRefresh.current < REFRESH_EVERY_MS) return;
            lastRefresh.current = Date.now();
            /* A MEGÚJÍTÁS a sütit írja felül a szerveren, tehát itt nincs mit
               eltenni — a válasz sémáját mégis ellenőrizzük: ha a szerződés
               elcsúszik, arról tudni akarunk, és ez a hívás nem a handleAxios-on
               megy (nem akarunk tőle 401-kiléptetést a háttérben). */
            axios.post<unknown>(BACKEND_URL + ENDPOINTS.refresh, {}, withSession)
                .then((response) =>
                    setSession(parseResponse(sessionSchema, response.data, ENDPOINTS.refresh)))
                /* A FELHASZNÁLÓ felé néma bukás szándékos: ez háttérmunka. Ha a
                   munkamenet időközben lejárt, a következő valódi kérés 401-et
                   kap, és az jelentkeztet ki. A SZERZŐDÉS-hiba viszont a MI
                   hibánk, tartós, és éles buildben is tudni akarunk róla. */
                .catch((error: unknown) => {
                    reportContractFault(error);
                    logRequestError(error);
                });
        };

        ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, markActivity, {passive: true}));
        const idleCheck = setInterval(() => {
            if (Date.now() - lastActivity.current >= IDLE_LOGOUT_MS) logout();
        }, IDLE_CHECK_MS);

        return () => {
            ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, markActivity));
            clearInterval(idleCheck);
        };
    }, [session, logout]);

    /* A típus KIMONDVA (`: Auth`), nem csak következtetve: így ha a context
       szerződése bővül vagy változik, a hiba ITT jelentkezik — nem valamelyik
       távoli fogyasztónál, ahol a hiányzó mező már csak `undefined`-ként látszana. */
    const value: Auth = useMemo(() => ({
        session,
        isSessionKnown: session !== undefined,
        sessionFailed,
        retrySession: loadSession,
        isLoggedIn: Boolean(session),
        login,
        logout,
        logoutFailed,
        isLoggingOut,
        showsLogoutSpinner,
        handleAxios,
    }), [session, sessionFailed, loadSession, login, logout, logoutFailed,
        isLoggingOut, showsLogoutSpinner, handleAxios]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
