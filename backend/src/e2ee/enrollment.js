/* AZ E2EE-BEIRATKOZÁS (enrollment) a szerver oldalán — TÁROLÁS ÉS ÁTADÁS, semmi több.

   MIT TESZ A SZERVER, ÉS MIT NEM. A végpontok közötti titkosításnál a kulcs-származtatás
   (Argon2id) és a mesterkulcs a KLIENSEN él; a szerver a mesterkulcsot és a jelszót SOHA
   nem látja. Amit a szerver kap és eltesz, az három NEM-titkos adat:
     - `wrappedMk`  — a mesterkulcs, a jelszóból származtatott kulccsal (KEK) becsomagolva
                      (AES-GCM boríték). Kulcs nélkül értelmezhetetlen; a szerver csak tárolja.
     - `kdfSalt`    — a jelszó-KDF sója (base64). Nem titok; a szerepe, hogy két azonos
                      jelszó ne adjon azonos KEK-et, és hogy előre számolt tábla ne fogjon.
     - `kdf`        — a KDF paraméterei (algoritmus + memória/iteráció/párhuzamosság). A
                      kliens ezekkel számolja ÚJRA a KEK-et feloldáskor; ezért kell tárolni.

   A szerver EZEKKEL SEMMIT NEM SZÁMOL: nem futtat Argon2-t (azt a kliens teszi), csak
   eltárolja és a tulajdonosnak visszaadja. Ezért az itteni validáció nem kriptográfiai
   ellenőrzés — a boríték épségét a kliens AEAD-je dönti el visszafejtéskor —, hanem
   HIGIÉNIA: típus, ésszerű méret- és tartomány-korlát, hogy szemét vagy DoS-méretű adat
   ne kerüljön a tárba. */

// A becsomagolt mesterkulcs egy "e2ee1.<iv-b64>.<ct-b64>" boríték — iv 16 + ct(48 bájt) 64
// base64-karakter körül van; bőséges felső korlát a szemét/DoS ellen. A szerver a belsejét
// NEM parse-olja (opaque ciphertext), csak a méretét korlátozza.
const {sealWithPepper, openWithPepper} = require("./pepper");

const WRAPPED_MK_MAX = 256;
const KDF_SALT_MAX = 64;

// A KDF-paraméterek ésszerű tartománya. A szerver ezeket nem futtatja, de egy abszurd
// érték a KLIENST akasztaná meg a következő feloldáskor — a korlát ez ellen véd.
const KDF = {
    ALGORITHM: "argon2id",             // az egyetlen támogatott KDF (l. frontend masterKey.ts)
    MEMORY_MIN: 8, MEMORY_MAX: 1048576, // KiB: 8 KiB .. 1 GiB
    ITERATIONS_MIN: 1, ITERATIONS_MAX: 20,
    PARALLELISM_MIN: 1, PARALLELISM_MAX: 16,
};

const isBoundedString = (value, max) =>
    typeof value === "string" && value.length > 0 && value.length <= max;

// Kanonikus egész az adott zárt tartományban — a törtek és a NaN/Infinity is kiesnek.
const isIntInRange = (value, min, max) =>
    typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

/* A KDF-PARAMÉTEREK WHITELISTJE — egy helyen, mert három út is ugyanezt a négy mezőt
   másolja (tárolás, tulajdonosnak visszaadás, mentés-export). Külön másolatokban élve egy
   ötödik paraméter felvételekor csendben elcsúsznának (CLAUDE.md: kézzel szinkronizált
   másolat). Az engedélyezett mezőnév nem ellenőrzött érték — az értékeket a validateEnrollment
   köti meg, ez csak a KIMENŐ alakot szűkíti. */
const pickKdf = (kdf) => ({
    algorithm: kdf.algorithm,
    memorySize: kdf.memorySize,
    iterations: kdf.iterations,
    parallelism: kdf.parallelism,
});

/* A REGISZTRÁCIÓS TÖRZS beiratkozási részének ellenőrzése. Igaz/hamis helyett HIBAÜZENETET
   ad vissza (vagy null-t, ha rendben) — a hívó (Users/create) így egyetlen helyen dönt a
   státuszról. A `kdf` egy beágyazott objektum; a mezőit egyenként kötjük meg (az
   engedélyezett mezőnév nem ellenőrzött érték, l. CLAUDE.md). */
function validateEnrollment(body) {
    if (!isBoundedString(body?.wrappedMk, WRAPPED_MK_MAX))
        return "Hiányzó vagy hibás becsomagolt mesterkulcs.";
    if (!isBoundedString(body?.kdfSalt, KDF_SALT_MAX))
        return "Hiányzó vagy hibás KDF-só.";

    const kdf = body?.kdf;
    if (typeof kdf !== "object" || kdf === null)
        return "Hiányzó KDF-paraméterek.";
    if (kdf.algorithm !== KDF.ALGORITHM)
        return "Nem támogatott KDF-algoritmus.";
    if (!isIntInRange(kdf.memorySize, KDF.MEMORY_MIN, KDF.MEMORY_MAX))
        return "Hibás KDF memória-paraméter.";
    if (!isIntInRange(kdf.iterations, KDF.ITERATIONS_MIN, KDF.ITERATIONS_MAX))
        return "Hibás KDF iteráció-paraméter.";
    if (!isIntInRange(kdf.parallelism, KDF.PARALLELISM_MIN, KDF.PARALLELISM_MAX))
        return "Hibás KDF párhuzamosság-paraméter.";

    return null;
}

/* A TÁROLANDÓ ALAK — kizárólag az engedélyezett mezők, explicit felsorolással (nem a nyers
   body, ami tömeges-értékadás volna, l. CLAUDE.md). A `kdf`-et is mezőnként másoljuk.

   A `wrappedMk` BORSOZVA kerül a tárba (pepper.js): a kliens által becsomagolt kulcsot a
   szerver-titokkal még egyszer titkosítjuk, hogy egy `.env` nélkül kiszivárgott dump ne
   legyen offline törhető. A `kdfSalt` és a `kdf` NEM titok (a kliens így is így úgy is
   megkapja őket a feloldáshoz), azokat nem borsozzuk. */
const enrollmentToStore = (body) => ({
    wrappedMk: sealWithPepper(body.wrappedMk),
    kdfSalt: body.kdfSalt,
    kdf: pickKdf(body.kdf),
});

/* A KIFELÉ MENŐ ALAK — a tulajdonosnak, feloldáshoz. WHITELIST: pontosan a három
   beiratkozási mező, semmi más a user-dokumentumból. A `wrappedMk`-ról LESZEDJÜK a borsot
   (openWithPepper), hogy a kliens a saját KEK-jével kicsomagolhassa. Ha a fiók nincs
   beiratkozva (régi, E2EE előtti fiók), `null` — a kliens ebből tudja, hogy nincs mit
   feloldani. (Az openWithPepper DOBHAT rossz/hiányzó bors-titoknál; a hívó controller
   naplózza és 500-at ad — néma fél-eredményt sosem adunk.) */
function projectEnrollment(user) {
    if (!user?.wrappedMk || !user?.kdf) return null;
    return {
        wrappedMk: openWithPepper(user.wrappedMk),
        kdfSalt: user.kdfSalt,
        kdf: pickKdf(user.kdf),
    };
}

module.exports = {validateEnrollment, enrollmentToStore, projectEnrollment, pickKdf};
