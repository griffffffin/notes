import axios from "axios";
import type {AxiosResponse} from "axios";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
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
import {COOKIES, SESSION_COOKIE} from "../cookies";
import {logRequestError} from "../log";
import {dropDraftKey, useDraftKeySession} from "../draftKeySession";
import {parseResponse, reportContractFault} from "../contractFault";
import {flushPendingSaves} from "../pendingSave";
import {reloadToRoot} from "../reload";

/* Bejelentkezés és szerverhívás egy helyen.

   A token-süti (COOKIES.token) értéke a bejelentkezéskor kapott JWT. Minden kérés
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
    const [cookies, setCookie, removeCookie] = useCookies([COOKIES.token]);
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
    const storedToken = v.safeParse(authTokenSchema, cookies[COOKIES.token]);
    const token: AuthToken | null = storedToken.success ? storedToken.output : null;
    /* A friss tokent egy refben is tartjuk, hogy a handleAxios NE függjön tőle.
       Enélkül a token 5 percenkénti megújulása minden alkalommal új handleAxios-
       referenciát gyártana, amitől a rá épülő effektek (pl. a lista lekérése a
       read.tsx-ben) fölöslegesen újrafutnának. A refből a hívás PILLANATÁBAN
       mindig a legfrissebb tokent olvassuk, tehát a fejléc így is helyes. */
    const tokenRef = useRef<AuthToken | null>(token);
    tokenRef.current = token;
    /* Refek és nem state-ek: másodpercenként sokszor frissülnek, és senki nem
       jeleníti meg őket — state-ként minden egérmozdulat újrarajzolná az egész
       appot. */
    /* Épp a kijelentkezés mentésére várunk-e (l. a logout késleltetett jelzőjét).
       A felület ebből tudja, hogy karikát mutasson a szerkesztő helyett. */
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const lastActivity = useRef(Date.now());
    const lastRefresh = useRef(Date.now());

    const login = useCallback((newToken: AuthToken) =>
        setCookie(COOKIES.token, newToken, SESSION_COOKIE), [setCookie]);

    /* A MUNKAMENETEK VISSZAVONÁSA A SZERVEREN. A süti eldobása csak ezt a
       böngészőt lépteti ki; a token maga a lejáratáig élne, és a /refresh minden
       érvényes tokenért frisset ad — vagyis egy lemásolt munkamenetet semmi nem
       zavarna meg. Ez a hívás növeli a fiók munkamenet-verzióját, amitől MINDEN
       eddig kiadott token azonnal érvénytelen lesz (backend: controllers/Users/logout.js).

       NEM a handleAxios-on megy, két okból: az a 401-re kiléptetne (itt épp az a
       cél, tehát fölösleges kör), és visszahívásokkal dolgozik, nekünk viszont
       PROMISE kell — a válasz megérkezése az, amihez az újratöltést kötjük.

       A VÁLASZ TARTALMÁT nem ellenőrizzük sémával, és ez kivétel a projekt
       szabálya alól: itt nem HASZNÁLUNK semmit a válaszból, csak azt kérdezzük,
       eljutott-e a kérés. Egy séma itt olyasmit állítana, amire nem építünk. */
    const revokeSessions = useCallback((sessionToken: AuthToken) =>
        axios.post<unknown>(BACKEND_URL + ENDPOINTS.logout, {}, {
            timeout: REQUEST_TIMEOUT_MS,
            headers: {Authorization: "Bearer " + sessionToken},
        }), []);
    /* A KIJELENTKEZÉS MEGVÁRJA a szerkesztő függő mentését — ugyanaz a szabály,
       ami a navigációra már érvényes (a blocker csak a mentés után enged tovább).
       Eddig a süti törlése azonnal megtörtént, a szerkesztő azonnal levált, és a
       mentése a háttérben, MÁR TÖRÖLT élő token mellett indult el (a zárványolt
       tokenre épült). Így viszont a mentés még a teljes jogú munkamenetben fut le.

       A `void` KIMONDVA: a `logout` szerződése szerint semmit nem ad vissza (a
       hívók gombok onClickje és a tétlenségi óra), de belül aszinkron munka van —
       a promise-t itt nyeljük el, a hibáit pedig a flush maga (l. pendingSave.ts:
       egy sikertelen mentés sem akadályozhatja meg a kilépést). */
    /* A kijelentkezés VÁRAKOZIK a mentésre — és ha a várakozás ÉRZÉKELHETŐ, azt
       meg is mutatjuk (l. isLoggingOut lentebb). */
    const logout = useCallback(() => {
        /* A JELZŐ KÉSLELTETVE gyullad ki. Egészséges esetben a mentés
           századmásodpercek alatt lefut — egy azonnal megjelenő karika ilyenkor
           csak VILLANNA egyet, ami zavaróbb, mint a semmi. A 300 ms az a küszöb,
           ami alatt a felhasználó a késleltetést nem érzékeli várakozásnak. */
        const showSpinner = setTimeout(() => setIsLoggingOut(true), 300);
        /* A PISZKOZAT-KULCS ELDOBÁSA a mentés-láncok TELJES lefutásához van kötve,
           nem a lenti `finally`-hez. A kettő nem ugyanaz az időpont: a `finally`
           legkésőbb 3 másodperc múlva lefut (annyit várakoztatjuk a felhasználót),
           az újrapróbálás viszont tovább tart — és a végén épp az a PISZKOZAT
           születik meg, ami a mentetlen munkát őrzi. Kulcs nélkül azt már nem
           lehetne kiírni.

           Amint viszont a láncok véget értek, a kulcsnak nincs többé dolga a
           memóriában: onnantól már csak támadási felület volna (egy nyitva
           felejtett lapon a devtools kiolvashatná, és a lemezen fekvő
           piszkozatokat visszafejthetné vele). */
        /* A TOKEN ZÁRVÁNYOLVA. A visszavonás a mentés-láncok UTÁN indul, amikorra a
           süti már törölve lehet (a lenti `finally` legkésőbb 3 másodperc múlva
           lefut, a `tokenRef` pedig akkor már null). Ez az érték viszont a
           kattintás pillanatában még érvényes tokent őrzi meg — épp azzal kell
           kérnünk a visszavonást.

           MÉRVE: a `tokenRef.current` MA ugyanezt adná, mert a kiolvasás a
           kattintás pillanatában történik, amikor a kettő azonos — a mutáció-próba
           nem is tud különbséget tenni köztük. A zárványolt alak mégis ez marad,
           mert azt mondja ki, hogy a KATTINTÁSKORI tokent akarjuk; a ref a
           mindenkori legfrissebbet jelenti, és ha a kiolvasás egyszer lejjebb
           csúszna (a láncba, a `finish` mellé), ott már `null` volna.

           ÉS EZT NEM CSAK ÁLLÍTJUK. A lejjebb csúsztatott kiolvasásra a „MENTÉS
           UTÁN vonja vissza" teszt MEGBUKIK (mérve): a lassú mentés ágán a
           határidő már törölte a sütit, tehát a ref üres, a visszavonás pedig
           némán elmarad. Vagyis a KIOLVASÁS HELYE tesztelt — csak a két forrás
           cseréje UGYANEBBEN a pozícióban ekvivalens. */
        const sessionToken = token;
        void flushPendingSaves(() => {
            dropDraftKey();
            /* A VISSZAVONÁS ÉS AZ ÚJRATÖLTÉS A LÁNCOK TÉNYLEGES VÉGÉHEZ VAN KÖTVE,
               nem a 3 másodperces határidőhöz — és mindkettőnek megvan az oka.

               A visszavonásnak azért, mert a megnövelt verzió minden korábbi
               tokent megöl: ha a mentés ELŐTT futna le, a még úton lévő mentés
               401-et kapna, és pontosan az a munka veszne el, amit a kijelentkezés
               meg akart menteni.

               Az újratöltésnek azért, mert az ELDOBJA a lapot — vele a háttérben
               futó újrapróbálást és a végén születő piszkozatot is. A határidőhöz
               kötve tehát a lassú (hálózati hibába futó) mentés munkája veszne el:
               a felület kijelentkezettnek látszana, a szöveg pedig sehol nem
               maradna meg. Ugyanaz a sorrend-szabály, ami a piszkozat-kulcs
               eldobására is érvényes. */
            const finish = () => {
                /* A süti törlése az újratöltés ELŐTT, kimondva. A lenti `finally`
                   is törli — de a kettő két külön csatorna, és ha a sorrendjük
                   egyszer megfordul, az újratöltött lap BEJELENTKEZVE jönne vissza.
                   Ez idempotens, és nem hagyja a helyességet időzítésen múlni. */
                removeCookie(COOKIES.token, SESSION_COOKIE);
                reloadToRoot();
            };
            /* HA A VISSZAVONÁS ELBUKIK (hálózat, alvó szerver), a kilépés AKKOR IS
               megtörténik — `finally`, nem `then`. A projekt szabálya szerint a
               hiányzó védelem vagy lezárja a műveletet, vagy csendben kimarad:
               itt csak egy extra réteg esik ki, mert a token magától meghal
               negyed óra alatt (nincs, ami megújítsa: a lap elment, a süti pedig
               munkamenet-süti). A kilépést megtagadni emiatt aránytalan volna —
               a felhasználó kilépni akart, és a gépén ez meg is történik. */
            if (sessionToken) void revokeSessions(sessionToken).catch(logRequestError).finally(finish);
            else finish();
        }).finally(() => {
            clearTimeout(showSpinner);
            setIsLoggingOut(false);
            removeCookie(COOKIES.token, SESSION_COOKIE);
        });
    }, [removeCookie, revokeSessions, token]);

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
        // A típus `void`: a promise befelé kell, kifelé nem (l. auth-context.ts).
    ): void => {
        const bearer = authToken ?? tokenRef.current;
        /* A `<unknown>` KIMONDVA: az axios alapértelmezése `any` volna, ami
           csendben mindent átengedne — épp azt a védelmet kapcsolná ki, amiért a
           válasz típusa `unknown` lett (l. auth-context.ts).

           A láncot elindítjuk, de NEM adjuk ki (nincs `return`): a hívó a
           visszahívásokból dolgozik, és a lánc végén álló `.catch` miatt ez a
           promise sosem utasítódik el. */
        /* A FEJLÉC KULCSA is csak akkor kerül bele, ha van mit küldeni — korábban
           `headers: undefined` állt itt. Az axios `AxiosRequestConfig`-ja a
           `headers`-t explicit `undefined` nélkül deklarálja, tehát az
           `exactOptionalPropertyTypes` alatt a kulcs jelenléte döntés, nem
           mellékhatás. Hogy a két alak a hálózaton ugyanoda fut-e ki, azt eddig az
           axios BELSŐ viselkedése döntötte el (nem mértük) — most a kódunk dönti
           el: fejléc csak akkor van, ha van mit beletenni. */
        axios.post<unknown>(BACKEND_URL + url, data, {
            timeout: REQUEST_TIMEOUT_MS,
            ...(bearer ? {headers: {Authorization: "Bearer " + bearer}} : {}),
        })
            .then(then)
            /* A hibaág típusa `unknown`, mert bármi ideérhet: hálózati hiba,
               időtúllépés, VAGY a fenti `then`-ben dobott kivétel. A 401 felismerése
               az ALAKRA néz, nem arra, ki dobta — az indoklás és a hozzá tartozó
               valódi (nem `as`-os) ellenőrzés a httpError.ts-ben. */
            .catch((error: unknown) => {
                if (responseStatus(error) === 401) removeCookie(COOKIES.token, SESSION_COOKIE);
                /* A SZERZŐDÉS-HIBA KÖZPONTI KEZELÉSE. Ide minden elkapott hiba
                   befut, tehát ez az egyetlen hely, ahol egyszer kell kimondani:
                   ha a fenti `then`-ben a séma utasította el a választ, arról a
                   felhasználót ÉS a szerver naplóját is értesíteni kell
                   (contractFault.ts). Nem szerződés-hibára nem csinál semmit.

                   A hívási helyek hibaága ATTÓL FÜGGETLENÜL fut tovább: a lista
                   ugyanúgy kiüríti magát, a szerkesztő ugyanúgy kilép. Ez a hívás
                   nem VÁLTJA KI a helyi kezelést, hanem melléteszi azt, amit
                   helyben nem lehet tudni — hogy ez a mi hibánk, nem a hálózaté. */
                reportContractFault(error);
                catchError(error);
            });
    }, [removeCookie]);

    /* A PISZKOZAT-TITKOSÍTÁS KULCSA a munkamenethez tartozik, ezért itt, a
       munkamenet gazdájánál kérjük le — a mikorját és a miértjeit a hook mondja
       ki (draftKeySession.ts). Azért külön modul, mert a kulcs életciklusa
       önálló szabályokra épül (lapbetöltés, felhasználó-váltás, a kijelentkezéskor
       SZÁNDÉKOSAN megtartott kulcs), és azokat külön is lehet tesztelni. */
    useDraftKeySession(token);

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
                .then((response) =>
                    setCookie(COOKIES.token,
                        parseResponse(authTokenSchema, response.data, ENDPOINTS.refresh),
                        SESSION_COOKIE))
                /* A FELHASZNÁLÓ felé néma bukás szándékos: ez háttérmunka, amiről
                   nem tud. Ha a token időközben mégis lejárt, a következő valódi
                   kérés 401-et kap, és az jelentkeztet ki — nem kell két helyen
                   ugyanazt csinálni.

                   A NAPLÓZÁS (logRequestError) csak fejlesztéskor szólal meg, és
                   éles buildből kiesik (log.ts) — ezért kevés önmagában. A
                   SZERZŐDÉS-HIBA viszont más súlyú: az a MI hibánk, tartós, és
                   éles buildben is tudni akarunk róla, ezért megy külön a
                   reportContractFault-on (contractFault.ts).

                   Kézzel, mert ez a hívás NEM a handleAxios-on megy (nem akarunk
                   tőle 401-kiléptetést) — enélkül épp a háttérben megújuló token
                   elcsúszott alakja maradna néma. */
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
    }, [token, setCookie, logout]);

    /* A típus KIMONDVA (`: Auth`), nem csak következtetve: így ha a context
       szerződése bővül vagy változik, a hiba ITT jelentkezik — nem valamelyik
       távoli fogyasztónál, ahol a hiányzó mező már csak `undefined`-ként látszana. */
    const value: Auth = useMemo(() => ({
        token,
        isLoggedIn: Boolean(token),
        login,
        logout,
        isLoggingOut,
        handleAxios,
    }), [token, login, logout, isLoggingOut, handleAxios]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
