/* AZ ÚJ ELEM AZONOSÍTÓJA — a kliens gyártja, még a mentés előtt.

   MIÉRT A KLIENS. Mert csak így lehet a létrehozás IDEMPOTENS. Ha az azonosítót a
   szerver adná, akkor egy megismételt kérés — az elbukott mentés utáni újranyomás,
   vagy a háttérmentés újrapróbálása (saveRetry.ts) — megkülönböztethetetlen volna
   egy új elemtől, és másodpéldányt hozna létre. A kliens adta azonosítóval a
   szerver az `_id` EGYEDI INDEXÉBŐL látja, hogy ezt a létrehozást már elvégezte
   (l. backend/src/controllers/createOnce.js).

   MIÉRT UGYANOLYAN ALAKÚ, MINT A SZERVERÉ. Egy ObjectId nem tizenkét véletlen
   bájt: az első NÉGY az UNIX-időbélyeg másodpercben, a maradék nyolc véletlen.
   Csupa véletlenből is érvényes azonosító lenne, és ma semmi nem törne el tőle
   (ellenőrizve: a backend sehol nem rendez `_id` szerint, az időbélyeget külön
   `createdAt` mező hordozza) — de az ObjectId időbélyeg-szemantikája ingyen
   megőrizhető, és egy hibakeresés közben kiadott `_id.getTimestamp()` így nem
   hazudik. Négy bájt ára nincs.

   A VÉLETLEN FORRÁSA a `crypto.getRandomValues`, nem a `Math.random`: az utóbbi
   nem kriptográfiai minőségű, és bár itt nem titkot gyártunk, a kiszámíthatóan
   ütköző azonosító valódi kellemetlenség lenne. A böngésző-API mindenütt
   elérhető, ahol ez az app fut (a `crypto` a biztonságos kontextusok
   alapfelszerelése), tehát nincs szükség új függőségre. */

const TIMESTAMP_BYTES = 4;
const RANDOM_BYTES = 8;

const hex = (byte: number) => byte.toString(16).padStart(2, "0");

/** Egy új, ObjectId-alakú azonosító: 24 hexa karakter. */
export function newObjectId(nowMs: number = Date.now()): string {
    /* Az időbélyeg MÁSODPERCBEN, négy bájton — pontosan úgy, ahogy a MongoDB
       teszi. A `>>> 8` (előjel nélküli eltolás) azért kell, mert a `>>` a 32.
       biten előjelesen dolgozna; 2038 után az érték átbillenne negatívba. */
    const seconds = Math.floor(nowMs / 1000);
    const bytes: number[] = [];
    for (let i = TIMESTAMP_BYTES - 1; i >= 0; i--) bytes.push((seconds >>> (i * 8)) & 0xff);

    const random = new Uint8Array(RANDOM_BYTES);
    crypto.getRandomValues(random);
    for (const byte of random) bytes.push(byte);

    return bytes.map(hex).join("");
}
