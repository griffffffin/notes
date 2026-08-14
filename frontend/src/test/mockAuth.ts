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

   A HÍVÁS-KÉM ÉS A GENERIKUSSÁG. A `handleAxios` generikus (`<T>`: a hívó mondja
   meg, milyen adatot vár), a Vitest `Mock<T>` típusa viszont a hívási aláírást
   konkretizálja, és attól már nem felel meg egy generikus mezőnek. `as`-szal egy
   sor lenne — de az pont az ellenőrzést kapcsolná ki. Helyette a kém a LAPOS
   alakot rögzíti, és a contextbe egy vékony, generikus továbbító kerül: a
   komponens azt hívja, a teszt a kémre tesz `mockImplementation`-t.

   A VÁLASZ TÍPUSA az egyetlen rés, és NÉVVEL áll, hogy látszódjon, mi az. A
   `then` visszahívás kétfelé néz: a továbbítónak BÁRMELYIK hívó callbackjét
   fogadnia kell (`AxiosResponse<Quote[]>`, `AxiosResponse<Todo>`, …), a tesztnek
   pedig HÍVNIA kell a sajátjával. Az egyik igény kovariáns, a másik
   kontravariáns; a `never` a továbbítót engedné, de a tesztet nem, az `unknown`
   fordítva — a kettőt egyszerre semmi nem elégíti ki. Nem is elégítheti: a `T` a
   HÍVÓ kívánsága, amiről futásidőben csak a teszt írója tud.

   És ez nem a pótlék gyengesége: a VALÓDI implementáció is pontosan ennyit ígér.
   Az `axios.post<T>` (auth.tsx) sem veti össze a szerver JSON-ját a `T`-vel — ott
   a cast a könyvtár típusaiban van elrejtve. Ha a `handleAxios` egyszer `unknown`-t
   adna, és a hívók típusőrrel szűkítenének (ahogy a httpError.ts teszi), ez a rés
   magától eltűnne — a kém `AxiosResponse<unknown>`-t kapna, és minden típusos
   lenne. Addig itt áll, egy helyen, kimondva. */
type CallerTypedResponse = AxiosResponse<any>;

type HandleAxiosSpy = (
    url: string,
    data: unknown,
    then: (response: CallerTypedResponse) => void,
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
