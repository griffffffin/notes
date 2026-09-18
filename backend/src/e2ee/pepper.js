/* A "BORS" (pepper) — SZERVER-OLDALI titok, amivel a tárolt `wrappedMk`-t még egyszer
   titkosítjuk. AES-256-GCM, a node beépített kriptójával (a natív @noble a frontend
   dolga; a backendnek a node:crypto elég, nulla új függőség).

   MIT AD. A `wrappedMk`-t a KLIENS a jelszóból származtatott kulccsal (KEK) csomagolja be
   — de egy GYENGE jelszó offline kitalálható egy kiszivárgott adatbázisból. A bors ezt
   zárja: a `wrappedMk` tárolás előtt EBBEN a szerver-titokban is fürdik, tehát egy ellopott
   `pg_dump` ÖNMAGÁBAN (az `.env` nélkül) használhatatlan — a támadónak a bors-titok is
   kellene. NEM sérti az E2EE-t: a szerver a jelszót/MK-t továbbra sem látja, csak egy
   opaque borítékot vesz körül még egy réteggel.

   MIT NEM AD. Ha a FUTÓ gépet feltörik (DB + `.env` + memória együtt), a bors is elvész —
   ez ellen semmi (egygépes web-E2EE korlát, l. E2EE.md). A bors a NYUGALMI, RÉSZLEGES
   szivárgás (mentés/dump `.env` nélkül) ellen véd. Részletes mérleg: a repó E2EE.md-jében.

   A KULCS AZ `E2EE_PEPPER` KÖRNYEZETI VÁLTOZÓBÓL jön (32 bájt base64), a JWT_SECRET
   mintájára. HASZNÁLATKOR olvassuk, nem betöltéskor: így ez a modul importálható a
   szerver-titok nélkül is (teszt, eszközök), és a hiány ott hasal el hangosan, ahol
   tényleg borsozni kellene — nem néma fél-védelemként. */

const crypto = require("node:crypto");

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const FORMAT = "pepper1";
const SEPARATOR = ".";

/* A bors-kulcs kiolvasása és ellenőrzése — MINDEN hívásnál (olcsó: egy 44 karakteres
   base64 dekódolása). Így egy teszt, ami a fájl elején állítja az env-et, biztosan a
   friss értéket kapja, és nincs modul-szintű gyorsítótár, ami elavulhatna. */
function pepperKey() {
    const base64 = process.env.E2EE_PEPPER;
    if (typeof base64 !== "string" || base64 === "")
        throw new Error("Hiányzó E2EE_PEPPER — a szerver a wrappedMk borsozásához titkot vár.");
    const key = Buffer.from(base64, "base64");
    if (key.length !== KEY_BYTES)
        throw new Error(`Az E2EE_PEPPER ${key.length} bájt, pedig ${KEY_BYTES} kellene.`);
    return key;
}

/* BORSOZÁS. Friss, véletlen IV minden hívásnál (GCM-szabály). A tárolt alak
   "pepper1.<iv-b64>.<ct+tag-b64>" — a formátum-jelölő itt is azért kell, mert a tárolt
   érték minket túlél: ha a bors egyszer változik, a régit meg kell tudni különböztetni. */
function sealWithPepper(plaintext) {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, pepperKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const blob = Buffer.concat([ciphertext, cipher.getAuthTag()]);
    return [FORMAT, iv.toString("base64"), blob.toString("base64")].join(SEPARATOR);
}

/* LESZEDÉS. DOB, ha a boríték nem a mi formátumunk, vagy ha a hitelesítő címke nem
   stimmel (más bors-kulcs, megbuherált tárolt érték) — a hibát a hívó (login/me
   controller) fordítja 500-zá és naplózza; néma fél-eredményt sosem adunk. */
function openWithPepper(envelope) {
    const parts = envelope.split(SEPARATOR);
    const [format, ivBase64, blobBase64] = parts;
    if (parts.length !== 3 || format !== FORMAT || ivBase64 === undefined || blobBase64 === undefined)
        throw new Error("A bors-boríték nem a mi formátumunk.");
    const iv = Buffer.from(ivBase64, "base64");
    const blob = Buffer.from(blobBase64, "base64");
    if (iv.length !== IV_BYTES || blob.length < TAG_BYTES)
        throw new Error("A bors-boríték hibás alakú.");
    const ciphertext = blob.subarray(0, blob.length - TAG_BYTES);
    const tag = blob.subarray(blob.length - TAG_BYTES);
    const decipher = crypto.createDecipheriv(ALGORITHM, pepperKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

module.exports = {sealWithPepper, openWithPepper};
