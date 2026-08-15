import {vi} from "vitest";
import type {AxiosResponse} from "axios";
import type {Auth} from "../contexts/auth-context";


/* A HITELESÍTÉSI CONTEXT PÓTLÉKA — egy helyen, a valódi alakjához mérve.

   Tíz tesztfájl cserélte ki eddig a saját kézzel írt objektumára, például így:
   `{useAuth: () => ({handleAxios})}`. Ezekből hiányzott a `token`, a `login` és a
   `logout`, és ezt semmi nem vette észre: a `.jsx` fájlokra a fordító rá se néz,
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
    authToken?: Auth["token"],
) => Promise<void>;

/* Alapból KIJELENTKEZETT állapot (`token: null`), mert az a semlegesebb: aki
   bejelentkezettet akar, mondja ki. A `handleAxios` nem írható felül — az a kém
   dolga, és a hívó úgyis a visszaadott `handleAxios`-on át vezérli. */
export function mockAuth(overrides: Partial<Omit<Auth, "handleAxios">> = {}) {
    const handleAxios = vi.fn<HandleAxiosSpy>();
    const auth: Auth = {
        token: null,
        isLoggedIn: false,
        login: vi.fn(),
        logout: vi.fn(),
        /* A továbbítás `...args`-szal megy, nem megnevezett paraméterekkel: így a
           kém PONTOSAN annyi argumentumot lát, amennyivel a komponens hívott. A
           megnevezett alak az opcionális tokent akkor is odatette volna
           (undefined-ként), amikor a hívó négy argumentummal hív — és a
           `toHaveBeenCalledWith` ötöt látva bukna. A kém azt kell mutassa, ami
           történt, nem azt, amit a pótlék hozzátoldott. */
        handleAxios: (...args) => handleAxios(...args),
        ...overrides,
    };
    return {auth, handleAxios};
}
