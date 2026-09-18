/* SZEKCIÓ-TARTALOM TITKOSÍTÁSA — a mesterkulccsal, a HELYÉHEZ kötve.

   Egy szekció-elem tartalmi mezői (idézetnél: quote, author, fontSize, createdAt) EGY
   JSON-szövegbe sorosodnak, azt titkosítjuk egyetlen borítékba, és az a `ciphertext`
   mező megy a szerverre. A szerkezeti mezők (_id, user, section, order, updatedAt)
   NYÍLTAN maradnak — a szervernek kellenek (tulajdon, sorrend, delta-szinkron). A
   séma és a build-vs-működés indoklás: E2EE.md 4. szakasz.

   AZ AAD = `${section}|${id}|${user}` — ez köti a ciphertextet a HELYÉHEZ. Az ellenséges
   szerver így nem cserélheti ki két elem `ciphertext`-jét (swap-támadás): a másik helyre
   tett blob AAD-je nem egyezik, a GCM-decrypt DOB. A három érték a szerkezeti (nyílt)
   mezőkből épül vissza olvasáskor, tehát nem kell a borítékba tenni.

   Miért determinisztikus, pipe-elválasztott AAD: az AAD-nak nem titkosnak, hanem
   EGYEDINEK és REPRODUKÁLHATÓNAK kell lennie elemenként. A section fix enum, az _id és a
   user ObjectId-alakú — pipe nem fordul elő bennük, ütközés nincs. */

import {seal, open} from "./aead";

const aadFor = (section: string, id: string, user: string): Uint8Array =>
    new TextEncoder().encode(`${section}|${id}|${user}`);

/* A tartalom TITKOSÍTÁSA. A `plaintext` a tartalmi mezők kész JSON-szövege (a sorosítást
   a hívó — a szekció create/update útja — végzi, mert az tudja, mely mezők tartalmiak). */
export const encryptContent = (
    masterKey: Uint8Array,
    section: string,
    id: string,
    user: string,
    plaintext: string,
): string => seal(masterKey, new TextEncoder().encode(plaintext), aadFor(section, id, user));

/* A tartalom VISSZAFEJTÉSE. Rossz helyre tett blobnál vagy megbuherált mezőnél DOB (a
   GCM-címke az AAD-t is fedi) — a hívó dönti el, mit tesz vele (a listánál egy hibás
   elem ne vigye magával az egészet). */
export const decryptContent = (
    masterKey: Uint8Array,
    section: string,
    id: string,
    user: string,
    envelope: string,
): string =>
    new TextDecoder().decode(open(masterKey, envelope, aadFor(section, id, user)));
