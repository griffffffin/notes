const argon2 = require("argon2");
const bcrypt = require("bcrypt");

/* A JELSZÓ-TÁROLÁS egyetlen helye. Itt dől el, MIVEL hashelünk (argon2id), MILYEN
   paraméterekkel, és hogyan ellenőrzünk egy MÁR TÁROLT hasht — beleértve a régi,
   bcrypt-tel készült hasheket a migráció idejére.

   MIÉRT ARGON2ID a bcrypt helyett. A bcrypt lassítása tisztán SZÁMÍTÁSI: a
   munkaterülete ~4 kB, ami elfér egy GPU vagy ASIC gyorsítótárában, így a támadó
   sok ezer példányt futtathat párhuzamosan olcsón. Az argon2id ezzel szemben
   MEMÓRIA-IGÉNYES: minden egyes hash-számítás egy nagy (itt 46 MiB) memóriatömböt
   tölt fel és olvas vissza. Ez nem fér a gyorsítótárba, tehát a támadó
   párhuzamossága a memória SÁVSZÉLESSÉGÉBE ütközik, nem a számításba — épp az a
   hardveres előny esik ki, amivel a jelszavakat tömegével törik. Az argon2id az
   OWASP első ajánlása jelszó-tárolásra.

   A PARAMÉTEREK — MÉRVE EZEN A GÉPEN (Pi 4B, 2026-09-06; argon2id, p=1, a hash
   mediánja 7 futásból, ms):
       m=19 MiB: t1=59  t2=106  t3=157
       m=32 MiB: t1=171 t2=253  t3=338
       m=46 MiB: t1=244 t2=364  t3=484
       m=64 MiB: t1=353 t2=508  t3=681
       m=96 MiB: t1=515 t2=771  t3=1041

   VÁLASZTÁS: memoryCost=47104 KiB (46 MiB), timeCost=1, parallelism=1 → 244 ms.
   Miért ez: (1) a cél a bcrypt-11 eddigi ~245 ms-je volt, hogy a belépés továbbra
   is azonnalinak érződjön, az indulás (álca-hash) ne álljon sokat, és a
   libuv NÉGY szálas threadpoolját egy belépés-hullám ne fojtsa meg — négy
   párhuzamos hash itt 4×46 MiB = 184 MiB csúcsot jelent, a 7,6 GB-nak töredéke.
   (2) Azonos idő mellett a NAGYOBB memóriát preferáljuk (több GPU-ellenállás),
   ezért esett a t=1/46 MiB (244 ms) a t=2/32 MiB (253 ms) helyett. (3) Ez egyben
   egy OWASP-ajánlott konfiguráció is (m=47104, t=1, p=1).

   A KÖLTSÉG ÉS A KÉRÉS-KORLÁTOZÁS EGYÜTT JÁR: a hashelés drágítása önmagában
   többet adna a támadónak (olcsóbb DoS a hitelesítési végpontokon), mint nekünk —
   a login/regisztráció kérés-korlátozása ezért ennek a FELTÉTELE. */
const ARGON2_OPTIONS = {
    type: argon2.argon2id,
    memoryCost: 47104,   // 46 MiB — l. a mérést fent
    timeCost: 1,
    parallelism: 1,
};

/* A MIGRÁCIÓ: két algoritmus él egyszerre. A bcrypt-tel készült régi hasheket a
   verifyPassword az előtagjukból ismeri fel ("$2b$"/"$2a$"/"$2y$" = bcrypt,
   "$argon2" = argon2), és a megfelelő könyvtárral ellenőrzi. Új hash MINDIG
   argon2id (hashPassword). A régi hash a tulajdonosa KÖVETKEZŐ sikeres
   belépésekor íródik át argon2id-re (l. controllers/Users/login.js
   rehashIfNeeded) — felhasználónként egyetlen belépés zárja le. A bcrypt akkor
   vehető ki innen és a package.json-ból, ha a DB-ben már nincs "$2b$"-hash. */
async function hashPassword(password) {
    return argon2.hash(password, ARGON2_OPTIONS);
}

/* A tárolt hash ellenőrzése a jelszóval szemben, algoritmus-függetlenül.

   Az argon2.verify a ROSSZ jelszóra `false`-t ad, de egy STRUKTURÁLISAN romlott
   ("$argon2" előtagú, de értelmezhetetlen) hashre DOB. Az ilyet nem engedjük
   500-zá dagadni: nem-egyezésként kezeljük (a hívó a szokásos 400-at adja,
   l. login.js), a hibát a hívó naplózza. A bcrypt.compare érvénytelen hashre
   `false`-t ad (nem dob), ezért a bcrypt-ág nem igényel külön kezelést. */
async function verifyPassword(hash, password) {
    if (hash.startsWith("$argon2"))
        return argon2.verify(hash, password);
    return bcrypt.compare(password, hash);
}

/* Igaz, ha a tárolt hasht ÚJRA KELL hashelni a mai beállítással. Két ok:
     - nem argon2id (tehát régi bcrypt-hash) → át kell állni;
     - argon2id, de más paraméterrel készült (jövőbeli m/t/p-emelés) → az
       argon2.needsRehash ezt az összevetést végzi, csak érvényes argon2-hasht kap
       (ide már csak sikeres verifyPassword után jutunk, tehát a hash ép). */
function needsRehash(hash) {
    if (!hash.startsWith("$argon2")) return true;
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
}

/* AZ ÁLCA-HASH a bejelentkezés időzítés-szivárgása ellen véd. Ha ismeretlen névnél
   azonnal válaszolnánk, létező névnél viszont megvárnánk az argon2id ~244 ms-át, a
   válaszidőből kiderülne, létezik-e a fiók — hiába azonos a hibaüzenet. Ezért
   ismeretlen névnél is lefuttatunk egy ellenőrzést EZZEL a hash-sel (l. login.js).

   KRITIKUS, hogy az álca-hash UGYANAZZAL az algoritmussal és paraméterrel készüljön,
   mint a valódi jelszavaké — különben a két ág mérhetően eltérő ideig futna, és épp
   azt árulná el, amit rejteni akarunk. A kötés SZERKEZETI: ugyanabból az
   ARGON2_OPTIONS-ból származik, elcsúszni nem tud.

   AZ ÁTMENET IDEJÉN kevert a mező: a még át nem hashelt jelszavak bcrypt-11-esek
   (~245 ms), az álca-hash már argon2id (~244 ms). A két szám szándékosan van
   egymáshoz hangolva (l. a paraméter-választást fent), ezért az ismeretlen-név ág
   és a bcrypt-fiók ág ideje az átmenet alatt is fedi egymást.

   ELTÉRÉS a régi bcrypt-es változattól: a bcryptnek volt szinkron hashSync-je, így
   az álca-hash egy modul-szintű konstans lehetett. Az argon2 CSAK aszinkron, ezért
   az álca-hasht egy Promise-ban tartjuk. A modul betöltésekor MELEGEN indítjuk (az
   első belépés ne várjon a számításra), a login pedig ugyanezt a Promise-t várja
   be. A no-op .catch csak azt akadályozza meg, hogy egy induláskori elutasítás
   „unhandledRejection"-ként dobjon; a VALÓDI kezelés (és a hiba felszínre hozása) a
   login await-jén történik. */
const DUMMY_PASSWORD = "nincs-ilyen-jelszo";
const dummyHashPromise = argon2.hash(DUMMY_PASSWORD, ARGON2_OPTIONS);
dummyHashPromise.catch(() => {});

module.exports = {hashPassword, verifyPassword, needsRehash, dummyHashPromise};
