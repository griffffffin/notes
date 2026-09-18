/* AEAD-BORÍTÉK az E2EE-hez — AES-256-GCM a @noble/ciphers-ből, AAD-támogatással.

   Ez a KÖZÖS titkosító primitív: erre épül a mesterkulcs becsomagolása (masterKey.ts)
   ÉS a szekció-tartalom titkosítása (content.ts) is. Egy helyen a formátum, az IV
   kezelése és a base64.

   MIÉRT KÜLÖN A PISZKOZAT-TITKOSÍTÁSTÓL (draftCrypto.ts). Kettő a különbség. (1) Ott
   NINCS AAD: a piszkozat a saját lemezén ül, nincs mihez kötni. Itt viszont a
   ciphertextet a HELYÉHEZ kötjük (l. content.ts: AAD = szekció|_id|user), hogy az
   ellenséges szerver ne cserélhessen ki két elemet swap-támadással. (2) Más a
   formátum-jelölő ("e2ee1" vs "aesgcm1"), mert a két adathalmaz külön migrál. A két
   modul szándékosan nem hivatkozik egymásra; a base64-segédek duplikációja tudatos
   (2. előfordulás), a kiszervezés a 3.-nál esedékes (l. abstraction-schedule memória).

   AZ AAD NEM MEGY A BORÍTÉKBA. A hitelesített, de nem titkosított adatot (AAD) a hívó
   a visszafejtésnél ÚJRAÉPÍTI a kontextusból (a tárolt _id/section/user mezőkből) — ha
   a szerver bármelyiket elrontja vagy kicseréli, a GCM-címke nem stimmel, és az `open`
   DOB. Ezért az AAD-t itt nem tároljuk. */

import {gcm} from "@noble/ciphers/aes.js";
import {base64ToBytes, bytesToBase64} from "./base64";

/* A GCM ajánlott IV-hossza 96 bit = 12 bájt (l. a részletes indoklást a
   draftCrypto.ts-ben): ennél a hossznál használja a GCM az IV-t közvetlenül. */
const IV_BYTES = 12;

/* A TÁROLT ALAK ELSŐ TAGJA a formátum neve — a lemezen/DB-ben fekvő érték minket túlél.
   Ha a titkosítás egyszer változik, a régi bejegyzéseket meg kell tudni különböztetni,
   különben a visszafejtés értelmetlen hibába fut. */
const FORMAT = "e2ee1";
const SEPARATOR = ".";

/* TITKOSÍTÁS. Minden hívás FRISS, véletlen IV-t kap — a GCM legfontosabb szabálya: ha
   ugyanazzal a kulccsal kétszer ugyanaz az IV áll elő, a támadó a hitelesítő kulcsot is
   ki tudja számolni. A `crypto.getRandomValues` a kriptográfiai véletlenforrás, 12
   bájton az ismétlődés esélye a gyakorlatban nulla. Az IV nem titok: a borítékban
   tároljuk, mert a visszafejtéshez kell.

   Az AAD (opcionális) a HITELESÍTETT, de nem titkosított adat: a GCM-címke lefedi, tehát
   ha visszafejtéskor más AAD-t adunk, a `decrypt` dob — de a boríték nem tartalmazza. */
export function seal(key: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array): string {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ciphertext = gcm(key, iv, aad).encrypt(plaintext);
    return [FORMAT, bytesToBase64(iv), bytesToBase64(ciphertext)].join(SEPARATOR);
}

/* VISSZAFEJTÉS. DOB, ha bármi nem stimmel — és ez a lényeg. A GCM a titkos szöveg végére
   egy 16 bájtos hitelesítő címkét tesz; a `decrypt` ezt ellenőrzi, és ha a ciphertexten,
   az IV-n VAGY az AAD-n egy bájt is más, kivételt dob. Ezt a hibát SOHA nem nyeljük el
   itt: a hívó dolga eldönteni, mit kezd vele (rossz jelszó, megbuherált tárolt érték,
   idegen helyre tett blob). Egy elnyelt címke-hiba pont azt a garanciát törölné, amiért
   a GCM-et választottuk. */
export function open(key: Uint8Array, envelope: string, aad?: Uint8Array): Uint8Array {
    const parts = envelope.split(SEPARATOR);
    const [format, ivBase64, ciphertextBase64] = parts;
    if (parts.length !== 3 || format !== FORMAT || ivBase64 === undefined
        || ciphertextBase64 === undefined)
        throw new Error("Az AEAD-boríték nem a mi formátumunk.");
    const iv = base64ToBytes(ivBase64);
    if (iv.length !== IV_BYTES) throw new Error("Az AEAD-boríték IV-je hibás hosszú.");
    return gcm(key, iv, aad).decrypt(base64ToBytes(ciphertextBase64));
}
