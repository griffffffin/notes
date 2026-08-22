import {decryptDraft, isEncryptedDraft} from "../draftCrypto";
import {acceptDraftKey} from "../draftKeySession";

/* A TESZTEK PISZKOZAT-KULCSA.

   Élesben a kulcs a szervertől jön, bejelentkezéskor (draftKeySession.ts), és a
   piszkozat CSAK vele íródik ki — kulcs nélkül nincs helyi másolat. A
   szerkesztők tesztjeiben viszont a hitelesítési context ki van cserélve
   (test/mockAuth.ts), tehát az a lekérés nem fut le: a kulcsot kézzel kell
   megadni, különben a piszkozat-tesztek nem azt vizsgálnák, amit hisznek —
   egyszerűen nem születne piszkozat.

   A KULCS ÉRTÉKE ÁLLANDÓ (nem véletlen): egy teszt ne lehessen hol zöld, hol
   piros. Titkot nem tartalmaz, a valódi kulcsokhoz semmi köze — csak az ALAKJA
   valódi: 32 bájt base64-ben, pontosan úgy, ahogy a végpont adja. */
const TEST_DRAFT_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

/* A szerkesztő-tesztek beforeEach-éből hívva: legyen piszkozat-védelem.

   AZON AZ ÚTON adja oda a kulcsot, amin az app is kapja (`acceptDraftKey`) — nem
   a `setDraftKey`-t hívja közvetlenül. A különbség nem formaság: a szerkesztő
   KAPUJA (useDraftKeyGate) a felíratkozókon át értesül a kulcsról, és a puszta
   `setDraftKey` nem szólna nekik — a tesztek szerkesztője örökké betöltő
   karikát mutatna. */
export const giveDraftKey = (): void => acceptDraftKey(TEST_DRAFT_KEY);

/* A TÁROLT PISZKOZAT KIOLVASÁSA A TESZTEKNEK — visszafejtve.

   A tesztek korábban a nyers localStorage-értéket nézték (`toContain("Az élet
   szép")`), ami a titkosítás óta természetesen nem tartalmazza a szöveget — és ez
   így helyes. A vizsgálat tárgya nem is a nyers érték volt soha, hanem hogy MI
   KERÜLT a piszkozatba; ez a segéd ezt adja vissza, a burok alakjában.

   A nyers alakot SZÁNDÉKOSAN nem rejti el teljesen: a drafts.test.ts külön
   vizsgálja, hogy a lemezen tényleg olvashatatlan az érték — ott az a tárgy. */
export function readStoredDraft(key: string): unknown {
    const stored = localStorage.getItem(key);
    if (stored === null) return null;
    return JSON.parse(isEncryptedDraft(stored) ? decryptDraft(stored) : stored);
}
