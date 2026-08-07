/* CSS-VÁLTOZÓK, amiket JSX-ből, a style={{…}} objektumban adunk át.

   Miért kell ez a fájl? A React `style` propjának típusa (CSSProperties) a
   csstype csomagból jön, és az CSAK az ismert CSS-tulajdonságokat engedi — ez a
   szigor a haszna: egy elgépelt `colr` vagy `wihteSpace` így fordítási hiba, nem
   néma hatástalanság. Csakhogy ugyanez a szigor a saját `--` kezdetű
   változóinkat is kizárja, pedig azok érvényes CSS-t adnak.

   A `declare module` itt MODUL-KIEGÉSZÍTÉS (module augmentation): nem felülírja a
   csstype típusait, hanem HOZZÁÍR a `Properties` interfészéhez — az interfészek
   ugyanis nyitottak, több deklaráció összeolvad. Az `import` csak azért van itt,
   hogy a fájl modulnak számítson (kiegészíteni csak modulból lehet); nem hoz be
   nevet, és futásidejű kódot sem eredményez — .d.ts fájlból semmi nem fordul le.

   MIÉRT NEVENKÉNT, és nem egy általános `[key: \`--${string}\`]: string` szabály?
   Mert az mindent átengedne: a `--qoute-fs` elgépelés némán hatástalan maradna
   (a böngésző elfogadja az ismeretlen változót, a stílus csak nem érvényesül).
   Egy új CSS-változó felvétele egy sor itt — cserébe a nevét ellenőrzik. */
import type {} from "csstype";

declare module "csstype" {
    interface Properties {
        /* A per-idézet betűméret, százalékos szövegként ("155%"). Beállítja a
           kártya (Link/quoteUpdate), a szerkesztő előnézete (Quotes/save) és a
           publikus nézet (Quotes/public); olvassa az index.css .caveat szabálya. */
        "--quote-fs"?: string;
    }
}
