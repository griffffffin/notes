import {flip, offset, shift} from "@floating-ui/dom";

/* A tooltipek POZICIONÁLÓ szabályai — EGY helyen, mert mind a négy tooltipünk
   (kötelező-mező hibabuborék, sorszám-stepper, betűméret-stepper, jelszó-súgó)
   ugyanazt a viselkedést várja el, és a bajt is ugyanaz okozta.

   Mi ez egyáltalán? A react-tooltip a pozicionálást a floating-ui nevű könyvtárra
   bízza. Ott a számítás apró, egymás után futó lépésekből — "middleware"-ekből —
   áll, mindegyik egy dolgot igazít a buborékon:
     - offset(10): a buborékot 10 px-re eltolja a horgonytól (hogy ne tapadjon rá);
     - flip: ha a kért oldalon KILÓG a képernyőről, ÁTTESZI egy másik oldalra;
     - shift: a buborékot a saját oldalán belül elCSÚSZTATJA, hogy beférjen.

   MIÉRT ÍRJUK FELÜL a react-tooltip alapértelmezését? Mert az így szól:
   `flip({fallbackAxisSideDirection: "start"})` — a flip pedig alapból a KERESZT-
   irányú kilógást is nézi (crossAxis: true). Telefon-szélességen a hibabuborék
   (~200 px) a mező bal széléhez horgonyzott pontra KÖZÉPRE kerülne, tehát balra
   kilógna a képernyőről; ettől a flip elvetette a "lefelé" irányt, és mivel a
   "felfelé" is ugyanúgy kilógott, a `fallbackAxisSideDirection` engedélyével átugrott
   a MÁSIK TENGELYRE: a buborék OLDALRA, jobbra nyílt ki, rá a mezőre. (Mérve
   2026-08-01, 408 px széles nézetben; asztali szélességen sosem jött elő, mert ott
   a horgony messze van a képernyő szélétől.)

   A javítás tehát: a flip CSAK a saját tengelyén (fent/lent) dönthessen, a
   vízszintes kilógást pedig a shift oldja meg elcsúsztatással — így a buborék
   iránya (lefelé) telefonon is ugyanaz marad, csak beljebb csúszik, a nyila
   pedig továbbra is a mezőre mutat.

     - crossAxis: false → a kereszt-irányú kilógás NEM billentheti át a buborékot;
     - fallbackAxisSideDirection: "none" → tiltjuk a másik tengelyre ugrást is
       (öv és nadrágtartó: ha a flip egyszer mégis megbukna a saját tengelyén,
       akkor se induljon oldalra);
     - shift padding: 8 → a buborék legalább 8 px-re marad a képernyő szélétől.

   FONTOS: ha a middleware-eket kézzel adjuk meg, a react-tooltip `offset` PROPJA
   hatástalanná válik (az alapértelmezett listát cseréljük le, amiben az offset is
   benne volt) — ezért szerepel itt is a 10 px, a könyvtár alapértékével egyezően.
   Ha valahol más térköz kellene, az offset(...) értékét kell ott felülírni. */
export const TOOLTIP_MIDDLEWARES = [
    offset(10),
    flip({crossAxis: false, fallbackAxisSideDirection: "none"}),
    shift({padding: 8}),
];
