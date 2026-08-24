/* HIBANAPLÓZÁS — a részletek a naplóba, de TITOK NÉLKÜL.

   MI VOLT A BAJ A KORÁBBI ALAKKAL. A naplózás eddig `console.error(context, error)`
   volt: a hibaOBJEKTUMOT adtuk át, és a kiírást a Node-ra bíztuk. A Node ilyenkor
   a `util.inspect`-tel dolgozik, ami a hibaobjektum ÖSSZES saját mezőjét kiírja,
   korlátlan mélységben. Vagyis nem mi döntöttük el, mi kerül a naplóba, hanem egy
   külső könyvtár hibaobjektumának az alakja — amit nem mi írunk, és verzióról
   verzióra változhat.

   MÉRVE (2026-08-24). Egy driver-hiba, aminek a mélyén ott a beszúrni kívánt
   dokumentum (`writeErrors[0].err.op` — így néz ki egy bulkWrite/insertMany hibája):
   a `util.inspect` kimenetében MEGJELENT a jelszó-hash ÉS a `draftKey` is. A napló
   pedig nem privilegizált hely: a systemd journalja, és onnan minden mentés,
   ami a naplót viszi.

   ⚠ ŐSZINTÉN A KOCKÁZAT MÉRTÉKÉRŐL: a `insertMany`/`bulkWrite` hívás MA NINCS a
   kódban (mérve), tehát ezt a konkrét utat ma nem járjuk be. A tétel nem is egy
   mai hívási út: az a baj, hogy a napló TARTALMÁT nem mi szabjuk meg. A whitelist
   ezt fordítja meg — innentől pontosan annyi kerül ki, amennyit felsorolunk.

   ⚠ ÉS EGY MÉRT TESZT-CSAPDA, ami miatt EGYETLEN, KÉSZ SZÖVEGET adunk át.
   A projekt tesztjei a naplót úgy fogják, hogy a `console.error`-t egy gyűjtőre
   cserélik: `console.error = (...args) => lines.push(args.join(" "))`. A `join`
   viszont `String(error)`-t hív, ami CSAK a "Név: üzenet" sort adja — a mély
   mezőket NEM. Ugyanazon a hibán mérve: a gyűjtő szerint a hash nincs a naplóban,
   a valódi napló szerint viszont OTT VAN. Egy "a napló nem szivárogtat" teszt
   tehát hamis zöldet adott volna. Ha a naplózó maga állítja össze a szöveget, és
   egyetlen argumentumként adja át, akkor a teszt PONTOSAN azt látja, ami a
   naplóba megy — nincs két igazság.

   KÉT RÉTEG, mert egyik sem elég önmagában:
     1. WHITELIST (describeError): csak a név, az üzenet, a `code` és a verem
        kerül ki. A hibaobjektum többi mezője — bármi is legyen — nem.
     2. REDAKTOR (redactSecrets): a fenti mezőkbe IS kerülhet titok, mert az
        üzenetet külső könyvtár fogalmazza (pl. "invalid hash: $2b$…"). Az ismert
        titok-alakokat ezért a kimenő szövegen is kicseréljük. */

// Ez a szó marad a titok helyén. Angolul, mert a napló gépi olvasásra is megy.
const REDACTED = "[REDACTED]";

/* AZ ISMERT TITOK-ALAKOK. Mindegyik a saját FORMÁJÁRA illeszkedik, nem egy
   mezőnévre: a napló szövegében nincsenek mezőnevek, csak szöveg.

   A negyedik (kapcsolati URI) SZÁNDÉKOSAN benne van, pedig MÉRVE ma nem szivárog:
   a mongoose/driver hibaüzenete parse-hibánál és elérhetetlen hosztnál sem írta ki
   a jelszót (2026-08-24). A minta a NEM MÉRT utakra és a jövőbeli verziókra szól —
   a `DATABASE` env-ben ott a Postgres-jelszó, és egy naplóba került kapcsolati URI
   azonnal a legsúlyosabb szivárgás volna. Az ára egyetlen `replace` hívás. */
