import {beforeEach, describe, expect, it, vi} from "vitest";
import * as v from "valibot";
import {ENDPOINTS} from "./endpoints";
import {BACKEND_URL} from "./backendUrl";
import {axiosResponse} from "./test/axiosResponse";
import {at} from "./test/at";

/* A SZERZŐDÉS-HIBA gépezetének tesztjei.

   Amit bizonyítani kell, az három, egymástól független állítás — és mindegyik
   elromlása NÉMA volna:

     1. a séma bukása MEGKÜLÖNBÖZTETHETŐ lesz a hálózati hibától (különben nem
        tudnánk, MELYIK végpontról szól, és mindent jelentenénk);
     2. a jelentés ELMEGY a szervernek, a helyes címre és a helyes törzzsel (ha
        nem megy el, a napló üres marad, és semmi nem szól);
     3. a jelentés NEM ismétlődik végtelenül (ha ismétlődik, mi magunk árasztjuk
        el a szerver naplóját — és a saját korlátozónkba futunk bele).

   A MODUL ÁLLAPOTOT TART (kik iratkoztak fel, miről jelentettünk már), ezért a
   tesztek FRISS PÉLDÁNYT töltenek be: `vi.resetModules()` + dinamikus import.
   Enélkül a tesztek sorrendje befolyásolná az eredményt — a második teszt már egy
   "erről jelentettünk" állapotot örökölne, és a hiányzó jelentést nem venné észre.
   Ugyanígy tesz a backendUrl.test.ts. */

vi.mock(import("axios"));

/* Friss modulpéldány + a HOZZÁ tartozó axios-kém. A sorrend kötött: előbb a
   contractFault töltődik (az importálja az axiost), és utána kérjük el ugyanazt
   az axios-példányt a modulregiszterből — a `vi.resetModules()` után a fájl
   tetején statikusan importált axios MÁR NEM ugyanaz az objektum lenne. */
async function loadModule() {
    vi.resetModules();
    const contractFault = await import("./contractFault");
    const {default: axios} = await import("axios");
    const post = vi.mocked(axios.post);
    /* A kém alapból `undefined`-ot adna vissza, a VALÓDI axios.post viszont
       mindig promise-t — a jelentés pedig `.catch`-et fűz rá. A mock a valóságot
       tükrözze, különben nem azt mérnénk, ami élesben történik: a 204-es válasz
       üres törzsű. */
    post.mockResolvedValue(axiosResponse("", 204));
    return {...contractFault, post};
}

const quoteSchema = v.object({quote: v.string()});

beforeEach(() => {
    vi.clearAllMocks();
});

describe("parseResponse", () => {
    it("érvényes választ átenged, az ELLENŐRZÖTT értéket adja vissza", async () => {
        const {parseResponse} = await loadModule();

        const parsed = parseResponse(quoteSchema, {quote: "Az élet szép."}, ENDPOINTS.quotes);

        expect(parsed).toEqual({quote: "Az élet szép."});
    });

    it("hibás alaknál DOB (a hívó hibaágára kerül, mint egy hálózati hiba)", async () => {
        const {parseResponse} = await loadModule();

        expect(() => parseResponse(quoteSchema, {quote: 42}, ENDPOINTS.quotes)).toThrow();
    });
});

describe("reportContractFault", () => {
    it("jelenti a szervernek: a /client-error címre, CSAK a végpont kulcsával", async () => {
        const {parseResponse, reportContractFault, post} = await loadModule();

        try {
            parseResponse(quoteSchema, {quote: 42}, ENDPOINTS.quotes);
        } catch (error) {
            reportContractFault(error);
        }

        expect(post).toHaveBeenCalledTimes(1);
        const [url, body] = at(post.mock.calls, 0, "jelentés-kérés");
        expect(url).toBe(BACKEND_URL + ENDPOINTS.clientError);
        /* A törzs PONTOSAN ennyi: se a valibot üzenete, se a kapott adat nem megy
           át a dróton. A `toEqual` itt szigorúbb, mint amilyennek látszik —
           minden további mező megbuktatná. */
        expect(body).toEqual({endpoint: ENDPOINTS.quotes});
    });

    it("NEM szerződés-hibát figyelmen kívül hagy (hálózati hiba, 401, bármi)", async () => {
        const {reportContractFault, post} = await loadModule();

        /* Kontroll: ha ezek bármelyike jelentést váltana ki, minden hálózati
           zökkenő a szerver naplójába kerülne — és a napló pont attól válna
           használhatatlanná, amitől hasznos lenne: a ritkaságától. */
        reportContractFault(new Error("Network Error"));
        reportContractFault({response: {status: 401}});
        reportContractFault("valami szöveg");
        reportContractFault(undefined);

        expect(post).not.toHaveBeenCalled();
    });

    it("ugyanarról a végpontról EGYSZER jelent, hiába romlik el sokszor", async () => {
        const {parseResponse, reportContractFault, post} = await loadModule();

        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                parseResponse(quoteSchema, {quote: 42}, ENDPOINTS.quotes);
            } catch (error) {
                reportContractFault(error);
            }
        }

        /* Egy elromlott szerződés nem egyszer sül el: a lista minden szűrő-
           váltásnál újratölt, a szerkesztő autosave-je percenként ír. A naplóba
           egy bejegyzés kell — a többi ugyanazt mondaná, csak elfedné a többi
           üzenetet, és a saját korlátozónkba futnánk bele. */
        expect(post).toHaveBeenCalledTimes(1);
    });

    it("KÜLÖNBÖZŐ végpontokról külön-külön jelent", async () => {
        const {parseResponse, reportContractFault, post} = await loadModule();

        for (const endpoint of [ENDPOINTS.quotes, ENDPOINTS.todos]) {
            try {
                parseResponse(quoteSchema, {quote: 42}, endpoint);
            } catch (error) {
                reportContractFault(error);
            }
        }

        expect(post).toHaveBeenCalledTimes(2);
        expect(post.mock.calls.map((call) => call[1])).toEqual([
            {endpoint: ENDPOINTS.quotes},
            {endpoint: ENDPOINTS.todos},
        ]);
    });

    it("a SIKERTELEN jelentés nem szivárog ki elkapatlan hibaként", async () => {
        const {parseResponse, reportContractFault, post} = await loadModule();
        post.mockRejectedValueOnce(new Error("a szerver sem elérhető"));

        /* Épp amikor baj van, a jelentés maga is elbukhat (a szerver nem válaszol).
           Ha ezt nem kapnánk el, egy "unhandled rejection" kerülne a konzolba —
           éles buildben is, ott, ahol szándékosan nem naplózunk. */
        expect(() => {
            try {
                parseResponse(quoteSchema, {quote: 42}, ENDPOINTS.quotes);
            } catch (error) {
                reportContractFault(error);
            }
        }).not.toThrow();

        // A visszautasított promise-nak legyen ideje lefutni, mielőtt a teszt véget ér.
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
});
