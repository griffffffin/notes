/* EGY ELEM KIVÉTELE TÖMBBŐL — hangosan, ha nincs ott.

   Miért kell ez a segéd. A `noUncheckedIndexedAccess` óta a `tomb[0]` típusa
   `T | undefined`, mert a fordító nem tudja, van-e ott elem — és ez a TESZTEKBEN
   is felgyullad, tipikusan a kémek hívásainál (`spy.mock.calls[0]`).

   Két rossz megoldás van, és mindkettőt kerüljük:
     - `!` vagy `as`: elhallgattatja a fordítót, de nem vizsgál semmit. Ha a hívás
       mégsem történt meg, az `undefined` továbbcsúszik, és a teszt egy egészen
       más helyen, félrevezető üzenettel bukik el ("cannot read property of
       undefined") — pont ott, ahol már nem látszik, hogy a KÉRÉS maradt el;
     - `?.` mindenütt: a hiányzó elemből `undefined` lesz, amit egy `toBe(...)`
       csendben elfogadhat rossz állításnak, vagy a teszt "zölden" siklik át.

   Ez a segéd VALÓDI vizsgálat, és a hibaüzenete megmondja, mi hiányzik: ha nincs
   annyiadik elem, a teszt AZONNAL, a hiány helyén bukik el, névvel és hosszal.

   Csak tesztekben használjuk: az éles kódban a hiányzó elem nem "lehetetlen
   eset", hanem kezelendő ág (l. Quotes/bold.tsx, CardList/useSortableCards.ts). */

export function at<T>(items: readonly T[], index: number, what = "elem"): T {
    const item = items[index];
    if (item === undefined)
        throw new Error(
            `Nincs ${what} a(z) ${index}. helyen (a lista hossza ${items.length}). ` +
            "A várt hívás/elem elmaradt — ezt a tesztet nem az indexelés buktatta el.");
    return item;
}