const SECRET_PATTERNS = [
    // bcrypt-hash: "$2b$11$" + 53 karakter só és hash (l. password.js).
    [/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, REDACTED],
    /* A piszkozat-kulcs: 32 véletlen bájt base64-ben, ami pontosan 43 karakter
       + egy "=" kitöltés (l. draftKey.js). A lezáró "="-re illesztünk, nem a
       hossz találgatására — így nem csonkol, és a véletlen egyezés esélye kicsi. */
    [/\b[A-Za-z\d+/]{43}=/g, REDACTED],
    /* JWT: három base64url szakasz ponttal elválasztva. A fejléc mindig
       `{"alg"…`-gal kezdődik, aminek a base64 alakja "eyJ" — erre horgonyzunk. */
    [/\beyJ[A-Za-z\d_-]{5,}\.[A-Za-z\d_-]+\.[A-Za-z\d_-]+/g, REDACTED],
    // Kapcsolati URI jelszava: "séma://felhasználó:JELSZÓ@hoszt".
    [/([a-z][a-z\d+.-]*:\/\/[^\s:/@]+):[^\s/@]+@/gi, `$1:${REDACTED}@`],
];

/** A napló-szövegből kiszedi az ismert alakú titkokat. */
function redactSecrets(text) {
    return SECRET_PATTERNS.reduce(
        (result, [pattern, replacement]) => result.replace(pattern, replacement), text);
}

/* A HIBA LEÍRÁSA — a whitelist maga.

   A `stack` már tartalmazza a "Név: üzenet" első sort (a motor így állítja elő),
   ezért ha van verem, azt használjuk, és nem írjuk ki még egyszer a fejlécet.
   A `code` viszont nincs benne, pedig sokat mond (11000 = névütközés), ezért
   külön sorba kerül — de csak ha szám vagy szöveg: egy objektum `code` mező
   megint korlátlan mélységet hozna vissza.

   AMI ITT ELVÉSZ: a hibaobjektum egyéb mezői (`keyValue`, `errorResponse`,
   `writeErrors`…). Ez tudatos csere: a hibakereséshez az üzenet, a kód és a verem
   kell, és cserébe a napló tartalma megjósolható lesz.

   SEMMIKÉPP NEM DOBHAT. Ezt a függvényt 55 hívási hely mögül érik el, mind egy
   `catch` ágból: ha a naplózó maga szállna el, a hibakezelésből összeomlás lenne.
   Márpedig az `error` bármi lehet (a JS-ben bármit lehet dobni), és még egy
   `message` getter is dobhat — ezért a teljes törzs try/catch alatt van. */
function describeError(error) {
    try {
        if (error instanceof Error) {
            const code = typeof error.code === "string" || typeof error.code === "number"
                ? `\n(code: ${error.code})` : "";
            const stack = typeof error.stack === "string" && error.stack !== "" ? error.stack : "";
            return (stack === "" ? `${error.name}: ${error.message}` : stack) + code;
        }
        // Nem Error: a típusát is kiírjuk, mert az önmagában is hibára utal.
        return `nem Error típusú hiba (${typeof error}): ${String(error)}`;
    } catch {
        return "[a hiba leírása nem állítható elő]";
    }
}

/**
 * Egyetlen, kész szövegként naplóz egy hibát — időbélyeggel, redaktálva.
 * @param {string} context hol történt (pl. "Users.create")
 * @param {unknown} error a elkapott hiba — bármilyen érték lehet
 */
function logError(context, error) {
    // A kontextus is átmegy a redaktoron: oda is kerülhet titok, véletlenül.
    console.error(redactSecrets(`[${new Date().toISOString()}] ${context}: ${describeError(error)}`));
}

module.exports = {logError, redactSecrets, describeError};
