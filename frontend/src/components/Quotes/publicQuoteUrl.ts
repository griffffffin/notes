import type {Id, Quote} from "../../types/api";
import {PATHS} from "../../paths";

/* Egy idézet PUBLIKUS (megosztható) címe — ugyanaz az útvonal, amit a
   routes.tsx a /quotes/:author/:id route-on kiszolgál, és amit kijelentkezve is
   meg lehet nyitni. Maga az útvonal a PATHS.publicQuote builderéből jön: az
   adja a route MINTÁJÁT is, tehát a kettő nem tud elcsúszni egymástól.

   A szerző-szegmens NEM lehet üres (az útvonal szétesne tőle), ezért a névtelen
   idézetek az "Anonymous" jelölőt kapják — pontosan úgy, mint a szerző-szűrt
   nézet (l. Quotes/read.tsx és Navbar/quoteSearch.tsx). A publikus nézet magát a
   szegmenst nem használja (az id egyedi), csak olvashatóvá teszi a linket.

   Az `origin` (pl. "http://otthon:3001") azért PARAMÉTER és nem a window-ból
   olvasott érték, hogy a függvény tiszta maradjon: így tesztelhető, és a hívó
   dönti el, honnan jön (élesben a window.location.origin).

   A szóköz/ékezet/perjel kódolását a builder végzi: e nélkül egy "Márai Sándor"
   szerzőnév szóköze törné a linket, egy perjel pedig új útvonal-szegmenst
   nyitna. */
/* A jelölő ma HÁROM helyen él szó szerint (itt, a Quotes/read.tsx szűrőjében és a
   Navbar/quoteSearch.tsx-ben) — összevonni majd akkor érdemes, ha lesz egy közös
   idézet-konstansfájl; addig egy exportálatlan const, hogy ne lógjon ki
   használatlan exportként (knip). */
const ANONYMOUS_AUTHOR = "Anonymous";

/* Az `author` SZÁNDÉKOSAN a Quote típusából származik (`Quote["author"]`), nem
   egy odaírt `string | undefined`: így ha a modellben egyszer kötelezővé válik a
   szerző, ez a függvény azonnal együtt mozdul vele — nem kell észben tartani,
   hogy itt is át kell írni. Ez az egyik fő haszna a szerződés-fájlnak: EGY helyen
   van kimondva, mi micsoda.

   A `| null` a szerződés része, nem engedmény a tesztnek: a szerző a JSON-ból
   `null`-ként is megérkezhet (a Mongo-dokumentumban explicit null állhat ott,
   ahol a séma csak opcionálisnak mondja a mezőt), és a lenti `author?.trim()`
   ezt kezdettől kezeli is. A típus most már kimondja, amit a kód tud — a
   publicQuoteUrl.test "null" esete pontosan ezt rögzíti. */
export function publicQuoteUrl(origin: string, author: Quote["author"] | null, id: Id): string {
    const authorSegment = author?.trim() ? author : ANONYMOUS_AUTHOR;
    return origin + PATHS.publicQuote(authorSegment, id);
}
