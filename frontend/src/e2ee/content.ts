/* SZEKCIÓ-TARTALOM TITKOSÍTÁSA — a mesterkulccsal, a HELYÉHEZ kötve.

   Egy szekció-elem tartalmi mezői (idézetnél: quote, author, fontSize, createdAt) EGY
   JSON-szövegbe sorosodnak, azt titkosítjuk egyetlen borítékba, és az a `ciphertext`
   mező megy a szerverre. A szerkezeti mezők (_id, order, updatedAt) NYÍLTAN maradnak — a
   szervernek kellenek (kulcs, sorrend, delta-szinkron). A séma és a build-vs-működés
   indoklás: E2EE.md 4. szakasz.

   AZ AAD = `${section}|${id}` — ez köti a ciphertextet a HELYÉHEZ. Az ellenséges szerver
   így nem cserélheti ki két elem `ciphertext`-jét (swap-támadás): a másik helyre tett
   blob AAD-je nem egyezik, a GCM-decrypt DOB. A két érték a szerkezeti (nyílt) mezőkből
   épül vissza olvasáskor, tehát nem kell a borítékba tenni.

   MIÉRT NINCS A USER AZ AAD-BEN (eltérés az F1a eredeti tervétől). Az AAD-t azonos módon
   kell felépíteni titkosításkor ÉS visszafejtéskor — mindkettő a KLIENSEN. A kliens a
   `section`-t (konstans) és az `_id`-t (a válaszban) ismeri, a saját Mongo user-id-jét
   viszont NEM: a szerver azt szándékosan sosem küldi ki (least-disclosure, l. Users/me.js).
   És nincs is rá szükség: a user-hez-kötést a PER-USER mesterkulcs adja — egy másik
   felhasználó a saját MK-jával a mi borítékunkat nem tudja megfejteni (a GCM-címke bukik),
   függetlenül az AAD-tól. A same-user és a szekció-swapet az `_id` és a `section` fogja.
   A `user` így redundáns volt ÉS kliens-oldalon rekonstruálhatatlan — kivéve. (Döntés
   2026-09-22, l. E2EE.md 4.)

   Miért determinisztikus, pipe-elválasztott AAD: az AAD-nak nem titkosnak, hanem
   EGYEDINEK és REPRODUKÁLHATÓNAK kell lennie elemenként. A section fix enum, az _id
   ObjectId-alakú — pipe nem fordul elő bennük, ütközés nincs. */

import {seal, open} from "./aead";

const aadFor = (section: string, id: string): Uint8Array =>
    new TextEncoder().encode(`${section}|${id}`);

/* A tartalom TITKOSÍTÁSA. A `plaintext` a tartalmi mezők kész JSON-szövege (a sorosítást
   a hívó — a szekció create/update útja — végzi, mert az tudja, mely mezők tartalmiak). */
export const encryptContent = (
    masterKey: Uint8Array,
    section: string,
    id: string,
    plaintext: string,
): string => seal(masterKey, new TextEncoder().encode(plaintext), aadFor(section, id));

/* A tartalom VISSZAFEJTÉSE. Rossz helyre tett blobnál vagy megbuherált mezőnél DOB (a
   GCM-címke az AAD-t is fedi) — a hívó dönti el, mit tesz vele (a listánál egy hibás
   elem ne vigye magával az egészet). */
export const decryptContent = (
    masterKey: Uint8Array,
    section: string,
    id: string,
    envelope: string,
): string =>
    new TextDecoder().decode(open(masterKey, envelope, aadFor(section, id)));
