/* A SZERZŐDÉS-HIBA: amikor a szerver válasza nem olyan alakú, mint amire a
   frontend számít.

   MI EZ, ÉS MIÉRT KÜLÖN FOGALOM. Minden szerver-választ sémával ellenőrzünk
   (types/api.ts), tehát az elcsúszott alak nem jut be az alkalmazásba — eddig jó.
   A baj az, ami UTÁNA történt: a séma bukása pontosan ugyanazon az úton ment,
   mint egy időtúllépés vagy egy megszakadt kapcsolat, és a hívási helyek
   ugyanazt csinálták vele (üres lista + naplózás). Csakhogy a kettő NEM ugyanaz:

     - a hálózati hiba a VILÁG hibája, átmeneti, a felhasználó újrapróbálhatja;
     - a szerződés-hiba a MI hibánk, tartós, és újrapróbálásra sem múlik el.

   És épp a mienk volt a láthatatlan: éles buildben a naplózás néma (log.ts), a
   képernyőn pedig üres lista maradt — ami tökéletesen úgy néz ki, mint a "még
   nincs adatod" állapot. Vagyis egy backend-oldali átnevezés némán elvehette
   volna egy egész szekció tartalmát, és soha nem tudtunk volna róla.

   KÉT DOLGOT CSINÁL EZ A MODUL:

     1. MEGJELÖLI. A `parseResponse` a séma bukását `ContractError`-rá alakítja,
        amiben benne van, MELYIK végpont válasza volt rossz.
     2. JELENTI. Elküldi a backendnek a végpont kulcsát (/client-error), ahonnan a
        Pi naplójába kerül. Ez az egyetlen módja, hogy éles hibáról tudomást
        szerezzünk — a felhasználó böngésző-konzoljába senki nem néz bele, és oda
        nem is valók a belső részletek.

   AMIT SZÁNDÉKOSAN NEM CSINÁL: nem szól a FELHASZNÁLÓNAK. Volt egy változat, ami
   figyelmeztető sávot villantott fel a képernyőn — el is vetettük: idegen volt az
   app képétől, és a szövege a fejlesztőnek szólt, nem annak, aki olvasni akar egy
   idézetet. A felhasználónak elég annyit tudnia, amennyi RÁ tartozik: hogy a lista
   most nem érhető el. Ezt ott mondjuk el, ahol az adat lenne
   (components/CardList/CardListView.tsx), az app saját stílusában — nem egy
   külön csatornán. A "melyik végpont, milyen mező" a naplóba való. */

import axios from "axios";
import * as v from "valibot";
import {BACKEND_URL} from "./backendUrl";
import {ENDPOINTS, type Endpoint} from "./endpoints";

/* A jelentés SAJÁT, rövidebb határideje. A kérés "tűz és felejtsd el": ha a
   szerver nem válaszol, nincs mire várni, viszont egy 15 másodpercig nyitva
   tartott kapcsolat épp akkor terhelne, amikor amúgy is baj van. */
const REPORT_TIMEOUT_MS = 5000;

/* A séma bukásának SAJÁT hibatípusa. Azért osztály (és nem egy `{contract: true}`
   mezős objektum), mert az `instanceof` VALÓDI futásidejű vizsgálat: nem hisszük
   el egy értékről, hogy szerződés-hiba, hanem megnézzük (l. CLAUDE.md, "az `as`
   nem ellenőrzés").

   Az eredeti hiba a `cause`-ba kerül — a valibot üzenete a fejlesztőnek szól, a
   naplóban ott a helye; a szerverhez SEMMI nem megy belőle, csak a végpont
   kulcsa. */
class ContractError extends Error {
    readonly endpoint: Endpoint;

    constructor(endpoint: Endpoint, cause: unknown) {
        super(`A(z) ${endpoint} válasza nem felel meg a sémának.`, {cause});
        this.name = "ContractError";
        this.endpoint = endpoint;
    }
}

/* A SÉMA-ELLENŐRZÉS a hívási helyeken. Ugyanaz, mint a `v.parse`, plusz annyi,
   hogy tudja, MELYIK végpontról van szó.

   A GENERIKUS PARAMÉTER ITT NEM ÜRES ÍGÉRET, pedig úgy néz ki. A CLAUDE.md
   szabálya a `fn<T>(…)` alakú hívás ellen szól, ahol a `T`-t a HÍVÓ MONDJA MEG,
   és senki nem veti össze a valósággal. Itt a `TSchema` nem állítás, hanem a
   ténylegesen ÁTADOTT séma-objektum típusa — a fordító abból VEZETI LE, és a
   `v.parse` futásidőben tényleg aszerint vizsgál. A típus tehát nem megelőlegez
   semmit: pontosan azt írja le, ami az ellenőrzésből kijön. */
export function parseResponse<TSchema extends v.GenericSchema>(
    schema: TSchema,
    data: unknown,
    endpoint: Endpoint,
): v.InferOutput<TSchema> {
    try {
        return v.parse(schema, data);
    } catch (error) {
        throw new ContractError(endpoint, error);
    }
}

/* MÁR JELENTETT végpontok — oldalbetöltésenként egyszer jelentünk mindegyikről.

   Miért kell: egy elromlott szerződés nem egyszer sül el. A lista-betöltés minden
   szűrő-váltásnál újrafut, a szerkesztő autosave-je percenként ír — egy hibás
   séma percek alatt több száz jelentést küldene ugyanarról. A szerver
   korlátozója (backend/src/middleware/rateLimit.js) ezt kivédené, de akkor a
   NÁLUNK keletkező zajt hárítanánk át rá; a jelentésnek eleve ritkának kell
   lennie. Egy végpontról egyszer tudni: pontosan annyi információ, amennyi kell. */
const reported = new Set<Endpoint>();

/* A HIBAÁG EGYETLEN BELÉPÉSI PONTJA: a handleAxios minden elkapott hibát ideküld,
   és itt dől el, szerződés-hiba volt-e. Ha nem az (hálózati hiba, 401, időtúllépés),
   nem történik semmi — azokkal a hívási helyek foglalkoznak, ahogy eddig. */
export function reportContractFault(error: unknown): void {
    if (!(error instanceof ContractError)) return;
    if (reported.has(error.endpoint)) return;
    reported.add(error.endpoint);

    /* A JELENTÉS MAGA NEM MEHET A handleAxios-on: az hibánál ugyanide vezetne
       vissza (a jelentés hibája újabb jelentést szülne), a tokenre pedig nincs
       szüksége — a végpont szándékosan publikus. A `.catch` NEM elhanyagolás: ha a
       jelentést nem sikerül leadni, azon már nincs mit tenni, viszont egy
       elkapatlan promise-hiba a konzolba írna, éles buildben is. */
    axios.post(BACKEND_URL + ENDPOINTS.clientError, {endpoint: error.endpoint},
        {timeout: REPORT_TIMEOUT_MS})
        .catch(() => {});
}
