/* A PISZKOZAT TITKOSÍTÁSA — hogy a mentetlen munka ne feküdjön nyílt szöveggel a
   felhasználó lemezén.

   MI A BAJ, AMIT MEGOLD. A piszkozat (drafts.ts) a böngésző localStorage-ába
   kerül, az pedig egy közönséges fájl a böngésző profilkönyvtárában. Aki
   hozzáfér, elolvassa: egy MÁSIK OS-fiók ugyanazon a gépen, vagy bárki, aki egy
   ellopott, KIKAPCSOLT gépből kiszereli a lemezt. A felhasználó ráadásul nem is
   tud róla, hogy ott van — nem ő hozta létre, hanem a mentés vésztartaléka.

   Tárolót cserélni értelmetlen lett volna: az IndexedDB, az OPFS és a Cache
   Storage ugyanabba a profilkönyvtárba ír, ugyanúgy titkosítatlanul. Az egyetlen
   különbség az lehet, hogy MIT írunk oda.

   ÉS A TÖRLÉS SEM MEGOLDÁS: a localStorage egy LevelDB, ahol a `removeItem`
   sírkövet ír, a régi érték pedig a naplófájlokban marad a tömörítésig — sőt a
   felszabadított blokkokban azután is. Egy forenzikus eszköz tehát a korábban
   "törölt" piszkozatokat is kibányászná. Ezért nem a rövidebb megőrzési idő véd,
   hanem az, hogy oda soha ne kerüljön olvasható szöveg.

   A KULCS. Felhasználónként egy, a szerver adja (POST /drafts/key, l.
   backend/src/draftKey.js), és KIZÁRÓLAG ebben a modul-szintű változóban él —
   sehol nem írjuk le, se sütibe, se localStorage-ba. Ha leírnánk, pontosan
   ugyanoda kerülne, mint amit védeni akarunk, és az egész védelem üres formaság
   lenne. Ára: a lap újratöltésekor újra le kell kérni (a bejelentkezés
   munkamenet-sütije túléli az újratöltést, a memória nem) — addig NINCS
   piszkozat. Ez tudatos: a felhasználó elve szerint a BIZTONSÁG fontosabb, mint a
   piszkozat, tehát nyílt szöveget "vészmegoldásként" SOHA nem írunk.

   MIÉRT SAJÁT AES ÉS NEM A BÖNGÉSZŐ crypto.subtle-JE. Mert a leválási mentés a
   `pagehide` eseményben fut (Todos/save.tsx, Quotes/save.tsx): a lap épp
   megszűnik, ott csak SZINKRON kód fut le maradéktalanul. A `crypto.subtle`
   viszont kizárólag aszinkron (Promise), tehát a záródó lapon a titkosítás soha
   nem érne véget — pont a legfontosabb piszkozat veszne el. A @noble/ciphers
   szinkron, auditált AES-implementáció; saját AES-t írni pedig kizárt (l. lentebb).

   MÉRVE (2026-08-21, a Pi-n, rolldown --minify + gzip -9): a teljes titkosító
   réteg 3 838 B gzip, azaz a 198 kB-os bundle +1,9%-a. (Csak a `gcm` import:
   3 626 B. Az XChaCha20-Poly1305 NAGYOBB: 4 817 B — a "ChaCha olcsóbb" várakozás
   itt nem áll, mert a noble AES futásidőben számolja a tábláit.) Titkosítási idő
   ugyanott, 20 futás átlaga: 1 kB → 2,75 ms, 10 kB → 3,97 ms, 100 kB → 14,4 ms.
   A Pi lassabb minden kliensgépnél, tehát ez felső korlát: a lapbezárás nem akad meg.

   AMI ELLEN NEM VÉD. A szerver ismeri a kulcsot (ő adja), tehát ez nem
   zero-knowledge titkosítás. És egy XSS, ami a mi lapunkon fut, kiolvashatná a
   kulcsot ebből a változóból — ezért volt a CSP bekapcsolása (backend/src/csp.js)
   ennek a lépésnek az ELŐFELTÉTELE, nem kényelmi kiegészítése. */

import {gcm} from "@noble/ciphers/aes.js";

/* AES-256: a kulcs pontosan 32 bájt. A backend ugyanennyit generál
   (backend/src/draftKey.js KEY_BYTES) — a két oldal egyezését a
   backend/src/frontendContract.test.js kéri számon. */
const KEY_BYTES = 32;

/* A GCM ajánlott IV-hossza 96 bit = 12 bájt. Nem ízlés kérdése: ennél a
   hossznál használja a GCM az IV-t közvetlenül (rövidebb-hosszabb esetén előbb
   egy GHASH-en megy át), és minden implementáció ezt a méretet optimalizálja. */
const IV_BYTES = 12;

/* A TÁROLT ALAK ELSŐ TAGJA — a formátum neve. Miért kell: a lemezen fekvő érték
   minket TÚLÉL. Ha a titkosítás egyszer változik (más algoritmus, más
   kulcslevezetés), a régi bejegyzéseket meg kell tudni különböztetni az újaktól,
   különben a visszafejtés egy értelmetlen hibába fut, és a felhasználó munkája
   ott vész el. Egy néven nevezett formátum ezt olcsón megoldja. */
const FORMAT = "aesgcm1";
const SEPARATOR = ".";

/* A KULCS — MODUL-SZINTŰ VÁLTOZÓBAN, azaz a memóriában, a lap életére.

   A TÍPUS KIMONDVA (`Uint8Array | null`), nem a kezdőértékből következtetve:
   `null`-ból a fordító `null`-ra szűkítené a változót, és az első értékadás
   elszállna (l. CLAUDE.md, "kezdőérték ≠ típus"). */
let key: Uint8Array | null = null;

