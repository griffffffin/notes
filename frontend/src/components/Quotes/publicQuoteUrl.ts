import type {Id, Quote} from "../../types/api";

/* Egy idézet PUBLIKUS (megosztható) címe — ugyanaz az útvonal, amit a
   routes.jsx a /quotes/:author/:id route-on kiszolgál, és amit kijelentkezve is
   meg lehet nyitni.

   A szerző-szegmens NEM lehet üres (az útvonal szétesne tőle), ezért a névtelen
   idézetek az "Anonymous" jelölőt kapják — pontosan úgy, mint a szerző-szűrt
   nézet (l. Quotes/read.jsx és Navbar/quoteSearch.jsx). A publikus nézet magát a
   szegmenst nem használja (az id egyedi), csak olvashatóvá teszi a linket.

   Az `origin` (pl. "http://otthon:3001") azért PARAMÉTER és nem a window-ból
   olvasott érték, hogy a függvény tiszta maradjon: így tesztelhető, és a hívó
   dönti el, honnan jön (élesben a window.location.origin).

   Az encodeURIComponent a szóközt/ékezetet/perjelet kódolja: e nélkül egy
   "Márai Sándor" szerzőnév szóköze törné a linket, egy perjel pedig új
   útvonal-szegmenst nyitna. */
/* A jelölő ma HÁROM helyen él szó szerint (itt, a Quotes/read.jsx szűrőjében és a
   Navbar/quoteSearch.jsx-ben) — összevonni majd akkor érdemes, ha lesz egy közös
   idézet-konstansfájl; addig egy exportálatlan const, hogy ne lógjon ki
   használatlan exportként (knip). */
const ANONYMOUS_AUTHOR = "Anonymous";

/* Az `author` SZÁNDÉKOSAN a Quote típusából származik (`Quote["author"]`), nem
   egy odaírt `string | undefined`: így ha a modellben egyszer kötelezővé válik a
   szerző, ez a függvény azonnal együtt mozdul vele — nem kell észben tartani,
   hogy itt is át kell írni. Ez az egyik fő haszna a szerződés-fájlnak: EGY helyen
   van kimondva, mi micsoda. */
export function publicQuoteUrl(origin: string, author: Quote["author"], id: Id): string {
    const authorSegment = author?.trim() ? author : ANONYMOUS_AUTHOR;
    return `${origin}/quotes/${encodeURIComponent(authorSegment)}/${encodeURIComponent(id)}`;
}
