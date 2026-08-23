/* TELJES OLDAL-ÚJRATÖLTÉS A KIJELENTKEZÉS VÉGÉN.

   MIÉRT NEM ELÉG A SPA-VÁLTÁS. A süti törlésekor a React egyszerűen átvált a
   belépő képernyőre: a route-fa lecserélődik, a komponensek levállnak. A
   DOKUMENTUM viszont ugyanaz marad, és vele a JavaScript heap is — a legutóbb
   megnyitott jegyzet szövege, a lista, a szerkesztő állapota mind ott fekszik a
   memóriában, elérhetően. Egy nyitva felejtett lapon (közös gép, kölcsönadott
   laptop) a devtools ezt kiolvassa; a "kijelentkeztem" a képernyőn igaz, a gép
   belsejében nem.

   A `location.href` értékadása ezzel szemben ELDOBJA a teljes dokumentumot: új
   lap, üres heap, semmi nem marad az előző munkamenetből. Néhány karakternyi
   kód, és pont az a kockázat szűnik meg vele, amit a rövid token-lejárat és a
   munkamenet-visszavonás nem tud kezelni — azok a SZERVERT védik, ez a GÉPET.

   MIÉRT KÜLÖN MODUL EGYETLEN SORÉRT. Mert így tesztelhető. A jsdom nem valósítja
   meg a navigációt: a `location.href` írása ott nem tölt újra semmit, csak egy
   "Not implemented" bejegyzést hagy a konzolon — vagyis a tesztben sem
   megfigyelni, sem megakadályozni nem lehetne. Egy önálló modult viszont a teszt
   ki tud cserélni, és meg tudja kérdezni tőle, hogy meghívták-e. A gyökérre
   megyünk, nem az aktuális címre: kijelentkezés után minden útvonal a belépő
   képernyőre visz, és a régi cím (pl. egy idézet szerkesztője) nem való a
   böngésző előzményébe sem. */
export function reloadToRoot(): void {
    window.location.href = "/";
}
