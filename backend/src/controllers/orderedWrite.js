/* ELTOLÁS → ÍRÁS, VISSZAVÉTELLEL — szekciótól és művelettől függetlenül.

   Három végpont (módosítás, törlés, átsorolás) ugyanabból a két lépésből áll:
   told el a szomszédokat, majd írd az elemet. A pár NEM atomi — tranzakció nincs
   (mérve: a FerretDB v2 a `commitTransaction` parancsot sem ismeri) —, tehát ha a
   MÁSODIK lépés elbukik, az első ottmarad.

   Ami ilyenkor a listában marad, az nem "kicsit rossz": két elem ugyanazon a
   sorszámon, vagy hézag ott, ahol nem lehetne. A rendezés és a húzás is ezekből a
   számokból dolgozik, és semmi nem hibázik közben — a felhasználó annyit lát,
   hogy a mentés nem sikerült, nem azt, hogy a listája azóta romlott.

   A KÜLÖNBSÉG A LÉTREHOZÁSHOZ KÉPEST (createOnce.js): ott az ÍRÁS az első lépés
   (az egyedi index az atomi kapunk az ismétlés ellen), tehát ott a beszúrást kell
   visszavenni. Itt az ELTOLÁS az első, tehát azt.

   HA A VISSZAVÉTEL IS ELBUKIK, nincs több eszközünk: a hívó akkor is az EREDETI
   hibát kapja meg, mert az mondja meg, mi történt valójában. A visszavétel hibáját
   elnyeljük — egy másodlagos hiba, ami elfedi az elsőt, csak nehezíti a
   megértést. */

/**
 * @param shift  a szomszédok eltolása (ordering.js)
 * @param write  magának az elemnek az írása
 * @param undo   az eltolás visszavétele (ordering.js `undoShiftFor…`)
 * @returns az írás eredménye; bukásnál az EREDETI hibával utasítódik el
 */
async function shiftThenWrite({shift, write, undo}) {
    await shift();
    try {
        return await write();
    } catch (error) {
        await undo().catch(() => undefined);
        throw error;
    }
}

module.exports = {shiftThenWrite};
