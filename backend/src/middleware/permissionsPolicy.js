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
   képességeket az app kódja sehol nem használja (kamera, geolokáció, USB…), egyet
   kivéve.

   ⚠ A VÁGÓLAP KIVÉTEL — és miért nem tiltjuk teljesen. MÉRVE: a frontend
   clipboard.ts a `navigator.clipboard.writeText`-tel másol (az idézet-megosztás
   gombja, Quotes/shareButton.tsx). Ha a `clipboard-write`-ot tiltanánk, a megosztás
   NÉMÁN elromlana (a böngésző nem dob feltűnő hibát, csak nem másol). Ezért
   `clipboard-write=(self)` — az azonos origin írhat a vágólapra —, viszont
   `clipboard-read=()` teljesen tiltva: OLVASNI a vágólapról soha nem akarunk, azt
   egy támadó használná (a felhasználó máshonnan másolt titkainak kiolvasására).

   ⚠ ÉLESÍTÉS ELŐTT: a megosztás gombot kézzel is ki kell próbálni — a
   `clipboard-write=(self)` hibás elgépelése épp azt törné el, amit védeni akarunk. */

/* A fejléc értéke egy helyen, felsorolva — hogy látszódjon, mit tiltunk és mit
   engedünk. A sorrend nem számít; a `clipboard-*` a végén, mert az a kivétel. */
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
    "clipboard-write=(self)",
].join(", ");

function permissionsPolicy(request, response, next) {
    response.setHeader("Permissions-Policy", POLICY);
    next();
}

module.exports = {permissionsPolicy};
