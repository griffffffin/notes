import {vi} from "vitest";
import type {AxiosResponse} from "axios";
import type {Auth} from "../contexts/auth-context";


/* A HITELESÍTÉSI CONTEXT PÓTLÉKA — egy helyen, a valódi alakjához mérve.

   Tíz tesztfájl cserélte ki eddig a saját kézzel írt objektumára, például így:
   `{useAuth: () => ({handleAxios})}`. Ezekből hiányzott a `token`, a `login` és a
   `logout`, és ezt semmi nem vette észre: az AKKORI, még `.jsx` fájlokra (a
   TypeScript-átállás előtt) a fordító rá se nézett,
   a `vi.mock` string-alakú hívása pedig `Partial<unknown>`-t vár a gyártól, tehát
   bármit elfogad. Egy mock akkor ér valamit, ha a VALÓSÁG HELYETT áll be — ha
   lemarad tőle, a tesztek attól kezdve nem azt őrzik, amit hiszünk róluk.

   Innentől a pótlék `Auth` típusú, tehát a szerződés bármely változása (új mező,
   átnevezett paraméter) ITT bukik el, egy helyen — nem tíz tesztben, némán.

   A HÍVÁS-KÉM. A kém a `handleAxios` LAPOS alakját rögzíti, és a contextbe egy
   vékony továbbító kerül: a komponens azt hívja, a teszt a kémre tesz
   `mockImplementation`-t.

   A VÁLASZ TÍPUSA `unknown` — ÉS EZ EGY BEZÁRULT RÉS. Korábban `AxiosResponse<any>`
   állt itt, az egyetlen `any` a segédben, mert a `handleAxios` generikus volt
   (`<T>`: a hívó mondta meg, milyen adatot vár), a `then` visszahívás pedig
   egyszerre nézett kétfelé: a továbbítónak BÁRMELYIK hívó callbackjét fogadnia
   kellett (`AxiosResponse<Quote[]>`, `AxiosResponse<Todo>`, …), a tesztnek pedig
   HÍVNIA kellett a sajátjával — kovariáns és kontravariáns igény egyszerre, amit
   csak az `any` elégített ki.

   A rés nem itt szűnt meg, hanem a szerződésben: a `handleAxios` mostantól
   `AxiosResponse<unknown>`-t ad, és a hívók sémával szűkítenek (l. types/api.ts).
   Így a kémnek sincs mit találgatnia — a `then` `unknown`-t kap, a teszt pedig
   bármilyen konkrét választ átadhat neki (az `AxiosResponse<Quote[]>`
   értékadható az `AxiosResponse<unknown>` helyére). Amit a `mockAuth` mutat, az
   pontosan annyi, amennyit a valóság is ígér. */
type HandleAxiosSpy = (
    url: string,
    data: unknown,
    then: (response: AxiosResponse<unknown>) => void,
    catchError: (error: unknown) => void,
    /* NINCS ötödik paraméter. A hitelesítés HttpOnly sütiből megy, tehát tokent
       sem átadni, sem zárványolni nem kell — a korábbi `authToken` felülíró ezzel
       megszűnt (l. contexts/auth.tsx). `void`, ahogy a valódi szerződés. */
) => void;

/* Alapból KIJELENTKEZETT, de MÁR TUDOTT állapot (`session: null`), mert az a
   semlegesebb: aki bejelentkezettet akar, mondja ki.

   A `session: null` és nem `undefined`: az `undefined` azt jelentené, hogy a
   /me válaszára várunk, és a felület betöltőt mutatna — a tesztek túlnyomó
   többsége nem ezt vizsgálja. Amelyik igen, az kimondja. */
export function mockAuth(overrides: Partial<Omit<Auth, "handleAxios">> = {}) {
    const handleAxios = vi.fn<HandleAxiosSpy>();
    const auth: Auth = {
        session: null,
        isSessionKnown: true,
        sessionFailed: false,
        retrySession: vi.fn(),
        isLoggedIn: false,
        logoutFailed: false,
        isLoggingOut: false,
        showsLogoutSpinner: false,
        login: vi.fn(),
        logout: vi.fn(),
        /* A továbbítás `...args`-szal megy, nem megnevezett paraméterekkel: így a
           kém PONTOSAN annyi argumentumot lát, amennyivel a komponens hívott. A
           megnevezett alak az opcionális tokent akkor is odatette volna
           (undefined-ként), amikor a hívó négy argumentummal hív — és a
           `toHaveBeenCalledWith` ötöt látva bukna. A kém azt kell mutassa, ami
           történt, nem azt, amit a pótlék hozzátoldott. */
        handleAxios: (...args) => {
            /* A `then`-ben DOBOTT hiba a HIBAÁGRA kerül — ahogy a valódi
               handleAxios-ban is (contexts/auth.tsx: a `.then(then).catch(…)`
               lánc a visszahívás kivételét is elkapja).

               Enélkül a pótlék egy fontos ponton eltért a valóságtól: a hívók a
               `then`-en belül ellenőrzik a választ sémával, tehát egy elcsúszott
               szerződés ITT dob. Élesben ez a hibaágra fut (a lista hibát jelez);
               a mockban viszont a kivétel a komponensbe csapódott volna, és a
               teszt egészen mást mérne, mint ami élesben történik. */
            try {
                handleAxios(...args);
            } catch (error) {
                args[3](error);
            }
        },
        ...overrides,
    };
    return {auth, handleAxios};
}