/* BASE64 A BÖNGÉSZŐ SAJÁT `btoa`/`atob`-jával — nulla bundle-költséggel.

   A DARABOLÁS NEM ÓVATOSKODÁS. A `String.fromCharCode(...bytes)` alak a tömb
   MINDEN bájtját külön argumentumként adná át, és a JS-motorok argumentum-száma
   véges: egy nagyobb piszkozatnál (több tízezer bájt) `RangeError: Maximum call
   stack size exceeded` lenne belőle — vagyis a HOSSZÚ jegyzet piszkozata veszne
   el, némán. A 8192-es darabolás ezt zárja ki (teszt: 200 kB-os piszkozat). */
const CHUNK = 8192;

function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let index = 0; index < bytes.length; index += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
    }
    return btoa(binary);
}

const base64ToBytes = (text: string): Uint8Array =>
    Uint8Array.from(atob(text), (character) => character.charCodeAt(0));

/* A KULCS ÁTVÉTELE a szervertől. A hossz-ellenőrzés VALÓDI vizsgálat, nem
   formaság: egy rossz alakú érték (elcsúszott végpont, burkolóba tett kulcs)
   különben csak az első titkosításnál derülne ki, a noble hibaüzenetével, és
   olyan helyen, ahol már nincs mit tenni. Itt viszont a hívó eldöntheti, hogy
   akkor inkább NINCS piszkozat. */
export function setDraftKey(base64Key: string): void {
    const bytes = base64ToBytes(base64Key);
    if (bytes.length !== KEY_BYTES) {
        throw new Error(`A piszkozat-kulcs ${bytes.length} bájt, pedig ${KEY_BYTES} kellene.`);
    }
    key = bytes;
}

/* A KULCS ELDOBÁSA — kijelentkezéskor. Nem "takarítás": amíg a kulcs a
   memóriában van, addig ezen a lapon bárki (a következő felhasználó a gép előtt,
   egy másik fül a saját kódjával nem, de a mi kódunk igen) visszafejthetné a
   piszkozatokat. A kijelentkezés azt jelenti, hogy innentől nem. */
export function clearDraftKey(): void {
    key = null;
}

// Van-e egyáltalán kulcsunk? A hívók ebből tudják, hogy van-e ma piszkozat-védelem.
export const hasDraftKey = (): boolean => key !== null;

/* A TÁROLT ÉRTÉK A MIÉNK-E? Nem "biztonsági" ellenőrzés (a formátum-jelölést
   bárki odaírhatja), hanem MEGKÜLÖNBÖZTETÉS: a localStorage-ban ott lehet még a
   titkosítás bevezetése ELŐTTI, nyílt szövegű piszkozat is. Azt nem visszafejteni
   kell, hanem elolvasni és titkosítva újraírni (l. drafts.ts) — enélkül a
   felhasználó mentetlen munkája veszne el az átállás miatt. */
export const isEncryptedDraft = (stored: string): boolean =>
    stored.startsWith(FORMAT + SEPARATOR);

/* TITKOSÍTÁS. Minden hívás FRISS, véletlen IV-t kap — ez a GCM legfontosabb
   szabálya. Ha ugyanazzal a kulccsal kétszer ugyanaz az IV áll elő, az nem csak
   a két üzenetet rontja el: a támadó a hitelesítő kulcsot is ki tudja számolni
   belőle, és onnantól hamisítani is tud. A `crypto.getRandomValues` a böngésző
   kriptográfiai véletlenforrása (nem a `Math.random`), 12 bájton pedig az
   ismétlődés esélye a gyakorlatban nulla — egy szerkesztő élete alatt néhány
   száz mentésről van szó.

   Az IV NEM TITOK: a titkos szöveg mellett tároljuk, mert a visszafejtéshez kell.
   Ez a GCM tervezett működése; ami titok, az kizárólag a kulcs. */
export function encryptDraft(plaintext: string): string {
    if (key === null) throw new Error("Nincs piszkozat-kulcs, nincs mivel titkosítani.");
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ciphertext = gcm(key, iv).encrypt(new TextEncoder().encode(plaintext));
    return [FORMAT, bytesToBase64(iv), bytesToBase64(ciphertext)].join(SEPARATOR);
}

/* VISSZAFEJTÉS. DOB, ha bármi nem stimmel — és ez a lényeg, nem a kellemetlenség.

   A GCM a titkos szöveg végére egy 16 bájtos HITELESÍTŐ CÍMKÉT tesz, és a
   `decrypt` ezt ellenőrzi: ha a tárolt értéken egy bájtot is átírtak (vagy más
   kulccsal titkosították), kivételt dob a visszafejtés helyett. Ezt a hibát SOHA
   nem nyeljük el itt — a hívó dolga eldönteni, mit kezd vele (a drafts.ts nem
   ajánl fel piszkozatot, és takarít). Egy elnyelt címke-hiba pontosan azt a
   garanciát törölné el, amiért a GCM-et választottuk: hogy amit visszakapunk,
   az az, amit mi írtunk oda. */
export function decryptDraft(envelope: string): string {
    if (key === null) throw new Error("Nincs piszkozat-kulcs, nincs mit visszafejteni.");
    const parts = envelope.split(SEPARATOR);
    const [format, ivBase64, ciphertextBase64] = parts;
    if (parts.length !== 3 || format !== FORMAT || ivBase64 === undefined
        || ciphertextBase64 === undefined) {
        throw new Error("A tárolt piszkozat nem a mi formátumunk.");
    }
    const iv = base64ToBytes(ivBase64);
    if (iv.length !== IV_BYTES) throw new Error("A tárolt piszkozat IV-je hibás hosszú.");
    return new TextDecoder().decode(gcm(key, iv).decrypt(base64ToBytes(ciphertextBase64)));
}
