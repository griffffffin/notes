/* PERMISSIONS-POLICY — mely böngésző-KÉPESSÉGEKHEZ nyúlhat egyáltalán a lapunk.

   MI EZ. A CSP azt mondja meg, honnan tölthető erőforrás; a Permissions-Policy egy
   MÁSIK HTTP-fejléc, ami azt mondja meg, mely erős böngésző-API-kat használhatja a
   lap: kamera, mikrofon, helymeghatározás, USB, fizetés stb. Amit itt letiltunk,
   azt a böngésző a mi lapunkon (és a beágyazott kereteinkben) meg sem engedi
   használni — még akkor sem, ha egy befecskendezett szkript próbálná.

   MIÉRT KELL, HA NEM IS HASZNÁLJUK EZEKET. Épp AZÉRT, mert nem használjuk. Egy
   jegyzet-app nem kér kamerát vagy helymeghatározást; ha egy XSS mégis megtenné,
   annak semmi keresnivalója. A „letiltjuk, amire nincs szükségünk" a legkisebb
   jogosultság elve fejléc-szinten: a támadási felületet szűkíti, mérhető ár nélkül.
   MÉRVE (2026-09-06): a helmet ma NEM adja ezt a fejlécet, tehát alapból minden
   képesség engedélyezett — ezt zárjuk le.

   AZ ÉRTÉKEK JELENTÉSE. `feature=()` = SENKI nem használhatja (üres allowlist);
   `feature=(self)` = csak az azonos origin. A lenti lista MÉRT: a felsorolt
   képességeket az app kódja sehol nem használja (kamera, geolokáció, USB, vágólap…),
   ezért MIND üres allowlistet kap.

   A VÁGÓLAP TELJESEN TILTVA. Korábban `clipboard-write=(self)` volt engedélyezve az
   idézet-megosztás link-másoló gombjához — de az a megosztás a végpontok közötti
   titkosítás (E2EE) átállásával kikerült (a publikus megosztás a külön menetbe, a
   Shared táblára épül), és a frontenden ma SEMMI nem ír a vágólapra. A legkisebb
   jogosultság elve szerint tehát `clipboard-write=()` is: amire nincs használó,
   azt letiltjuk. (Ha a megosztás-menet visszahozza a link-másolást, ITT kell újra
   `(self)`-re nyitni — és élesítés előtt kézzel kipróbálni.) Az OLVASÁS eleve tiltva
   volt (`clipboard-read=()`): a vágólap olvasását egy támadó használná. */

/* A fejléc értéke egy helyen, felsorolva — hogy látszódjon, mit tiltunk. A sorrend
   nem számít. */
const POLICY = [
    "accelerometer=()",
    "camera=()",
    "geolocation=()",
    "gyroscope=()",
    "magnetometer=()",
    "microphone=()",
    "payment=()",
    "usb=()",
    "midi=()",
    "display-capture=()",
    "clipboard-read=()",
    "clipboard-write=()",
].join(", ");

function permissionsPolicy(request, response, next) {
    response.setHeader("Permissions-Policy", POLICY);
    next();
}

module.exports = {permissionsPolicy};
